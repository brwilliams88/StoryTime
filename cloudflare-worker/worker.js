// =====================================================================
//  ███  WORKER REV: v0.10.1  (2026-07-06)  ███
//  Changes since last deploy: IMAGES now stored in Cloudflare R2 (zero egress).
//    - /img/upload writes to R2; /img/delete removes from R2 (+ Supabase cleanup)
//    - /img/sign returns HMAC-signed <worker>/img/get/<id> URLs (App password = key)
//    - NEW public GET /img/get/<id>?exp=&sig= serves bytes from R2, and LAZILY
//      migrates any not-yet-moved image from Supabase Storage (write-through).
//    - /img/usage now sums the R2 bucket.
//  REQUIRES: an R2 bucket bound to this Worker as  IMAGES  (see README).
//  ^^ BUMP THIS LINE EVERY TIME THE WORKER CHANGES. When pasting a new version
//     into the Cloudflare dashboard, check this rev against the deployed one so
//     it's obvious whether you're up to date.
// =====================================================================
// StoryTime — Cloudflare Worker API Proxy
// =====================================================================
// PURPOSE:
//   A tiny "middleman" server. The browser app can't safely hold secret
//   keys, so it sends requests HERE; this Worker attaches the secret key
//   and forwards to OpenAI or Supabase, then returns the response.
//
//   ROUTES (all POST, all require the X-App-Password header):
//     /v1/*                  → forwarded to OpenAI (story + image gen)
//     /db/stories/upsert     → create/update a story row
//     /db/stories/delete     → delete a story row        { id }
//     /db/stories/get        → fetch one full story      { id }
//     /db/stories/list       → list story metadata        { sort, search, limit, offset }
//     /db/characters/upsert  → create/update a character
//     /db/characters/delete  → delete a character        { id }
//     /db/characters/list    → list all characters
//     /img/upload            → store an image            { id, b64, contentType }
//     /img/sign              → signed view URLs          { ids: [...] , expiresIn? }
//     /img/delete            → delete images             { ids: [...] }
//
// SECURITY:
//   1. X-App-Password must match the APP_PASSWORD secret.
//   2. Supabase calls use SUPABASE_SECRET_KEY (the "Secret Key"),
//      which bypasses Row-Level Security. The browser never sees it.
//
// REQUIRED ENV (set in Cloudflare → Worker → Settings → Variables):
//   APP_PASSWORD          (secret)  — existing
//   OPENAI_API_KEY        (secret)  — existing
//   SUPABASE_URL          (variable) e.g. https://xxxx.supabase.co
//   SUPABASE_SECRET_KEY   (secret)   the Supabase "Secret Key"
//
// HOW TO UPDATE:
//   This file is the reference copy in the repo. Paste its contents into
//   the Cloudflare Worker editor and click "Deploy."
// =====================================================================

const IMAGE_BUCKET = 'story-images';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return handleCORSPreflight();

    const reqUrl = new URL(request.url);

    // ---- PUBLIC image serving (GET) — NOT password-gated, because <img src>
    //      can't send headers. Access is guarded by the HMAC-signed URL instead. ----
    if (request.method === 'GET' && reqUrl.pathname.startsWith('/img/get/')) {
      return await imgServe(env, reqUrl, ctx);
    }

    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

    // ---- Password gate (protects every route) ----
    const submittedPassword = request.headers.get('X-App-Password');
    if (!submittedPassword || submittedPassword !== env.APP_PASSWORD) {
      return jsonResponse({ error: 'Unauthorized — invalid password' }, 401);
    }

    const path = new URL(request.url).pathname;

    try {
      // ---- OpenAI passthrough (unchanged) ----
      if (path.startsWith('/v1/')) return await proxyOpenAI(request, env, path);

      // Everything below is JSON in / JSON out
      const body = await readBody(request);

      // ---- Supabase: database ----
      if (path === '/db/stories/upsert')    return await dbUpsert(env, 'stories', body);
      if (path === '/db/stories/delete')    return await dbDelete(env, 'stories', body.id);
      if (path === '/db/stories/get')       return await dbGet(env, 'stories', body.id);
      if (path === '/db/stories/list')      return await listStories(env, body);
      if (path === '/db/characters/upsert') return await dbUpsert(env, 'characters', body);
      if (path === '/db/characters/delete') return await dbDelete(env, 'characters', body.id);
      if (path === '/db/characters/list')   return await listCharacters(env, body);

      // ---- Image storage (now Cloudflare R2; Supabase kept as lazy fallback) ----
      if (path === '/img/upload') return await imgUpload(env, body);
      if (path === '/img/sign')   return await imgSign(env, body, reqUrl);
      if (path === '/img/delete') return await imgDelete(env, body);
      if (path === '/img/usage')  return await imgUsage(env);

      // ---- Supabase: API-spend ledger (cross-device) ----
      if (path === '/spend/add')  return await spendAdd(env, body);
      if (path === '/spend/list') return await spendList(env);

      return jsonResponse({ error: 'Unknown endpoint: ' + path }, 404);
    } catch (err) {
      return jsonResponse({ error: 'Worker error', detail: err.message }, 500);
    }
  },
};

