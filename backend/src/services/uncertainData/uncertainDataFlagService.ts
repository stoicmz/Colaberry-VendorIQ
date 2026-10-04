import { createHash } from 'crypto';
import { ensureModelsSynced } from '../../models/VendorIngestionRecord';
import { UncertainDataFlag as UncertainDataFlagRow } from '../../models/UncertainDataFlag';
import { UNCERTAIN_DATA_RULES_VERSION, UncertainDataFlag } from './uncertainDataRules';

function hashEvidence(evidence: string): string {
  return createHash('sha256').update(evidence).digest('hex');
}

/**
 * Records each uncertain-data flag: the row notifies data reviewers and is the audit entry.
 * Safe to call after every upload and on every read: INSERT OR IGNORE against the unique
 * index means a flag already recorded is skipped by the database itself, so repeated or
 * concurrent calls never create duplicates. Errors propagate to the caller.
 */
export async function recordUncertainDataFlags(flagsByInteraction: Map<number, UncertainDataFlag[]>): Promise<void> {
  const rows = [...flagsByInteraction.entries()].flatMap(([interactionId, flags]) =>
    flags.map((flag) => ({
      interactionId,
      ruleId: flag.ruleId,
      rulesVersion: UNCERTAIN_DATA_RULES_VERSION,
      description: flag.description,
      evidence: flag.evidence,
      evidenceHash: hashEvidence(flag.evidence),
    }))
  );
  if (rows.length === 0) {
    return;
  }
  await ensureModelsSynced();
  await UncertainDataFlagRow.bulkCreate(rows, { ignoreDuplicates: true });
}
