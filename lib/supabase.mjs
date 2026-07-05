import { AUTO_ID, CRAWLER_ID } from './config.mjs';
import { contentHash } from './hash.mjs';

function base() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  return { url: url.replace(/\/$/, ''), key };
}

function restHeaders(key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...extra,
  };
}

// Insert one artifact, idempotent on the content_hash UNIQUE index.
// Returns { inserted: boolean, hash }. On conflict PostgREST returns [] because
// of resolution=ignore-duplicates, so an existing hash is a safe no-op.
export async function insertArtifact(person, result) {
  const { url, key } = base();
  const hash = contentHash(result.source_url, result.signal_summary);
  const row = {
    crawler_id: CRAWLER_ID,
    auto_id: AUTO_ID,
    source_type: result.source_type,
    source_url: result.source_url,
    raw_content: result.signal_summary,
    content_hash: hash,
    // content_length is a GENERATED column in public.artifacts — never write it.
    published_at: result.published_date ? `${result.published_date}T00:00:00Z` : null,
    crawl_metadata: {
      person_record_id: person.id,
      full_name: person.fullName,
      employer: person.employer,
      signal_type: result.signal_type,
    },
    airtable_synced: false,
  };

  const res = await fetch(`${url}/rest/v1/artifacts?on_conflict=content_hash`, {
    method: 'POST',
    headers: restHeaders(key, {
      prefer: 'return=representation,resolution=ignore-duplicates',
    }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`supabase insert ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return { inserted: rows.length > 0, hash };
}

// Flip airtable_synced after the matching Airtable tracking update succeeds.
export async function markSynced(hash) {
  const { url, key } = base();
  const res = await fetch(
    `${url}/rest/v1/artifacts?content_hash=eq.${encodeURIComponent(hash)}`,
    {
      method: 'PATCH',
      headers: restHeaders(key, { prefer: 'return=minimal' }),
      body: JSON.stringify({ airtable_synced: true, airtable_synced_at: new Date().toISOString() }),
    }
  );
  if (!res.ok) throw new Error(`supabase mark ${res.status}: ${await res.text()}`);
}

// automation_health_log — authoritative run record (Supabase side of the log).
export async function logHealthSupabase(summary) {
  const { url, key } = base();
  const row = {
    auto_id: AUTO_ID,
    crawler_id: `${CRAWLER_ID}_v1.0`,
    run_started_at: summary.runStartedAt,
    run_completed_at: summary.runCompletedAt,
    artifacts_found: summary.signalsFound,
    artifacts_new: summary.artifactsNew,
    artifacts_duped: summary.artifactsDuped,
    errors: summary.errors || [],
    success: summary.success,
    notes: summary.notes || null,
  };
  const res = await fetch(`${url}/rest/v1/automation_health_log`, {
    method: 'POST',
    headers: restHeaders(key, { prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`supabase health ${res.status}: ${await res.text()}`);
}
