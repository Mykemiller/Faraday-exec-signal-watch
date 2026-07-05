import { selectOldest } from '../../../../lib/airtable.mjs';
import { runPeople } from '../../../../lib/crawl.mjs';
import { BATCH_SIZE } from '../../../../lib/config.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// True when it is 02:00 in America/Chicago (DST-aware). Two UTC crons
// (07:00 + 08:00) straddle CST/CDT; the guard lets exactly one fire the crawl.
function isChicago2AM() {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    hour12: false,
  }).format(new Date());
  return Number(hour) === 2;
}

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === secret;
}

export async function GET(req) {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === 'true';
  const force = url.searchParams.get('force') === '1';
  const batchSize = Number(url.searchParams.get('batch_size')) || BATCH_SIZE;

  // Scheduled fires only run at 02:00 America/Chicago. Manual dry-runs and
  // ?force=1 bypass the guard.
  if (!dryRun && !force && !isChicago2AM()) {
    return Response.json({ ok: true, skipped: 'outside 02:00 America/Chicago window' });
  }

  try {
    const limit = dryRun ? Math.min(batchSize, 5) : batchSize;
    const people = await selectOldest(limit);
    const summary = await runPeople(people, { dryRun });
    // Keep the response light; drop the per-person detail unless it's a dry run.
    const { outcomes, ...rest } = summary;
    return Response.json({ ok: true, ...rest, ...(dryRun ? { outcomes } : {}) });
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
