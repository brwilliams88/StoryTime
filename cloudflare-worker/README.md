# Cloudflare Worker — StoryTime API Proxy

This folder contains the source code for the StoryTime API proxy.

## Important
**This code is NOT deployed via GitHub.** The actual running code lives in
the Cloudflare dashboard at https://dash.cloudflare.com → Workers & Pages.

This local copy exists so:
- We have a reference / backup of the worker code in version control
- We can edit it here and paste updates into the Cloudflare editor
- Changes can be reviewed in pull requests / commits like any other code

## How to update the deployed worker
1. Edit `worker.js` in this folder
2. Open the Cloudflare dashboard → your Worker → "Edit code"
3. Paste the new contents
4. Click **Deploy**

## Secrets (set in Cloudflare dashboard, NOT in this code)
- `OPENAI_API_KEY` — your OpenAI API key
- `APP_PASSWORD` — the password the StoryTime app must send to use this Worker
  (also used as the HMAC key that signs image URLs — no separate secret needed)
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY` — for the database + lazy image migration

## R2 image storage (added WORKER REV v0.10.1)
Images now live in Cloudflare R2 (zero egress) instead of Supabase Storage.
The DB (stories/characters/spend) stays on Supabase.

One-time setup in the Cloudflare dashboard:
1. **R2** → *Create bucket* → name it `storytime-images` (any name; enabling R2
   is free but Cloudflare may ask for a card on file — the free tier is 10 GB
   storage + zero egress fees).
2. Your Worker → **Settings → Variables and Secrets → Bindings → + Add → R2
   bucket**. Set **Variable name = `IMAGES`** and select the bucket. Save.
3. Paste the new `worker.js` and **Deploy**.

Migration is automatic + gradual: new images write straight to R2; older images
in Supabase Storage are copied into R2 the first time they're viewed
(write-through). Nothing to run by hand; Supabase Storage can be emptied later
once everything's been accessed at least once.
