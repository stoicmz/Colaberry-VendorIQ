import { createHash } from 'crypto';
import { ensureModelsSynced } from '../../models/VendorIngestionRecord';
import { RedFlagLog } from '../../models/RedFlagLog';
import { RED_FLAG_RULES_VERSION, RedFlag } from './redFlagRules';

function hashEvidence(evidence: string): string {
  return createHash('sha256').update(evidence).digest('hex');
}

/**
 * Records each identified red flag in the audit log. Safe to call on every dashboard load:
 * INSERT OR IGNORE against the unique index means a flag already logged is skipped by the
 * database itself, so repeated or concurrent calls never create duplicates. Errors propagate
 * to the caller -- a failed audit write must not pass silently.
 */
export async function logRedFlagIdentifications(flagsByInteraction: Map<number, RedFlag[]>): Promise<void> {
  const rows = [...flagsByInteraction.entries()].flatMap(([interactionId, flags]) =>
    flags.map((flag) => ({
      interactionId,
      ruleId: flag.ruleId,
      rulesVersion: RED_FLAG_RULES_VERSION,
      evidence: flag.evidence,
      evidenceHash: hashEvidence(flag.evidence),
    }))
  );
  if (rows.length === 0) {
    return;
  }
  await ensureModelsSynced();
  await RedFlagLog.bulkCreate(rows, { ignoreDuplicates: true });
}
