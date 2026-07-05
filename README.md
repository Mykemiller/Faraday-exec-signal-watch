# Faraday — Executive Signal Watch (AUTO-179)

Nightly rotation crawler that re-checks the **Data Center People** roster
(Airtable `tblEJnllPN6kywL7E`, base `appxfti7VuoHYUeu6`), confirms each
executive's current title/employer, detects outstanding signals (role change,
media mention, speaking appearance, notable social activity), and writes one
artifact per signal into the Faraday corpus (`public.artifacts`,
Supabase `ycadmmngkdhvpcsrcuaq`).

Same code path serves two jobs:

- **Seed backfill (one-time)** — `scripts/seed.mjs` over the full roster.
- **Nightly rotation** — Vercel Cron hits `/api/cron/exec-signal-watch`,
  processing the `BATCH_SIZE` records with the oldest `Last Checked` first.

## How a record is classified

Anthropic Messages API + the `web_search` server tool run two searches per
person (`"{Name}" {Employer}` and `"{Name}" data center OR AI infrastructure`)
and return a strict JSON verdict. From it:

| Airtable `Tracking Status` | when |
|---|---|
| `Signal Detected` | an outstanding signal was found |
| `Needs Review` | title or employer could not be confirmed (no signal) |
| `Confirmed` | title + employer confirmed, no signal |
| `Unreachable` | the search/classify step errored (batch continues) |

`Signal Type` (`Job Change` / `Media Mention` / `Speaking Engagement` /
`Social Activity` / `None`) is the human label; it maps to the fixed Supabase
`source_type_enum` (`web_news` / `social` / `job_posting`). The enum is **never**
expanded.

> **iM100 rule:** the `Current Title` field often holds an Infrastructure Masons
> recognition ("iM100 Award Winner") instead of a job title. The classifier
> treats these as *unknown* titles and confirms the real title from search.

## Taxonomy contract (do not rename)

The model returns exactly:

```json
{
  "title_confirmed": true,
  "employer_confirmed": true,
  "signal_detected": true,
  "signal_type": "Job Change | Media Mention | Speaking Engagement | Social Activity | None",
  "source_type": "job_posting | social | web_news | none",
  "signal_summary": "one sentence",
  "source_url": "https://…",
  "published_date": "YYYY-MM-DD or ''"
}
```

> Note: the original spec used a single `signal_type` field spanning both the
> Airtable label and the Supabase enum. Those are two different taxonomies, so
> this build splits them — `signal_type` (human) + `source_type` (storage).

## Idempotency

- **Artifacts** dedupe on `content_hash = sha256(source_url + signal_summary)`
  via the `artifacts_content_hash_key` UNIQUE index (`resolution=ignore-duplicates`).
- **`Last Signal Detected`** is only re-stamped when a *new* artifact is written;
  a duplicate leaves it unchanged, so re-runs don't churn the tracking fields.
- Safe to re-run at any time.

## Rotation cadence

`ceil(311 / BATCH_SIZE)` days per full pass. At the default `BATCH_SIZE=40`
that is **~8 days** (the roster is 311 records as of 2026-07-05, not 512).

## Schedule / DST

Two UTC crons (`0 7 * * *`, `0 8 * * *`) plus an `America/Chicago` hour-2 guard
in the route fire the crawl **exactly once at 02:00 local**, year-round. Manual
runs bypass the guard.

## Endpoints

```
GET /api/cron/exec-signal-watch                      # scheduled (Bearer CRON_SECRET)
GET /api/cron/exec-signal-watch?force=1              # run now, bypass hour guard
GET /api/cron/exec-signal-watch?dry_run=true&secret=$CRON_SECRET   # 5-person preview, no writes
```

All require `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this
automatically) or `?secret=$CRON_SECRET` for manual calls.

## Environment

See `.env.example`. Secrets (`ANTHROPIC_API_KEY`, `AIRTABLE_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) are Vercel env vars — never
hardcoded. `ANTHROPIC_MODEL` and `BATCH_SIZE` are tunable without a redeploy.

## Run the seed

```bash
node scripts/seed.mjs --dry-run --limit 10   # preview, no writes
node scripts/seed.mjs                         # full roster (writes)
```

## Test

```bash
npm test    # node:test — pure classify/hash logic, no network
```

## Governance

- Branch + draft PR only; **no production deploy** without sign-off.
- No schema changes to `public.artifacts` or Data Center People without a named
  migration and separate approval.
- AUTO-179 is registered in the Automation Registry as **Designed**.
