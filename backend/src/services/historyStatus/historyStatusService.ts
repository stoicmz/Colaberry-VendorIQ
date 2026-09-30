import { Transaction } from 'sequelize';
import { ensureModelsSynced, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import { InteractionDispute } from '../../models/InteractionDispute';
import { HistoryReviewDecision, HistoryReviewDecisionType } from '../../models/HistoryReviewDecision';

export type HistoryStatus = 'confirmed' | 'pending_review' | 'rejected';
export type HistoryStatusReason =
  | 'attested' // confirmed: its submission was attested and nothing has challenged it
  | 'reviewer_confirmed' // confirmed: a data reviewer confirmed it
  | 'disputed' // pending_review: someone disputed it and no reviewer has ruled since
  | 'unattested' // pending_review: ingested without an attestation (e.g. before STORY-015)
  | 'reviewer_rejected'; // rejected: a data reviewer ruled it out of confirmed history

export interface HistoryStatusInfo {
  status: HistoryStatus;
  reason: HistoryStatusReason;
}

export interface HistoryStatusFacts {
  attested: boolean;
  hasOpenDispute: boolean;
  latestDecision: HistoryReviewDecisionType | null;
}

/**
 * The REQ-019 rule, in priority order. An open dispute always wins, so nothing disputed can
 * be shown as confirmed until a reviewer rules on it. A reviewer's ruling outranks the
 * attestation either way. With neither, the attestation alone decides -- and a missing one
 * routes the interaction to manual review rather than treating it as confirmed.
 */
export function deriveHistoryStatus(facts: HistoryStatusFacts): HistoryStatusInfo {
  if (facts.hasOpenDispute) {
    return { status: 'pending_review', reason: 'disputed' };
  }
  if (facts.latestDecision === 'confirmed') {
    return { status: 'confirmed', reason: 'reviewer_confirmed' };
  }
  if (facts.latestDecision === 'rejected') {
    return { status: 'rejected', reason: 'reviewer_rejected' };
  }
  if (facts.attested) {
    return { status: 'confirmed', reason: 'attested' };
  }
  return { status: 'pending_review', reason: 'unattested' };
}

/**
 * Looks up the facts for each interaction and derives its status. Status is computed on
 * read rather than stored, so it can never drift from the attestations, disputes and
 * decisions it is based on. Ids with no matching interaction are left out of the result.
 * Pass a transaction when the caller is about to write based on the answer, so the check
 * and the write see the same data.
 */
export async function getHistoryStatuses(
  interactionIds: number[],
  options: { transaction?: Transaction } = {}
): Promise<Map<number, HistoryStatusInfo>> {
  const { transaction } = options;
  const statuses = new Map<number, HistoryStatusInfo>();
  if (interactionIds.length === 0) {
    return statuses;
  }

  await ensureModelsSynced();

  const records = await RecruiterInteractionRecord.findAll({
    where: { id: interactionIds },
    attributes: ['id', 'batchId'],
    transaction,
  });
  if (records.length === 0) {
    return statuses;
  }

  const batchIds = [...new Set(records.map((record) => record.batchId))];
  const attestations = await SubmissionAttestation.findAll({
    where: { batchId: batchIds },
    attributes: ['batchId'],
    transaction,
  });
  const attestedBatchIds = new Set(attestations.map((attestation) => attestation.batchId));

  const openDisputes = await InteractionDispute.findAll({
    where: { interactionId: interactionIds, resolvedByDecisionId: null },
    attributes: ['interactionId'],
    transaction,
  });
  const disputedIds = new Set(openDisputes.map((dispute) => dispute.interactionId));

  // Ascending by id, so each later decision overwrites the earlier one: the last one stands.
  const decisions = await HistoryReviewDecision.findAll({
    where: { interactionId: interactionIds },
    attributes: ['interactionId', 'decision'],
    order: [['id', 'ASC']],
    transaction,
  });
  const latestDecision = new Map<number, HistoryReviewDecisionType>();
  for (const decision of decisions) {
    latestDecision.set(decision.interactionId, decision.decision);
  }

  for (const record of records) {
    statuses.set(
      record.id,
      deriveHistoryStatus({
        attested: attestedBatchIds.has(record.batchId),
        hasOpenDispute: disputedIds.has(record.id),
        latestDecision: latestDecision.get(record.id) ?? null,
      })
    );
  }
  return statuses;
}
