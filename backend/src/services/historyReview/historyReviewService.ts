import { Op } from 'sequelize';
import { serializedTransaction } from '../../config/serializedTransaction';
import { ensureModelsSynced, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { InteractionDispute } from '../../models/InteractionDispute';
import { CorrectableField, CorrectionRequest, CorrectionRequestRaiser } from '../../models/CorrectionRequest';
import { CorrectionAnswer, CorrectionResponse } from '../../models/CorrectionResponse';
import {
  HISTORY_REVIEW_DECISIONS,
  HistoryReviewDecision,
  HistoryReviewDecisionType,
} from '../../models/HistoryReviewDecision';
import { getHistoryStatuses, HistoryStatus, HistoryStatusReason } from '../historyStatus/historyStatusService';
import { UncertainDataFlag as UncertainDataFlagRow } from '../../models/UncertainDataFlag';
import { flagUncertainData } from '../uncertainData/uncertainDataService';
import { getCurrentVersions } from '../correctionRequest/currentVersionService';
import { raiseSystemCorrectionRequests } from '../correctionRequest/correctionRequestService';
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

// STORY-011: the reviewer asked the job seeker a question; the ruling waits for the answer.
// To rule without it, the reviewer withdraws the request first.
export class AwaitingJobSeekerError extends Error {
  constructor() {
    super('A correction request is still waiting for the job seeker. Wait for the answer, or withdraw the request first.');
    this.name = 'AwaitingJobSeekerError';
  }
}

function requireText(value: string, message: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new InvalidHistoryReviewInputError(message);
  }
  return trimmed;
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
  closedRequestCount: number;
}

/**
 * A data reviewer's ruling on an interaction in manual review. Only interactions currently
 * pending review can be ruled on: a second click, or a reviewer working from a stale queue,
 * gets NotPendingReviewError instead of silently overwriting an earlier ruling. Closing the
 * interaction's open disputes happens in the same transaction as recording the decision, and so
 * does closing its answered correction requests (STORY-011), and any open system-raised one,
 * each linked to this decision. While a reviewer's own request still waits on the job seeker
 * the ruling is refused with AwaitingJobSeekerError.
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
    if (status.reason === 'awaiting_job_seeker') {
      throw new AwaitingJobSeekerError();
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
    const [closedRequestCount] = await CorrectionRequest.update(
      {
        status: 'closed',
        openKey: null,
        closedBy: reviewerId,
        closedAt: created.decidedAt,
        closedByDecisionId: created.id,
      },
      {
        where: {
          interactionId: input.interactionId,
          // Answered requests, plus any system request the job seeker has not answered yet: the
          // reviewer has now ruled without waiting for it (STORY-005 data never waits on a rule).
          [Op.or]: [{ status: 'answered' }, { status: 'open', raisedByType: 'system' }],
        },
        transaction,
      }
    );

    return {
      decisionId: created.id,
      interactionId: created.interactionId,
      reviewerId: created.reviewerId,
      decision: created.decision,
      note: created.note,
      decidedAt: created.decidedAt,
      resolvedDisputeCount,
      closedRequestCount,
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
  // STORY-011: fields a job seeker's correction changed (the values above are current), and
  // what they were as originally submitted, so the reviewer sees both side by side.
  correctedFields: CorrectableField[];
  originalValues: Partial<Record<CorrectableField, string | Date | null>>;
  // STORY-011: requests the job seeker has answered and the reviewer has not yet ruled on.
  answeredRequests: AnsweredRequestItem[];
  // STORY-011: system requests the job seeker has been sent but not answered yet. They do not
  // hold up the reviewer, who may rule now or wait for the answer.
  openRequests: OpenRequestItem[];
}

export interface OpenRequestItem {
  requestId: number;
  issueKey: string;
  raisedByType: CorrectionRequestRaiser;
  raisedBy: string;
  reason: string;
  raisedAt: Date;
}

export interface AnsweredRequestItem {
  requestId: number;
  issueKey: string;
  raisedByType: CorrectionRequestRaiser;
  raisedBy: string;
  reason: string;
  raisedAt: Date;
  response: {
    answer: CorrectionAnswer;
    correctedValues: Record<string, string> | null;
    reason: string;
    respondedBy: string;
    statement: string;
    respondedAt: Date;
  };
}

/**
 * The manual-review queue: every interaction that must not be shown as confirmed history
 * until a reviewer rules on it, with why it is here and any open disputes. Interactions held
 * only because the uncertain-data check could not run are left out: they are waiting on the
 * check, not on a person, and return by themselves (flagged or confirmed) once it runs. So are
 * interactions waiting on the job seeker to answer a correction request (STORY-011): nothing
 * there needs the reviewer until the answer arrives. Answered requests are listed with the
 * answer, so the reviewer rules on what the job seeker attested.
 * Loads all interactions to work out their status -- fine at current volumes; page it when
 * the table grows.
 */
