// =====================================================================
// StoryTime — Cloudflare Worker API Proxy
// =====================================================================
// PURPOSE:
//   This is a tiny "middleman" server. The StoryTime app (running in
//   the browser) cannot safely hold the OpenAI API key — anyone could
//   read it. So instead, the browser sends requests HERE, this Worker
//   adds the OpenAI key on the way to OpenAI, and forwards the response
//   back. The browser never sees the key.
//
// SECURITY LAYERS:
//   1. Password header (X-App-Password) must match a secret stored
//      in this Worker's environment.
//   2. Only POST requests to /v1/* OpenAI endpoints are allowed.
//   3. CORS headers limit which sites can call this Worker (we'll
//      tighten this once GitHub Pages URL is confirmed).
//
// HOW TO UPDATE:
//   This file lives in the StoryTime git repo for reference, but the
//   ACTUAL deployed code lives in the Cloudflare dashboard.
//   When you edit this file, paste the new contents into Cloudflare's
//   Worker editor and click "Deploy."
// =====================================================================

export default {
  async fetch(request, env) {
    // ---- CORS preflight ----
    // Browsers send a special "OPTIONS" request before the real one to
    // ask "are you OK with me calling you?" — we have to answer "yes."
    if (request.method === 'OPTIONS') {
      return handleCORSPreflight();
    }

    // ---- Only allow POST ----
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    // ---- Check the password header ----
    // The browser will send X-App-Password with every request.
    // It must match the APP_PASSWORD secret we set in Cloudflare.
    const submittedPassword = request.headers.get('X-App-Password');
    if (!submittedPassword || submittedPassword !== env.APP_PASSWORD) {
      return jsonResponse({ error: 'Unauthorized — invalid password' }, 401);
    }

    // ---- Figure out which OpenAI endpoint to call ----
    // The browser hits us at e.g. /v1/chat/completions and we just
    // forward to https://api.openai.com/v1/chat/completions.
    const url = new URL(request.url);
    const endpoint = url.pathname;

    if (!endpoint.startsWith('/v1/')) {
      return jsonResponse({ error: 'Invalid endpoint — must start with /v1/' }, 400);
    }

    // ---- Forward to OpenAI with the real API key attached ----
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

    // ---- Return OpenAI's response back to the browser ----
    const responseBody = await openaiResponse.text();
    return new Response(responseBody, {
      status: openaiResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};


// ---- Helper: JSON response with CORS headers ----
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}


// ---- Helper: respond to CORS preflight ----
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
