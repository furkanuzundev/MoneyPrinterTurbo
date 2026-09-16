# Video rating — design

**Goal:** learn whether users like the videos Reelate makes, and *why not* when they don't, so the pipeline parts (visuals, voice, captions, script, length) can be improved with data.

## Decisions (brainstorm, 2026-09-16)

- Only videos are rated (no generic `target_type`).
- 5 stars. Reporting treats 4–5 as *positive*, 1–2 as *negative*; average alone is misleading (ratings pile up at the ends).
- After a star is picked: 1–3 stars → "What fell short?" reason chips + optional comment; 4–5 → optional comment only.
- The star click is saved immediately (the cheapest signal is never lost); chips/comment are an optional second "Send".
- Inline, always visible, never a modal. It gets a subtle highlight when the video finishes playing or the user clicks Download, while still unrated.
- One rating per video, editable (upsert).
- Placements: render-complete screen (`done_screen`) and library video modal (`library`). `source` is stored because in-the-moment and later ratings behave differently.
- Implicit signals (download / delete / rerender) are out of scope — phase 2.

## Data

Table `video_feedback`:

| column | type | notes |
|---|---|---|
| id | serial pk | |
| job_id | uuid null → video_jobs.id **on delete set null** | deleting a video must not delete its rating |
| user_id | text → user.id on delete cascade | account deletion removes feedback |
| rating | integer, CHECK 1..5 | |
| tags | jsonb string[] default `[]` | only kept when rating ≤ 3 |
| comment | text null | trimmed, ≤ 1000 chars |
| source | text `done_screen` \| `library` | last place it was saved from |
| snapshot | jsonb | subject, aspect, voice, targetSeconds, hasScenes — survives job deletion |
| created_at / updated_at | timestamp | |

Unique index on `job_id` (a job has exactly one owner). Postgres treats NULLs as distinct, so orphaned rows don't collide.

Tag ids: `visuals`, `voice`, `captions`, `script`, `length`, `other`.

## API

`/api/jobs/[id]/feedback`
- `GET` → `{ feedback: { rating, tags, comment } | null }`
- `PUT` body `{ rating, tags?, comment?, source }` → upsert, returns saved feedback.
- 401 unauthenticated, 404 not owner / missing, 409 job not `done`, 400 invalid rating/source.
- Validation lives in `lib/feedback/rating.ts` (pure, unit-tested).

## UI

`components/dashboard/video-rating.tsx` (client) — props `jobId`, `source`, `nudge`. Fetches its own state on mount so it works in the wizard, the job page and the modal alike.
`CaptionSafeVideo` gains an optional `onEnded`.

## Admin

`admin.reelate.org/feedback`: stat cards (ratings, average, % positive, response rate over done jobs — 30d), star distribution, reason counts among ≤3, breakdown by voice locale / length / aspect, and the latest ratings with comments (filter: low only).
Queries in `lib/admin/queries.ts`, integration-tested against the test DB.

## Other

- Privacy policy mentions ratings/comments and their retention.
- Migration 0004 must be applied to prod **before** merge (auto-deploy does not migrate).