// =====================================================================
// Supabase — API-spend ledger (append-only events, aggregated client-side)
// =====================================================================
async function spendAdd(env, body) {
  const events = (body && body.events) || [];
  if (!Array.isArray(events) || !events.length) return jsonResponse({ ok: true, inserted: 0 });
  const rows = events.map(e => ({
    ts: e.ts ? new Date(e.ts).toISOString() : new Date().toISOString(),
    category: String(e.category || 'other'),
    amount: Number(e.amount) || 0,
  })).filter(r => r.amount > 0);
  if (!rows.length) return jsonResponse({ ok: true, inserted: 0 });
  const res = await fetch(sbRest(env, 'spend_events'), {
    method: 'POST',
    headers: sbHeaders(env, { 'Prefer': 'return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) return jsonResponse({ error: 'Spend add failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true, inserted: rows.length });
}

async function spendList(env) {
  // Return every event (personal-use table stays small); client aggregates.
  const res = await fetch(sbRest(env, 'spend_events?select=ts,category,amount&order=ts.asc'), {
    headers: sbHeaders(env),
  });
  if (!res.ok) return jsonResponse({ error: 'Spend list failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true, events: await res.json() });
}

// =====================================================================
// OpenAI
// =====================================================================
async function proxyOpenAI(request, env, endpoint) {
  const requestBody = await request.text();
  let openaiResponse;
  try {
    openaiResponse = await fetch(`https://api.openai.com${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: requestBody,
    });
  } catch (err) {
    return jsonResponse({ error: 'Failed to reach OpenAI', detail: err.message }, 502);
  }
  const responseBody = await openaiResponse.text();
  return new Response(responseBody, {
    status: openaiResponse.status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// =====================================================================
// Supabase — database (PostgREST)
// =====================================================================
function sbHeaders(env, extra = {}) {
  return {
    'apikey': env.SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}
function sbRest(env, pathAndQuery) {
  return `${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`;
}

// Insert-or-update a row (conflict on primary key `id`)
async function dbUpsert(env, table, row) {
  if (!row || !row.id) return jsonResponse({ error: 'Missing row.id' }, 400);
  const res = await fetch(sbRest(env, table), {
    method: 'POST',
    headers: sbHeaders(env, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) return jsonResponse({ error: 'DB upsert failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true });
}

async function dbDelete(env, table, id) {
  if (!id) return jsonResponse({ error: 'Missing id' }, 400);
  const res = await fetch(sbRest(env, `${table}?id=eq.${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: sbHeaders(env, { 'Prefer': 'return=minimal' }),
  });
  if (!res.ok) return jsonResponse({ error: 'DB delete failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true });
}

async function dbGet(env, table, id) {
  if (!id) return jsonResponse({ error: 'Missing id' }, 400);
  const res = await fetch(sbRest(env, `${table}?id=eq.${encodeURIComponent(id)}&select=*`), {
    headers: sbHeaders(env, { 'Accept': 'application/vnd.pgrst.object+json' }),
  });
  if (res.status === 406 || res.status === 404) return jsonResponse({ ok: true, row: null });
  if (!res.ok) return jsonResponse({ error: 'DB get failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true, row: await res.json() });
}

// Lightweight list for the Library view (metadata only, not the big `data` blob)
async function listStories(env, opts) {
  opts = opts || {};
  const order = opts.sort === 'last_read'
    ? 'last_read_at.desc.nullslast'
    : 'created_at.desc';
  const limit = Math.min(parseInt(opts.limit, 10) || 100, 200);
  const offset = parseInt(opts.offset, 10) || 0;
  const cols = 'id,title,created_by,genre,age_range,art_style,theme,summary,character_names,rating,created_at,last_read_at,cover_image_id';
  let q = `stories?select=${cols}&order=${order}&limit=${limit}&offset=${offset}`;

  if (opts.search && String(opts.search).trim()) {
    // Full-text search over the whole story (title + characters + summary + page text)
    const pat = '*' + encodeURIComponent(String(opts.search).trim().toLowerCase()) + '*';
    q += `&search_text=ilike.${pat}`;
  }

  const res = await fetch(sbRest(env, q), { headers: sbHeaders(env) });
  if (!res.ok) return jsonResponse({ error: 'List failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true, rows: await res.json() });
}

// Characters are small — return them in full (the app needs their data)
async function listCharacters(env, opts) {
  const res = await fetch(sbRest(env, 'characters?select=*&order=created_at.desc'), {
    headers: sbHeaders(env),
  });
  if (!res.ok) return jsonResponse({ error: 'List failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true, rows: await res.json() });
}

// =====================================================================
// Image storage — Cloudflare R2 (zero egress).  env.IMAGES = R2 bucket binding.
// Supabase Storage is kept read-only as a lazy-migration fallback: any image
// not yet in R2 is pulled from Supabase on first view and copied into R2.
// =====================================================================

// Upload a new image straight to R2.
async function imgUpload(env, body) {
  const { id, b64, contentType } = body || {};
  if (!id || !b64) return jsonResponse({ error: 'Missing id or b64' }, 400);
  const bytes = base64ToBytes(b64);
  await env.IMAGES.put(id, bytes, { httpMetadata: { contentType: contentType || 'image/jpeg' } });
  return jsonResponse({ ok: true, id });
}

// Return HMAC-signed, short-lived URLs pointing back at THIS Worker's public
// GET route. <img src> works (no headers needed); access is guarded by the sig.
// We sign every requested id without checking existence — a missing one just
// 404s on GET and the client falls back (matches the old Supabase behaviour).
async function imgSign(env, body, reqUrl) {
  const ids = (body && (body.ids || (body.id ? [body.id] : []))) || [];
  if (!ids.length) return jsonResponse({ error: 'Missing ids' }, 400);
  const expiresIn = (body && body.expiresIn) || 3600;
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const base = `${reqUrl.origin}/img/get/`;
  const urls = {};
  for (const id of ids) {
    const sig = await hmacHex(env.APP_PASSWORD, id + ':' + exp);
    urls[id] = `${base}${encodeURIComponent(id)}?exp=${exp}&sig=${sig}`;
  }
  return jsonResponse({ ok: true, urls });
}

// PUBLIC: serve an image by id from R2, verifying the HMAC-signed URL. If the
// object isn't in R2 yet, pull it from Supabase Storage, serve it, and copy it
// into R2 (write-through migration — happens transparently as books are viewed).
async function imgServe(env, reqUrl, ctx) {
  const id = decodeURIComponent(reqUrl.pathname.slice('/img/get/'.length));
  const exp = Number(reqUrl.searchParams.get('exp') || 0);
  const sig = reqUrl.searchParams.get('sig') || '';
  if (!id) return new Response('Missing id', { status: 400 });
  if (!exp || exp < Math.floor(Date.now() / 1000)) return new Response('URL expired', { status: 403 });
  const expect = await hmacHex(env.APP_PASSWORD, id + ':' + exp);
  if (sig !== expect) return new Response('Bad signature', { status: 403 });

  // 1) R2 (the normal path once migrated)
  const obj = await env.IMAGES.get(id);
  if (obj) return new Response(obj.body, { headers: imgHeaders(obj.httpMetadata && obj.httpMetadata.contentType) });

  // 2) Lazy fallback: Supabase Storage → serve + copy into R2
  const sbUrl = `${env.SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}/${encodeURIComponent(id)}`;
  const sbRes = await fetch(sbUrl, {
    headers: { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}` },
  });
  if (!sbRes.ok) return new Response('Not found', { status: 404 });
  const buf = await sbRes.arrayBuffer();
  const ct = sbRes.headers.get('content-type') || 'image/jpeg';
  if (ctx && ctx.waitUntil) ctx.waitUntil(env.IMAGES.put(id, buf, { httpMetadata: { contentType: ct } }).catch(() => {}));
  return new Response(buf, { headers: imgHeaders(ct) });
}

// Sum the size + count of every object in the R2 bucket (paginated).
async function imgUsage(env) {
  let count = 0, bytes = 0, cursor;
  for (let i = 0; i < 100; i++) {
    const list = await env.IMAGES.list({ limit: 1000, cursor });
    for (const o of list.objects) { count++; bytes += o.size || 0; }
    if (!list.truncated) break;
    cursor = list.cursor;
  }
  return jsonResponse({ ok: true, count, bytes });
}

// Delete from R2, and best-effort from Supabase (in case not migrated yet).
async function imgDelete(env, body) {
  const ids = (body && (body.ids || (body.id ? [body.id] : []))) || [];
  if (!ids.length) return jsonResponse({ error: 'Missing ids' }, 400);
  await Promise.all(ids.map((id) => env.IMAGES.delete(id).catch(() => {})));
  try {
    await fetch(`${env.SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}`, {
      method: 'DELETE', headers: sbHeaders(env), body: JSON.stringify({ prefixes: ids }),
    });
  } catch (e) { /* best-effort */ }
  return jsonResponse({ ok: true });
}

// ---- HMAC + image response helpers ----
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function imgHeaders(contentType) {
  return {
    'Content-Type': contentType || 'image/jpeg',
    'Access-Control-Allow-Origin': '*',
    // image ids are content-immutable, so let the browser + Cloudflare edge cache hard
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
}

// =====================================================================
// Helpers
// =====================================================================
async function readBody(request) {
  const t = await request.text();
  if (!t) return {};
  try { return JSON.parse(t); } catch (e) { return {}; }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function handleCORSPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Password',
      'Access-Control-Max-Age': '86400',
    },
  });
}
