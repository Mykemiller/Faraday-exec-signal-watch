import {
  AIRTABLE_BASE_ID,
  PEOPLE_TABLE,
  HEALTH_TABLE,
  F,
  HF,
} from './config.mjs';

const API = 'https://api.airtable.com/v0';

function headers() {
  const key = process.env.AIRTABLE_API_KEY;
  if (!key) throw new Error('AIRTABLE_API_KEY not set');
  return { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
}

const READ_FIELDS = [
  F.fullName,
  F.currentTitle,
  F.employer,
  F.geography,
  F.linkedin,
  F.priorityTier,
  F.lastChecked,
  F.lastSignalDetected,
];

function toPerson(rec) {
  const c = rec.fields;
  return {
    id: rec.id,
    fullName: c[F.fullName] || '',
    currentTitle: c[F.currentTitle] || '',
    employer: c[F.employer] || '',
    geography: c[F.geography] || '',
    linkedin: c[F.linkedin] || '',
    priorityTier: c[F.priorityTier] || '',
    lastChecked: c[F.lastChecked] || null,
    lastSignalDetected: c[F.lastSignalDetected] || null,
  };
}

// Select the `limit` records with the oldest Last Checked (nulls first, which
// Airtable's ascending sort delivers) — the nightly rotation window.
export async function selectOldest(limit) {
  const url = new URL(`${API}/${AIRTABLE_BASE_ID}/${PEOPLE_TABLE}`);
  url.searchParams.set('returnFieldsByFieldId', 'true');
  url.searchParams.set('pageSize', String(Math.min(limit, 100)));
  url.searchParams.set('maxRecords', String(limit));
  url.searchParams.append('sort[0][field]', F.lastChecked);
  url.searchParams.append('sort[0][direction]', 'asc');
  for (const f of READ_FIELDS) url.searchParams.append('fields[]', f);

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`airtable select ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.records || []).map(toPerson);
}

// Full-roster pull for the seed backfill (paginated).
export async function selectAll() {
  const out = [];
  let offset;
  do {
    const url = new URL(`${API}/${AIRTABLE_BASE_ID}/${PEOPLE_TABLE}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    for (const f of READ_FIELDS) url.searchParams.append('fields[]', f);
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`airtable selectAll ${res.status}: ${await res.text()}`);
    const data = await res.json();
    out.push(...(data.records || []).map(toPerson));
    offset = data.offset;
  } while (offset);
  return out;
}

// Patch the four tracking fields on one person. typecast:true creates the
// single-select choices on first use (approved taxonomy).
export async function updateTracking(recordId, { trackingStatus, signalType, signalDate, checkedDate }) {
  const fields = {
    [F.trackingStatus]: trackingStatus,
    [F.lastChecked]: checkedDate,
  };
  if (signalType && signalType !== 'None') {
    fields[F.signalType] = signalType;
    fields[F.lastSignalDetected] = signalDate || checkedDate;
  }
  const res = await fetch(`${API}/${AIRTABLE_BASE_ID}/${PEOPLE_TABLE}/${recordId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) throw new Error(`airtable patch ${res.status}: ${await res.text()}`);
  return res.json();
}

// Append a Health Logs row (Airtable side of the standard dual log).
export async function logHealthAirtable({ status, responseMs, errorMessage, notes, date }) {
  const fields = {
    [HF.automationName]: 'Executive Signal Watch',
    [HF.automationId]: 'AUTO-179',
    [HF.date]: date || new Date().toISOString(),
    [HF.status]: status,
    [HF.notes]: notes || '',
  };
  if (typeof responseMs === 'number') fields[HF.responseTime] = responseMs;
  if (errorMessage) fields[HF.errorMessage] = errorMessage;
  const res = await fetch(`${API}/${AIRTABLE_BASE_ID}/${HEALTH_TABLE}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) throw new Error(`airtable health ${res.status}: ${await res.text()}`);
  return res.json();
}
