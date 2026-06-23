-- ============================================================
-- StoryTime — Supabase schema (v0.7)
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Safe to re-run (everything is "if not exists" / "or replace").
-- ============================================================

-- Optional speed-up: lets us do fast fuzzy text search (ILIKE) on
-- titles and character names for the Library view.
create extension if not exists pg_trgm;

-- ------------------------------------------------------------
-- CHARACTERS
-- One row per saved character. The FULL character object lives in
-- `data` (jsonb). The columns above it are copies we sort/search on.
-- ------------------------------------------------------------
create table if not exists public.characters (
  id            text primary key,             -- client id, e.g. "char_1718..."
  name          text not null,
  tagline       text,
  data          jsonb not null,               -- full character object
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists characters_created_idx   on public.characters (created_at desc);
create index if not exists characters_lastused_idx  on public.characters (last_used_at desc nulls last);
create index if not exists characters_name_trgm     on public.characters using gin (name gin_trgm_ops);

-- ------------------------------------------------------------
-- STORIES
-- One row per generated book. The FULL book (pages, cover, quiz,
-- image references, costs…) lives in `data` (jsonb). The columns
-- above it drive the Library view's sort + search.
-- NOTE: the image FILES are not stored here — they live in the
-- "story-images" Storage bucket; `data` only holds their ids/paths.
-- ------------------------------------------------------------
create table if not exists public.stories (
  id               text primary key,          -- client id, e.g. "story_1718..."
  title            text,
  created_by       text,
  genre            text,
  age_range        text,
  theme            text,
  summary          text,
  character_names  text,                       -- e.g. "Kai Nozomi Bumble" (for search)
  rating           int not null default 0,
  data             jsonb not null,             -- full story object
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_read_at     timestamptz
);

create index if not exists stories_created_idx    on public.stories (created_at desc);
create index if not exists stories_lastread_idx   on public.stories (last_read_at desc nulls last);
create index if not exists stories_title_trgm     on public.stories using gin (title gin_trgm_ops);
create index if not exists stories_chars_trgm     on public.stories using gin (character_names gin_trgm_ops);

-- ------------------------------------------------------------
-- Keep `updated_at` honest: bump it automatically on every UPDATE.
-- (Used later for cross-device sync — newest write wins.)
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists characters_touch on public.characters;
create trigger characters_touch before update on public.characters
  for each row execute function public.touch_updated_at();

drop trigger if exists stories_touch on public.stories;
create trigger stories_touch before update on public.stories
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- SECURITY — Row-Level Security (RLS)
-- We turn RLS ON and add NO policies. Result:
--   • The public "Publishable Key" (anything in the browser) is
--     DENIED all read/write on these tables.
--   • Your Cloudflare Worker uses the "Secret Key", which BYPASSES
--     RLS, so it keeps full access.
-- This is the lock that makes Option A safe even though the tables
-- are exposed through the API.
-- ------------------------------------------------------------
alter table public.characters enable row level security;
alter table public.stories    enable row level security;

-- Done. Next: create the "story-images" Storage bucket (see SETUP.md).


-- ============================================================
-- v0.7.2 migration — run this block once (safe to re-run)
-- Adds a cover-image column for fast Library thumbnails, and
-- backfills the REAL created_at from the stored objects (fixes the
-- migrated rows that all showed the backup date).
-- ============================================================
alter table public.stories add column if not exists cover_image_id text;
update public.stories set cover_image_id = data->'cover'->>'image_id';

update public.stories
  set created_at = (data->>'createdAt')::timestamptz
  where data ? 'createdAt';

update public.characters
  set created_at = (data->>'created_at')::timestamptz
  where data ? 'created_at';


-- ============================================================
-- v0.8.3 migration — run this block once (safe to re-run)
-- Adds an art_style column for the Library's artwork filter, and
-- backfills it from each story's saved form data.
-- ============================================================
alter table public.stories add column if not exists art_style text;
update public.stories
  set art_style = coalesce(
    data->>'art_style',
    nullif(data->'formData'->>'artStyle', 'surprise-me'),
    ''
  )
  where art_style is null;


-- ============================================================
-- v0.8.4 migration — run this block once (safe to re-run)
-- Adds a full-text search column (title + characters + summary + page text)
-- so the Library search can find words inside the story body.
-- ============================================================
alter table public.stories add column if not exists search_text text;
update public.stories
  set search_text = lower(
    coalesce(title,'') || ' ' ||
    coalesce(summary,'') || ' ' ||
    coalesce(character_names,'') || ' ' ||
    coalesce((select string_agg(p->>'text', ' ')
              from jsonb_array_elements(data->'pages') p), '')
  );
create index if not exists stories_searchtext_trgm on public.stories using gin (search_text gin_trgm_ops);


-- ============================================================
-- v0.9.2 migration — run this block once (safe to re-run)
-- API-spend ledger: one append-only row per paid OpenAI call, so the
-- Settings → API Spend panel can total spend ACROSS devices. Accessed
-- only via the Worker's secret (service) key, so no RLS policies needed.
-- The one-time historical baseline ($24.45 through 2026-06-22) stays a
-- client-side constant; this table holds new spend going forward.
-- ============================================================
create table if not exists public.spend_events (
  id        bigint generated always as identity primary key,
  ts        timestamptz not null default now(),
  category  text        not null,   -- 'pictures' | 'text' | 'characters'
  amount    numeric(10,4) not null
);
create index if not exists spend_events_ts_idx on public.spend_events (ts);
