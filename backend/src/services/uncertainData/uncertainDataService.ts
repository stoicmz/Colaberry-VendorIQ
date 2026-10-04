import { Transaction } from 'sequelize';
import { ensureModelsSynced, IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { getCurrentVersions } from '../correctionRequest/currentVersionService';
import { recordUncertainDataFlags } from './uncertainDataFlagService';
import { detectUncertainData, UncertainDataFlag } from './uncertainDataRules';

/**
 * Runs the uncertain-data rules over every stored interaction. Read-only, so status checks can
 * call it (inside their transaction, if they have one) without side effects. U3 and U4 compare
 * records with each other, so this always looks at the whole table -- fine at current volumes.
 * Ordered by id so the rule evidence, and its audit hash, is the same on every call.
 */
export async function detectStoredUncertainData(
  options: { transaction?: Transaction } = {}
): Promise<Map<number, UncertainDataFlag[]>> {
  const { transaction } = options;
  await ensureModelsSynced();

  const records = await RecruiterInteractionRecord.findAll({ order: [['id', 'ASC']], transaction });
  if (records.length === 0) {
    return new Map();
  }

  // U2 compares each interaction's date with the day its submission was ingested.
  const batches = await IngestionBatch.findAll({
    where: { id: [...new Set(records.map((record) => record.batchId))] },
    attributes: ['id', 'createdAt'],
    transaction,
  });
  const submittedAtByBatch = new Map(batches.map((batch) => [batch.id, batch.createdAt]));

  // STORY-011: the rules judge the current version, so a job seeker's correction (say, adding
  // the missing email) can clear the flag it answers.
  const current = await getCurrentVersions(records, { transaction });

  return detectUncertainData(
    current.map((record) => ({
      id: record.id,
      batchId: record.batchId,
      submittedAt: submittedAtByBatch.get(record.batchId)!,
      recruiterName: record.recruiterName,
      recruiterEmail: record.recruiterEmail,
      recruiterCompany: record.recruiterCompany,
      interactionDate: record.interactionDate,
      interactionType: record.interactionType,
    }))
  );
}

/**
 * Detects uncertain data and records each flag, which is what notifies data reviewers and
 * logs the flagging action. Safe to run repeatedly (after every upload, on every dashboard
 * load): flags already recorded are skipped. Returns how many flags are currently raised.
 * Errors propagate -- the caller decides whether its own work can still go ahead.
 */
export async function flagUncertainData(): Promise<number> {
  const flags = await detectStoredUncertainData();
  await recordUncertainDataFlags(flags);
  return [...flags.values()].reduce((total, list) => total + list.length, 0);
}
