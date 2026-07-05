import crypto from 'node:crypto';

// content_hash = sha256(source_url + signal_summary) — the dedup key shared by
// the seed backfill and the nightly crawler. Keep this concatenation identical
// in both paths or artifacts will stop de-duplicating.
export function contentHash(sourceUrl, signalSummary) {
  return crypto
    .createHash('sha256')
    .update(String(sourceUrl || '') + String(signalSummary || ''))
    .digest('hex');
}
