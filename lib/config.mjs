// Static IDs and taxonomy for AUTO-179 — Executive Signal Watch.
// These are stable Airtable field/table IDs (survive renames) and the
// Supabase identifiers shared by the seed backfill and the nightly crawler.

export const AUTO_ID = 'AUTO-179';
export const CRAWLER_ID = 'exec-signal-watch';

export const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appxfti7VuoHYUeu6';

// Data Center People
export const PEOPLE_TABLE = 'tblEJnllPN6kywL7E';
export const F = {
  fullName: 'fldzgvBWFD1ptD7s0',
  currentTitle: 'fldaRFBTFY5AIV6b6',
  employer: 'fldbUcZB9xpFoIvjq',
  geography: 'fldrVcWmrQM8dII3h',
  linkedin: 'fldHGjqySWFbPlo0v',
  priorityTier: 'fld6iDQVRhDLuiJRE',
  trackingStatus: 'fldHe0Lf5q7T0VtIO',
  lastChecked: 'fldGbfEDb39pAHBpL',
  lastSignalDetected: 'fldGZcGQGjiPDwCkI',
  signalType: 'fldponJJO6qEKQtAV',
};

// Health Logs
export const HEALTH_TABLE = 'tbls1aRXvGMJb9gh3';
export const HF = {
  automationName: 'fldwWCzJgexBHYZ6d',
  date: 'fld51JMn3IrmAUPGW',
  automationId: 'fldhmY2YQGFyRbq4q',
  status: 'fldScRa6nTh6iNc4C',
  responseTime: 'fldzOddVZMSqdbjYV',
  errorMessage: 'fldJfm02MHxFejPLV',
  notes: 'fldBOXWjfCBjEqnwv',
};

// Airtable "Tracking Status" single-select (proposed + approved taxonomy).
export const TRACKING_STATUS = {
  CONFIRMED: 'Confirmed',
  SIGNAL_DETECTED: 'Signal Detected',
  NEEDS_REVIEW: 'Needs Review',
  UNREACHABLE: 'Unreachable',
};

// Airtable "Signal Type" single-select (human-facing taxonomy).
export const SIGNAL_TYPES = [
  'Job Change',
  'Media Mention',
  'Speaking Engagement',
  'Social Activity',
  'None',
];

// Supabase source_type_enum values this automation is allowed to write.
export const SOURCE_TYPES = ['job_posting', 'social', 'web_news'];

export const BATCH_SIZE = Number(process.env.BATCH_SIZE || 40);
export const CONCURRENCY = 5;
export const BATCH_SLEEP_MS = 400;
