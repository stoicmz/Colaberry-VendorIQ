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
import { UncertainDataFlag as UncertainDataFlagRow } from '../../models/UncertainDataFlag';
import { flagUncertainData } from '../uncertainData/uncertainDataService';
import { UNCERTAIN_DATA_RULES_VERSION, UncertainDataFlag } from '../uncertainData/uncertainDataRules';

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

// STORY-005: a reviewer must not rule without the uncertain-data evidence, because a ruling
// outranks any flag found later. Temporary -- the reviewer retries once the check runs again.
export class UncertaintyCheckUnavailableError extends Error {
  constructor() {
    super('The uncertain-data check is unavailable right now, so decisions are paused. Try again shortly.');
    this.name = 'UncertaintyCheckUnavailableError';
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
    if (status.uncertainFlags === null) {
      throw new UncertaintyCheckUnavailableError();
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
  // STORY-005: what a reviewer should check when the reason is 'uncertain'; empty otherwise.
  // null when the uncertain-data check could not run (decisions are paused until it can).
  uncertainFlags: UncertainDataFlag[] | null;
}

/**
 * The manual-review queue: every interaction that must not be shown as confirmed history
 * until a reviewer rules on it, with why it is here and any open disputes. Interactions held
 * only because the uncertain-data check could not run are left out: they are waiting on the
 * check, not on a person, and return by themselves (flagged or confirmed) once it runs.
 * Loads all interactions to work out their status -- fine at current volumes; page it when
 * the table grows.
 */
export async function listPendingReview(): Promise<PendingReviewItem[]> {
  await ensureModelsSynced();

  const records = await RecruiterInteractionRecord.findAll({ order: [['id', 'ASC']] });
  const statuses = await getHistoryStatuses(records.map((record) => record.id));
  const pending = records.filter((record) => {
    const status = statuses.get(record.id);
    return status?.status === 'pending_review' && status.reason !== 'uncertainty_unchecked';
  });
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
    // undefined means "checked, nothing uncertain"; null (check unavailable) is passed on as is.
    uncertainFlags: statuses.get(record.id)!.uncertainFlags === undefined ? [] : statuses.get(record.id)!.uncertainFlags!,
  }));
}

export interface UncertainDataNotification {
  flagId: number;
  interactionId: number;
  recruiterName: string;
  ruleId: string;
  description: string;
  evidence: string;
  flaggedAt: Date;
}

export interface UncertainDataNotifications {
  notifications: UncertainDataNotification[];
  // True when the catch-up flagging run failed: the list is what was already recorded.
  refreshFailed: boolean;
}

/**
 * STORY-005: a data reviewer's notifications -- uncertain-data flags still waiting for them.
 *
 * Runs the flagging first as a catch-up, so a flag whose recording failed at upload time is
 * recorded (and so notified) now; if that run fails too, the already-recorded flags are still
 * returned, with refreshFailed set. A flag is open while its interaction is waiting for review
 * because of uncertainty and the rule still finds the same evidence -- a reviewer's ruling, or
 * corrected data, closes it. If the check cannot run, the evidence cannot be compared, so a
 * recorded flag stays open while its interaction has no reviewer ruling: better a stale
 * notification than a missed one.
 */
export async function listUncertainDataNotifications(): Promise<UncertainDataNotifications> {
  await ensureModelsSynced();

  let refreshFailed = false;
  try {
    await flagUncertainData();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Uncertain-data catch-up flagging failed; returning the flags already recorded', err);
    refreshFailed = true;
  }

  const rows = await UncertainDataFlagRow.findAll({
    where: { rulesVersion: UNCERTAIN_DATA_RULES_VERSION },
    order: [['id', 'ASC']],
  });
  if (rows.length === 0) {
    return { notifications: [], refreshFailed };
  }

  const interactionIds = [...new Set(rows.map((row) => row.interactionId))];
  const statuses = await getHistoryStatuses(interactionIds);
  const records = await RecruiterInteractionRecord.findAll({
    where: { id: interactionIds },
    attributes: ['id', 'recruiterName'],
  });
  const recruiterNames = new Map(records.map((record) => [record.id, record.recruiterName]));

  const notifications = rows
    .filter((row) => {
      const status = statuses.get(row.interactionId);
      if (status?.uncertainFlags === null) {
        return status.status === 'pending_review';
      }
      return (
        status?.reason === 'uncertain' &&
        (status.uncertainFlags ?? []).some((flag) => flag.ruleId === row.ruleId && flag.evidence === row.evidence)
      );
    })
    .map((row) => ({
      flagId: row.id,
      interactionId: row.interactionId,
      recruiterName: recruiterNames.get(row.interactionId)!,
      ruleId: row.ruleId,
      description: row.description,
      evidence: row.evidence,
      flaggedAt: row.flaggedAt,
    }));
  return { notifications, refreshFailed };
}
