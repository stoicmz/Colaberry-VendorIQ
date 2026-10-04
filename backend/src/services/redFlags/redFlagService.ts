import { RecruiterInteractionRecord, ensureModelsSynced } from '../../models/VendorIngestionRecord';
import { getHistoryStatuses } from '../historyStatus/historyStatusService';
import { getCurrentVersions } from '../correctionRequest/currentVersionService';
import { logRedFlagIdentifications } from './redFlagLogService';
import { detectRedFlags, RedFlag } from './redFlagRules';

/**
 * Identifies red flags for the given interactions and records them in the audit log.
 *
 * R3 and R4 compare records with each other, so the rules run over every interaction a
 * reviewer has not rejected (plus the requested ones) -- a record ruled out of history must
 * not count as evidence against anyone.
 *
 * Returns null when the check itself fails, so callers can say "red flag check unavailable"
 * instead of implying the data is clean. If only the audit write fails, the flags are still
 * returned: hiding a real red flag from a job seeker is worse than a delayed audit row, and
 * the idempotent log fills the gap on the next load. Both failures are logged loudly.
 */
export async function identifyRedFlags(interactionIds: number[]): Promise<Map<number, RedFlag[]> | null> {
  if (interactionIds.length === 0) {
    return new Map();
  }

  let flags: Map<number, RedFlag[]>;
  try {
    await ensureModelsSynced();
    // Fixed order, so rule evidence (and its audit hash) is the same on every load.
    const records = await RecruiterInteractionRecord.findAll({ order: [['id', 'ASC']] });
    const statuses = await getHistoryStatuses(records.map((record) => record.id));
    const requested = new Set(interactionIds);
    // STORY-011: judged on the current version, with job seekers' corrections applied.
    const comparisonSet = (await getCurrentVersions(records)).filter(
      (record) => requested.has(record.id) || statuses.get(record.id)?.status !== 'rejected'
    );
    const allFlags = detectRedFlags(comparisonSet);
    flags = new Map(interactionIds.filter((id) => allFlags.has(id)).map((id) => [id, allFlags.get(id)!]));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Red flag check failed; showing interactions with the check marked unavailable', err);
    return null;
  }

  try {
    await logRedFlagIdentifications(flags);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write the red flag audit log; flags are still shown and will be logged on the next load', err);
  }
  return flags;
}
