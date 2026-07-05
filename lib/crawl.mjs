import { classifyPerson } from './anthropic.mjs';
import { normalizeResult, deriveTrackingStatus } from './classify.mjs';
import { insertArtifact, markSynced, logHealthSupabase } from './supabase.mjs';
import { updateTracking, logHealthAirtable } from './airtable.mjs';
import { CONCURRENCY, BATCH_SLEEP_MS, TRACKING_STATUS } from './config.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayISO = () => new Date().toISOString().slice(0, 10);

// Process a single person end to end. Never throws: a failure marks the person
// Unreachable and records the error so one bad search can't stop the batch.
async function processPerson(person, { dryRun }) {
  const outcome = { person: person.fullName, recordId: person.id };
  try {
    const raw = await classifyPerson(person);
    const result = normalizeResult(raw);
    const trackingStatus = deriveTrackingStatus(result);
    outcome.trackingStatus = trackingStatus;
    outcome.signalType = result.signal_type;
    outcome.result = result;

    if (result.signal_detected && result.source_url) {
      const { inserted, hash } = dryRun
        ? { inserted: false, hash: null }
        : await insertArtifact(person, result);
      outcome.artifactInserted = inserted;
      outcome.duped = !inserted;

      if (!dryRun) {
        // Only re-stamp Last Signal Detected when the signal is genuinely new
        // (a fresh artifact was written); a duplicate leaves it unchanged.
        await updateTracking(person.id, {
          trackingStatus,
          signalType: result.signal_type,
          signalDate: inserted ? result.published_date || todayISO() : person.lastSignalDetected,
          checkedDate: todayISO(),
        });
        if (inserted && hash) await markSynced(hash);
      }
    } else if (!dryRun) {
      await updateTracking(person.id, { trackingStatus, signalType: 'None', checkedDate: todayISO() });
    }
    outcome.ok = true;
  } catch (err) {
    outcome.ok = false;
    outcome.error = String(err?.message || err);
    outcome.trackingStatus = TRACKING_STATUS.UNREACHABLE;
    if (!dryRun) {
      try {
        await updateTracking(person.id, {
          trackingStatus: TRACKING_STATUS.UNREACHABLE,
          signalType: 'None',
          checkedDate: todayISO(),
        });
      } catch (_) {
        /* swallow: logged in errors[] */
      }
    }
  }
  return outcome;
}

// Run a list of people with fixed concurrency and a polite inter-wave sleep.
export async function runPeople(people, { dryRun = false, logHealth = true, notes } = {}) {
  const runStartedAt = new Date().toISOString();
  const outcomes = [];
  for (let i = 0; i < people.length; i += CONCURRENCY) {
    const wave = people.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(wave.map((p) => processPerson(p, { dryRun })));
    outcomes.push(...settled);
    if (i + CONCURRENCY < people.length) await sleep(BATCH_SLEEP_MS);
  }

  const errors = outcomes.filter((o) => !o.ok).map((o) => ({ person: o.person, error: o.error }));
  const summary = {
    runStartedAt,
    runCompletedAt: new Date().toISOString(),
    processed: outcomes.length,
    signalsFound: outcomes.filter((o) => o.result?.signal_detected).length,
    artifactsNew: outcomes.filter((o) => o.artifactInserted).length,
    artifactsDuped: outcomes.filter((o) => o.duped).length,
    byStatus: tally(outcomes.map((o) => o.trackingStatus)),
    errors,
    success: errors.length < outcomes.length, // a run is "failed" only if everything failed
    dryRun,
    notes: notes || `${dryRun ? 'DRY RUN · ' : ''}Log Key: AUTO-179 · ${todayISO()}`,
    outcomes,
  };

  if (logHealth && !dryRun) {
    const errText = errors.length ? errors.map((e) => `${e.person}: ${e.error}`).join('\n') : '';
    await Promise.allSettled([
      logHealthSupabase(summary),
      logHealthAirtable({
        status: summary.success ? 'Success' : 'Failed',
        responseMs: Date.parse(summary.runCompletedAt) - Date.parse(summary.runStartedAt),
        errorMessage: errText,
        notes:
          `${summary.notes}\nProcessed ${summary.processed} · signals ${summary.signalsFound} ` +
          `(new ${summary.artifactsNew}, duped ${summary.artifactsDuped}) · ${JSON.stringify(summary.byStatus)}`,
      }),
    ]);
  }
  return summary;
}

function tally(arr) {
  return arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});
}
