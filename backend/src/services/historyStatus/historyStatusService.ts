import { Transaction } from 'sequelize';
import { ensureModelsSynced, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import { InteractionDispute } from '../../models/InteractionDispute';
import { HistoryReviewDecision, HistoryReviewDecisionType } from '../../models/HistoryReviewDecision';
import { CorrectionRequest } from '../../models/CorrectionRequest';
import { detectStoredUncertainData } from '../uncertainData/uncertainDataService';
import { UncertainDataFlag } from '../uncertainData/uncertainDataRules';

export type HistoryStatus = 'confirmed' | 'pending_review' | 'rejected';
export type HistoryStatusReason =
  | 'attested' // confirmed: its submission was attested and nothing has challenged it
  | 'reviewer_confirmed' // confirmed: a data reviewer confirmed it
  | 'awaiting_job_seeker' // pending_review: a correction request is open, waiting on the job seeker
  | 'disputed' // pending_review: someone disputed it and no reviewer has ruled since
  | 'correction_answered' // pending_review: the job seeker answered a correction request; back with the reviewer
  | 'unattested' // pending_review: ingested without an attestation (e.g. before STORY-015)
  | 'uncertain' // pending_review: a STORY-005 rule flagged the data and no reviewer has ruled
  | 'uncertainty_unchecked' // pending_review: attested, but the STORY-005 check could not run
  | 'reviewer_rejected'; // rejected: a data reviewer ruled it out of confirmed history

export interface HistoryStatusInfo {
  status: HistoryStatus;
  reason: HistoryStatusReason;
  // When reason is 'uncertain' (or 'correction_answered' with a flag still standing): what is
  // uncertain and the evidence, for display.
  // null on every status when the uncertain-data check could not run.
  uncertainFlags?: UncertainDataFlag[] | null;
}

export interface HistoryStatusFacts {
  attested: boolean;
  uncertain: boolean | null; // null: the uncertain-data check could not run
  hasOpenDispute: boolean;
  latestDecision: HistoryReviewDecisionType | null;
  // STORY-011: the most pressing live correction request, if any. 'open' means a data reviewer's
  // own request still waiting on the job seeker; a system-raised request (STORY-005 rule U1)
  // that is still open does not count, because no reviewer is waiting on it -- the uncertain
  // data stays in the queue and notified as before. 'answered' is any request, from either.
  // Requests are closed by the reviewer's decision, so a live one is newer than the latest decision.
  liveRequest: 'open' | 'answered' | null;
}

/**
 * The REQ-019 rule, in priority order. An open correction request comes first (STORY-011): the
 * reviewer asked the job seeker a question and cannot rule until it is answered, so the
 * interaction is waiting on the job seeker even if it is also disputed. Next an open dispute,
 * so nothing disputed can be shown as confirmed until a reviewer rules on it. An answered
 * request then puts the interaction back with the reviewer -- ahead of any earlier ruling,
 * since the request was raised after it. A reviewer's ruling outranks the
 * attestation either way -- and is how a reviewer clears uncertain data (STORY-005). With
 * neither, uncertain data waits for review even if attested; otherwise the attestation
 * decides, and a missing one routes the interaction to manual review. An attestation alone
 * never confirms data the uncertain-data check has not passed: if the check could not run,
 * the interaction is held until it can.
 */
export function deriveHistoryStatus(facts: HistoryStatusFacts): HistoryStatusInfo {
  if (facts.liveRequest === 'open') {
    return { status: 'pending_review', reason: 'awaiting_job_seeker' };
  }
  if (facts.hasOpenDispute) {
    return { status: 'pending_review', reason: 'disputed' };
  }
  if (facts.liveRequest === 'answered') {
    return { status: 'pending_review', reason: 'correction_answered' };
  }
  if (facts.latestDecision === 'confirmed') {
    return { status: 'confirmed', reason: 'reviewer_confirmed' };
  }
  if (facts.latestDecision === 'rejected') {
    return { status: 'rejected', reason: 'reviewer_rejected' };
  }
  if (facts.uncertain === true) {
    return { status: 'pending_review', reason: 'uncertain' };
  }
  if (facts.attested && facts.uncertain === null) {
    return { status: 'pending_review', reason: 'uncertainty_unchecked' };
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

  // One open reviewer request is enough to wait on the job seeker, whatever else is answered.
  const liveRequests = await CorrectionRequest.findAll({
    where: { interactionId: interactionIds, status: ['open', 'answered'] },
    attributes: ['interactionId', 'status', 'raisedByType'],
    transaction,
  });
  const liveRequest = new Map<number, 'open' | 'answered'>();
  for (const request of liveRequests) {
    if (request.status === 'open' && request.raisedByType === 'system') {
      continue;
    }
    if (request.status === 'open' || !liveRequest.has(request.interactionId)) {
      liveRequest.set(request.interactionId, request.status as 'open' | 'answered');
    }
  }

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

  // STORY-005. A failed check must not take every page down with it, nor let unchecked data
  // through: statuses still come back, with uncertainFlags null so callers can say the check
  // is unavailable, and attested data held by deriveHistoryStatus until the check runs again.
  let uncertainFlags: Map<number, UncertainDataFlag[]> | null;
  try {
    uncertainFlags = await detectStoredUncertainData({ transaction });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Uncertain-data check failed; holding attested interactions for review until it runs again', err);
    uncertainFlags = null;
  }

  for (const record of records) {
    const flags = uncertainFlags === null ? null : uncertainFlags.get(record.id) ?? [];
    const status = deriveHistoryStatus({
      attested: attestedBatchIds.has(record.batchId),
      uncertain: flags === null ? null : flags.length > 0,
      hasOpenDispute: disputedIds.has(record.id),
      latestDecision: latestDecision.get(record.id) ?? null,
      liveRequest: liveRequest.get(record.id) ?? null,
    });
    if (flags === null) {
      statuses.set(record.id, { ...status, uncertainFlags: null });
    } else {
      // An answered request may be about a flag that still stands (say, the job seeker had no
      // email to add), so the reviewer sees the flags with the answer too.
      const showFlags = status.reason === 'uncertain' || (status.reason === 'correction_answered' && flags.length > 0);
      statuses.set(record.id, showFlags ? { ...status, uncertainFlags: flags } : status);
    }
  }
  return statuses;
}
