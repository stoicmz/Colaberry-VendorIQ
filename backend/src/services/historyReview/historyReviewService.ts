import { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import { ensureModelsSynced, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { InteractionDispute } from '../../models/InteractionDispute';
import {
  HISTORY_REVIEW_DECISIONS,
  HistoryReviewDecision,
  HistoryReviewDecisionType,
} from '../../models/HistoryReviewDecision';
import { getHistoryStatuses, HistoryStatus, HistoryStatusReason } from '../historyStatus/historyStatusService';

export class InvalidHistoryReviewInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHistoryReviewInputError';
  }
}

export class NotPendingReviewError extends Error {
  constructor(public readonly currentStatus: HistoryStatus) {
    super(`This interaction is not waiting for review (its status is "${currentStatus}").`);
    this.name = 'NotPendingReviewError';
  }
}

function requireText(value: string, message: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new InvalidHistoryReviewInputError(message);
  }
  return trimmed;
}

// Review writes run one at a time: each waits for the previous one to finish, so a
// double-click or retry sees the first submission's row and does not write a duplicate.
// SQLite locking cannot do this here -- Sequelize's sqlite driver errors on overlapping
// transactions instead of queueing them. This holds for the single Node process VendorIQ
// runs as; several processes sharing one database would need a database-level guard.
let writeQueue: Promise<unknown> = Promise.resolve();

function serializedTransaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
  const run = writeQueue.then(() => sequelize.transaction(work));
  writeQueue = run.catch(() => undefined); // a failed write must not block the ones behind it
  return run;
}

export interface DisputeInput {
  interactionId: number;
  disputedBy: string;
  reason: string;
}

export interface DisputeResult {
  disputeId: number;
  interactionId: number;
  disputedBy: string;
  reason: string;
  disputedAt: Date;
  // false when this person already had an open dispute on the interaction; that one is returned.
  created: boolean;
}

/**
 * Records that someone says an interaction is not factual (REQ-019). From then until a
 * reviewer rules, the interaction is in manual review rather than confirmed history.
 * Returns null when the interaction does not exist.
 */
export async function disputeInteraction(input: DisputeInput): Promise<DisputeResult | null> {
  const disputedBy = requireText(input.disputedBy, 'Enter who is disputing this interaction.');
  const reason = requireText(input.reason, 'Give a reason for the dispute.');

  await ensureModelsSynced();

  return serializedTransaction(async (transaction) => {
    const record = await RecruiterInteractionRecord.findByPk(input.interactionId, { transaction });
    if (!record) {
      return null;
    }

    const existing = await InteractionDispute.findOne({
      where: { interactionId: record.id, disputedBy, resolvedByDecisionId: null },
      transaction,
    });
    const dispute =
      existing ??
      (await InteractionDispute.create(
        { interactionId: record.id, disputedBy, reason, resolvedByDecisionId: null },
        { transaction }
      ));

    return {
      disputeId: dispute.id,
      interactionId: dispute.interactionId,
      disputedBy: dispute.disputedBy,
      reason: dispute.reason,
      disputedAt: dispute.disputedAt,
      created: existing === null,
    };
  });
}

export interface DecisionInput {
  interactionId: number;
  reviewerId: string;
  decision: string;
  note: string | null;
}

export interface DecisionResult {
  decisionId: number;
  interactionId: number;
  reviewerId: string;
  decision: HistoryReviewDecisionType;
  note: string | null;
  decidedAt: Date;
  resolvedDisputeCount: number;
}

/**
 * A data reviewer's ruling on an interaction in manual review. Only interactions currently
 * pending review can be ruled on: a second click, or a reviewer working from a stale queue,
 * gets NotPendingReviewError instead of silently overwriting an earlier ruling. Closing the
 * interaction's open disputes happens in the same transaction as recording the decision.
 * Returns null when the interaction does not exist.
 */
export async function decideHistoryReview(input: DecisionInput): Promise<DecisionResult | null> {
  const reviewerId = requireText(input.reviewerId, 'A reviewer ID is required to record a decision.');
  if (!(HISTORY_REVIEW_DECISIONS as readonly string[]).includes(input.decision)) {
    throw new InvalidHistoryReviewInputError('Decision must be "confirmed" or "rejected".');
  }
  const decision = input.decision as HistoryReviewDecisionType;
  const note = input.note === null || input.note.trim() === '' ? null : input.note.trim();

  await ensureModelsSynced();

  return serializedTransaction(async (transaction) => {
    const status = (await getHistoryStatuses([input.interactionId], { transaction })).get(input.interactionId);
    if (!status) {
      return null;
    }
    if (status.status !== 'pending_review') {
      throw new NotPendingReviewError(status.status);
    }

    const created = await HistoryReviewDecision.create(
      { interactionId: input.interactionId, reviewerId, decision, note },
      { transaction }
    );
    const [resolvedDisputeCount] = await InteractionDispute.update(
      { resolvedByDecisionId: created.id },
      { where: { interactionId: input.interactionId, resolvedByDecisionId: null }, transaction }
    );

    return {
      decisionId: created.id,
      interactionId: created.interactionId,
      reviewerId: created.reviewerId,
      decision: created.decision,
      note: created.note,
      decidedAt: created.decidedAt,
      resolvedDisputeCount,
    };
  });
}

export interface PendingReviewItem {
  interactionId: number;
  recruiterName: string;
  recruiterCompany: string | null;
  interactionDate: Date;
  interactionType: string;
  reason: HistoryStatusReason;
  openDisputes: { disputedBy: string; reason: string; disputedAt: Date }[];
}

/**
 * The manual-review queue: every interaction that must not be shown as confirmed history
 * until a reviewer rules on it, with why it is here and any open disputes.
 * Loads all interactions to work out their status -- fine at current volumes; page it when
 * the table grows.
 */
export async function listPendingReview(): Promise<PendingReviewItem[]> {
  await ensureModelsSynced();

  const records = await RecruiterInteractionRecord.findAll({ order: [['id', 'ASC']] });
  const statuses = await getHistoryStatuses(records.map((record) => record.id));
  const pending = records.filter((record) => statuses.get(record.id)?.status === 'pending_review');
  if (pending.length === 0) {
    return [];
  }

  const disputes = await InteractionDispute.findAll({
    where: { interactionId: pending.map((record) => record.id), resolvedByDecisionId: null },
    order: [['id', 'ASC']],
  });

  return pending.map((record) => ({
    interactionId: record.id,
    recruiterName: record.recruiterName,
    recruiterCompany: record.recruiterCompany,
    interactionDate: record.interactionDate,
    interactionType: record.interactionType,
    reason: statuses.get(record.id)!.reason,
    openDisputes: disputes
      .filter((dispute) => dispute.interactionId === record.id)
      .map((dispute) => ({ disputedBy: dispute.disputedBy, reason: dispute.reason, disputedAt: dispute.disputedAt })),
  }));
}
