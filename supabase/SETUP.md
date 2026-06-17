# StoryTime — Supabase setup (v0.7)

Project URL: https://hmhmojxbhpeixuwfzhol.supabase.co
Security model: **Option A** — the browser never talks to Supabase directly.
The Cloudflare Worker talks to Supabase using the **Secret Key**.

## Step 1 — Create the tables

1. Supabase Dashboard → **SQL Editor** (left sidebar) → **New query**.
2. Open `schema.sql` (in this folder), copy all of it, paste into the editor.
3. Click **Run**. You should see "Success. No rows returned."
4. Check **Table Editor** → you should now see `stories` and `characters`.

## Step 2 — Create the image Storage bucket

1. Left sidebar → **Storage** → **New bucket**.
2. Name it exactly: `story-images`
3. **Public bucket: OFF** (keep it Private).
4. Click **Create bucket**.

Why private: images load via short-lived signed URLs minted by the Worker
(matches Option A). We'll wire that up in the Worker step. Image files will be
stored as `story-images/<imageId>.jpg`.

## Step 3 — (later) Worker secrets

When we build the Worker endpoints, you'll add two secrets to the Cloudflare
Worker yourself (like the OpenAI key — never pasted into chat):

- `SUPABASE_URL`  = https://hmhmojxbhpeixuwfzhol.supabase.co
- `SUPABASE_SECRET_KEY` = (the **Secret Key** from Settings → API Keys)

Nothing to do here yet — just know it's coming.