export async function listPendingReview(): Promise<PendingReviewItem[]> {
  await ensureModelsSynced();

  // STORY-011: the reviewer sees the current version, with job seekers' corrections applied.
  const records = await getCurrentVersions(await RecruiterInteractionRecord.findAll({ order: [['id', 'ASC']] }));
  const statuses = await getHistoryStatuses(records.map((record) => record.id));
  const pending = records.filter((record) => {
    const status = statuses.get(record.id);
    return (
      status?.status === 'pending_review' &&
      status.reason !== 'uncertainty_unchecked' &&
      status.reason !== 'awaiting_job_seeker'
    );
  });
  if (pending.length === 0) {
    return [];
  }

  const disputes = await InteractionDispute.findAll({
    where: { interactionId: pending.map((record) => record.id), resolvedByDecisionId: null },
    order: [['id', 'ASC']],
  });

  const live = await CorrectionRequest.findAll({
    where: { interactionId: pending.map((record) => record.id), status: ['open', 'answered'] },
    order: [['id', 'ASC']],
  });
  const answered = live.filter((request) => request.status === 'answered');
  const openItems = (interactionId: number): OpenRequestItem[] =>
    live
      .filter((request) => request.status === 'open' && request.interactionId === interactionId)
      .map((request) => ({
        requestId: request.id,
        issueKey: request.issueKey,
        raisedByType: request.raisedByType,
        raisedBy: request.raisedBy,
        reason: request.reason,
        raisedAt: request.raisedAt,
      }));
  const responses = await CorrectionResponse.findAll({ where: { requestId: answered.map((request) => request.id) } });
  const responseByRequest = new Map(responses.map((response) => [response.requestId, response]));
  const answeredItems = (interactionId: number): AnsweredRequestItem[] =>
    answered
      .filter((request) => request.interactionId === interactionId)
      .map((request) => {
        const response = responseByRequest.get(request.id);
        if (!response) {
          // 'answered' is only ever set in the same transaction that stores the answer.
          throw new Error(`Correction request ${request.id} is marked answered but has no answer`);
        }
        return {
          requestId: request.id,
          issueKey: request.issueKey,
          raisedByType: request.raisedByType,
          raisedBy: request.raisedBy,
          reason: request.reason,
          raisedAt: request.raisedAt,
          response: {
            answer: response.answer,
            correctedValues: response.correctedValues === null ? null : JSON.parse(response.correctedValues),
            reason: response.reason,
            respondedBy: response.respondedBy,
            statement: response.statement,
            respondedAt: response.respondedAt,
          },
        };
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
    correctedFields: record.correctedFields,
    originalValues: record.originalValues,
    answeredRequests: answeredItems(record.id),
    openRequests: openItems(record.id),
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
  // STORY-011 catch-up: raise any system correction request an upload failed to raise. It does
  // not change which notifications are open, so a failure is logged and the list still returned.
  try {
    await raiseSystemCorrectionRequests();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Catch-up raising of system correction requests failed; it will be retried on the next check', err);
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
