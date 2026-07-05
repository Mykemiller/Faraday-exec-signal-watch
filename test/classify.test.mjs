import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAwardTitle,
  signalTypeToSourceType,
  deriveTrackingStatus,
  normalizeResult,
} from '../lib/classify.mjs';
import { contentHash } from '../lib/hash.mjs';

test('isAwardTitle flags iM100 / award placeholders, not real titles', () => {
  assert.equal(isAwardTitle('iM100 Award Winner'), true);
  assert.equal(isAwardTitle('IM100 award recipient'), true);
  assert.equal(isAwardTitle(''), true);
  assert.equal(isAwardTitle('Chief Data Center Officer'), false);
  assert.equal(isAwardTitle('President & CEO'), false);
});

test('signalTypeToSourceType maps to the three allowed enum values', () => {
  assert.equal(signalTypeToSourceType('Job Change'), 'web_news');
  assert.equal(signalTypeToSourceType('Media Mention'), 'web_news');
  assert.equal(signalTypeToSourceType('Speaking Engagement'), 'web_news');
  assert.equal(signalTypeToSourceType('Social Activity'), 'social');
  // an explicit valid model source_type wins
  assert.equal(signalTypeToSourceType('Job Change', 'job_posting'), 'job_posting');
  // junk falls back by category
  assert.equal(signalTypeToSourceType('Media Mention', 'garbage'), 'web_news');
});

test('deriveTrackingStatus decision tree', () => {
  assert.equal(deriveTrackingStatus({ unreachable: true }), 'Unreachable');
  assert.equal(
    deriveTrackingStatus({ signal_detected: true, title_confirmed: false }),
    'Signal Detected'
  );
  assert.equal(
    deriveTrackingStatus({ signal_detected: false, title_confirmed: false, employer_confirmed: true }),
    'Needs Review'
  );
  assert.equal(
    deriveTrackingStatus({ signal_detected: false, title_confirmed: true, employer_confirmed: true }),
    'Confirmed'
  );
});

test('normalizeResult forces None-type signals to non-detected', () => {
  const r = normalizeResult({ signal_detected: true, signal_type: 'None', signal_summary: 'x' });
  assert.equal(r.signal_detected, false);
  assert.equal(r.signal_type, 'None');
  assert.equal(r.source_type, null);
  assert.equal(r.signal_summary, '');
});

test('normalizeResult keeps a real signal and coerces bad dates to null', () => {
  const r = normalizeResult({
    signal_detected: true,
    signal_type: 'Job Change',
    signal_summary: 'Promoted to CEO',
    source_url: 'https://example.com',
    published_date: 'not-a-date',
  });
  assert.equal(r.signal_detected, true);
  assert.equal(r.source_type, 'web_news');
  assert.equal(r.published_date, null);
});

test('contentHash is stable and order-sensitive', () => {
  const a = contentHash('https://example.com', 'summary');
  const b = contentHash('https://example.com', 'summary');
  const c = contentHash('summary', 'https://example.com');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});
