import { TRACKING_STATUS, SIGNAL_TYPES, SOURCE_TYPES } from './config.mjs';

// The "Current Title" field on Data Center People frequently holds an
// Infrastructure Masons recognition ("iM100 Award Winner") instead of a real
// job title. Approved rule (Myke, 2026-07-05): treat these as UNKNOWN titles —
// the model must confirm the real current title from search rather than
// accepting the award as a title.
export function isAwardTitle(title) {
  if (!title) return true;
  const t = String(title).toLowerCase();
  return (
    t.includes('im100') ||
    t.includes('i100') ||
    t.includes('award winner') ||
    t.includes('award recipient')
  );
}

// Map the human-facing Airtable "Signal Type" to a Supabase source_type_enum
// value. The enum is fixed to three values — never expand it (governance).
export function signalTypeToSourceType(signalType, modelSourceType) {
  const st = String(modelSourceType || '').toLowerCase();
  if (SOURCE_TYPES.includes(st)) return st;
  switch (signalType) {
    case 'Social Activity':
      return 'social';
    case 'Job Change':
    case 'Media Mention':
    case 'Speaking Engagement':
    default:
      return 'web_news';
  }
}

// Decision tree (approved):
//   signal_detected            -> Signal Detected
//   title/employer unconfirmed -> Needs Review
//   otherwise                  -> Confirmed
// "Unreachable" is set only by the error path (search failed entirely).
export function deriveTrackingStatus(result) {
  if (result.unreachable) return TRACKING_STATUS.UNREACHABLE;
  if (result.signal_detected) return TRACKING_STATUS.SIGNAL_DETECTED;
  if (!result.title_confirmed || !result.employer_confirmed) {
    return TRACKING_STATUS.NEEDS_REVIEW;
  }
  return TRACKING_STATUS.CONFIRMED;
}

// Coerce a raw model response into a safe, fully-populated result object.
export function normalizeResult(raw) {
  const signalType = SIGNAL_TYPES.includes(raw?.signal_type)
    ? raw.signal_type
    : 'None';
  const signalDetected = Boolean(raw?.signal_detected) && signalType !== 'None';
  return {
    title_confirmed: Boolean(raw?.title_confirmed),
    employer_confirmed: Boolean(raw?.employer_confirmed),
    signal_detected: signalDetected,
    signal_type: signalDetected ? signalType : 'None',
    source_type: signalDetected
      ? signalTypeToSourceType(signalType, raw?.source_type)
      : null,
    signal_summary: signalDetected ? String(raw?.signal_summary || '').trim() : '',
    source_url: signalDetected ? String(raw?.source_url || '').trim() : '',
    published_date: normalizeDate(raw?.published_date),
    unreachable: false,
  };
}

function normalizeDate(d) {
  if (!d) return null;
  const s = String(d).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
