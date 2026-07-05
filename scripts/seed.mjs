#!/usr/bin/env node
// PROMPT 1 — one-time seed backfill.
// Runs the SAME crawl path as the nightly job over the full Data Center People
// roster, establishing a baseline (Last Checked + Tracking Status on every
// record) so the nightly rotation has real values to rotate against.
//
// Usage:
//   node scripts/seed.mjs --dry-run --limit 10   # preview first N, no writes
//   node scripts/seed.mjs --limit 10             # write first N
//   node scripts/seed.mjs                         # full roster
//
// Requires: ANTHROPIC_API_KEY, AIRTABLE_API_KEY, SUPABASE_URL,
//           SUPABASE_SERVICE_ROLE_KEY.

import { selectAll } from '../lib/airtable.mjs';
import { runPeople } from '../lib/crawl.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const dryRun = process.argv.includes('--dry-run');
const limit = Number(arg('--limit')) || Infinity;
const offset = Number(arg('--offset')) || 0;

const all = await selectAll();
const people = all.slice(offset, offset === 0 && limit === Infinity ? undefined : offset + limit);

console.log(
  `Seed: ${people.length} of ${all.length} records${dryRun ? ' (DRY RUN — no writes)' : ''}`
);

const summary = await runPeople(people, {
  dryRun,
  logHealth: !dryRun,
  notes: `Seed backfill · Log Key: AUTO-179 · ${new Date().toISOString().slice(0, 10)}`,
});

const { outcomes, ...rest } = summary;
console.log(JSON.stringify(rest, null, 2));
if (dryRun) {
  console.log('\n--- per-person preview ---');
  for (const o of outcomes) {
    console.log(
      `${o.person}: ${o.trackingStatus}` +
        (o.signalType && o.signalType !== 'None' ? ` [${o.signalType}]` : '') +
        (o.error ? ` (error: ${o.error})` : '')
    );
  }
}
