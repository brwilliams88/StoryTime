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
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return handleCORSPreflight();
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

      // ---- Supabase: image storage ----
      if (path === '/img/upload') return await imgUpload(env, body);
      if (path === '/img/sign')   return await imgSign(env, body);
      if (path === '/img/delete') return await imgDelete(env, body);

      return jsonResponse({ error: 'Unknown endpoint: ' + path }, 404);
    } catch (err) {
      return jsonResponse({ error: 'Worker error', detail: err.message }, 500);
    }
  },
};

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
    const pat = '*' + encodeURIComponent(String(opts.search).trim()) + '*';
    q += `&or=(title.ilike.${pat},character_names.ilike.${pat},theme.ilike.${pat},genre.ilike.${pat},summary.ilike.${pat})`;
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
// Supabase — image storage
// =====================================================================
async function imgUpload(env, body) {
  const { id, b64, contentType } = body || {};
  if (!id || !b64) return jsonResponse({ error: 'Missing id or b64' }, 400);
  const bytes = base64ToBytes(b64);
  const objectUrl = `${env.SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}/${encodeURIComponent(id)}`;
  const res = await fetch(objectUrl, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SECRET_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
      'Content-Type': contentType || 'image/jpeg',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!res.ok) return jsonResponse({ error: 'Image upload failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true, id });
}

// Mint short-lived signed URLs so the browser can display private images
async function imgSign(env, body) {
  const ids = (body && (body.ids || (body.id ? [body.id] : []))) || [];
  if (!ids.length) return jsonResponse({ error: 'Missing ids' }, 400);
  const expiresIn = (body && body.expiresIn) || 3600;

  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${IMAGE_BUCKET}`, {
    method: 'POST',
    headers: sbHeaders(env),
    body: JSON.stringify({ expiresIn, paths: ids }),
  });
  if (!res.ok) return jsonResponse({ error: 'Sign failed', detail: await res.text() }, res.status);

  const arr = await res.json(); // [{ path, signedURL, error }, ...]
  const base = `${env.SUPABASE_URL}/storage/v1`;
  const urls = {};
  for (const item of arr) {
    if (item && item.signedURL) urls[item.path] = base + item.signedURL;
  }
  return jsonResponse({ ok: true, urls });
}

async function imgDelete(env, body) {
  const ids = (body && (body.ids || (body.id ? [body.id] : []))) || [];
  if (!ids.length) return jsonResponse({ error: 'Missing ids' }, 400);
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}`, {
    method: 'DELETE',
    headers: sbHeaders(env),
    body: JSON.stringify({ prefixes: ids }),
  });
  if (!res.ok) return jsonResponse({ error: 'Image delete failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true });
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Password',
      'Access-Control-Max-Age': '86400',
    },
  });
}
