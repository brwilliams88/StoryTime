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
