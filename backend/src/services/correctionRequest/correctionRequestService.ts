import { UniqueConstraintError } from 'sequelize';
import { serializedTransaction } from '../../config/serializedTransaction';
import { ensureModelsSynced, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import {
  CORRECTABLE_FIELDS,
  CorrectableField,
  CorrectionRequest,
  CorrectionRequestRaiser,
  CorrectionRequestStatus,
} from '../../models/CorrectionRequest';
import { CORRECTION_ANSWERS, CorrectionAnswer, CorrectionResponse } from '../../models/CorrectionResponse';
import { HistoryReviewDecision } from '../../models/HistoryReviewDecision';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import { detectStoredUncertainData } from '../uncertainData/uncertainDataService';
import { recruiterInteractionSchema } from '../vendorIngestion/vendorIngestionSchema';
import { getCurrentVersions } from './currentVersionService';

export { CORRECTABLE_FIELDS, CorrectableField };

// STORY-005 rule U1: with no email and no company, only the job seeker can say who this was.
const UNIDENTIFIED_RECRUITER_ISSUE = 'rule:unidentified_recruiter';

// The wording a job seeker agrees to when answering a request. It is copied onto every
// CorrectionResponse row, so changing it here never rewrites what earlier answers attested.
export const CORRECTION_ATTESTATION_STATEMENT = 'I attest that this answer is factual to the best of my knowledge.';

export class InvalidCorrectionRequestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCorrectionRequestInputError';
  }
}

export class CorrectionRequestNotOpenError extends Error {
  constructor(public readonly currentStatus: CorrectionRequestStatus) {
    super(`This request is not waiting for an answer (its status is "${currentStatus}").`);
    this.name = 'CorrectionRequestNotOpenError';
  }
}

// The data belongs to whoever attested it: only they can correct it or vouch for it.
export class NotSubmissionOwnerError extends Error {
  constructor() {
    super('Only the job seeker who submitted and attested this interaction can answer this request.');
    this.name = 'NotSubmissionOwnerError';
  }
}

function requireText(value: string, message: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new InvalidCorrectionRequestInputError(message);
  }
  return trimmed;
}

export interface RaiseCorrectionRequestInput {
  interactionId: number;
  reviewerId: string;
  field: string;
  reason: string;
}

export interface CorrectionRequestResult {
  requestId: number;
  interactionId: number;
  issueKey: string;
  raisedByType: CorrectionRequestRaiser;
  raisedBy: string;
  reason: string;
  status: CorrectionRequestStatus;
  raisedAt: Date;
  // false when a live request for this issue already existed; that one is returned.
  created: boolean;
}

function toResult(request: CorrectionRequest, created: boolean): CorrectionRequestResult {
  return {
    requestId: request.id,
    interactionId: request.interactionId,
    issueKey: request.issueKey,
    raisedByType: request.raisedByType,
    raisedBy: request.raisedBy,
    reason: request.reason,
    status: request.status,
    raisedAt: request.raisedAt,
    created,
  };
}

function findLiveRequest(interactionId: number, issueKey: string): Promise<CorrectionRequest | null> {
  return CorrectionRequest.findOne({ where: { interactionId, openKey: issueKey } });
}

/**
 * A data reviewer asks the job seeker to correct or complete one field of an interaction
 * (REQ-010). The reviewer never changes the data; the request row, with their ID and its
 * timestamp, is the log of the action. Allowed on any interaction, confirmed ones included,
 * since confirmed data can still turn out to be wrong. Raising the same field again while a
 * request for it is live returns that request instead of a second one -- including when two
 * raises race, which the unique index catches. Returns null when the interaction does not exist.
 */
export async function raiseCorrectionRequest(input: RaiseCorrectionRequestInput): Promise<CorrectionRequestResult | null> {
  const reviewerId = requireText(input.reviewerId, 'A reviewer ID is required to request a correction.');
  if (!(CORRECTABLE_FIELDS as readonly string[]).includes(input.field)) {
    throw new InvalidCorrectionRequestInputError(`Field must be one of: ${CORRECTABLE_FIELDS.join(', ')}.`);
  }
  const reason = requireText(input.reason, 'Give a reason for the correction request.');
  const issueKey = `reviewer:${input.field}`;

  await ensureModelsSynced();

  const record = await RecruiterInteractionRecord.findByPk(input.interactionId);
  if (!record) {
    return null;
  }

  const existing = await findLiveRequest(record.id, issueKey);
  if (existing) {
    return toResult(existing, false);
  }

  try {
    const created = await CorrectionRequest.create({
      interactionId: record.id,
      issueKey,
      raisedByType: 'reviewer',
      raisedBy: reviewerId,
      reason,
      openKey: issueKey,
    });
    return toResult(created, true);
  } catch (err) {
    if (!(err instanceof UniqueConstraintError)) {
      throw err;
    }
    // Another raise for the same issue landed between our check and our insert.
    const winner = await findLiveRequest(record.id, issueKey);
    if (!winner) {
      throw err;
    }
    return toResult(winner, false);
  }
}

/**
 * The system's own requests: every interaction rule U1 flags as having an unidentified
 * recruiter gets a request for the job seeker to supply the email or company. Raised at most
 * once per interaction -- once a reviewer has closed it, it is not raised again (a reviewer can
 * re-raise by hand) -- and never on an interaction a reviewer has already ruled on, so it does
 * not second-guess that ruling. Safe to run repeatedly and concurrently: the unique index
 * skips a request that is already live. Returns how many requests it raised -- an upper bound
 * if another run raised some of the same ones at the same moment.
 * Errors, including the rules failing to run, propagate to the caller.
 */
export async function raiseSystemCorrectionRequests(): Promise<number> {
  const flags = await detectStoredUncertainData();
  const flagged = [...flags.entries()]
    .map(([interactionId, list]) => ({ interactionId, flag: list.find((f) => f.ruleId === 'unidentified_recruiter') }))
    .filter((entry) => entry.flag !== undefined);
  if (flagged.length === 0) {
    return 0;
  }

  const ids = flagged.map((entry) => entry.interactionId);
  const ruled = await HistoryReviewDecision.findAll({ where: { interactionId: ids }, attributes: ['interactionId'] });
  const alreadyAsked = await CorrectionRequest.findAll({
    where: { interactionId: ids, issueKey: UNIDENTIFIED_RECRUITER_ISSUE },
    attributes: ['interactionId'],
  });
  const skip = new Set([...ruled, ...alreadyAsked].map((row) => row.interactionId));

  const rows = flagged
    .filter((entry) => !skip.has(entry.interactionId))
    .map((entry) => ({
      interactionId: entry.interactionId,
      issueKey: UNIDENTIFIED_RECRUITER_ISSUE,
      raisedByType: 'system' as const,
      raisedBy: 'system',
      reason: `${entry.flag!.description}. ${entry.flag!.evidence}. Please add the recruiter's email or company.`,
      openKey: UNIDENTIFIED_RECRUITER_ISSUE,
    }));
  if (rows.length === 0) {
    return 0;
  }
  await CorrectionRequest.bulkCreate(rows, { ignoreDuplicates: true, validate: true });
  return rows.length;
}

export interface RespondInput {
  requestId: number;
  respondedBy: string;
  answer: string;
  reason: string;
  // Only for a 'corrected' answer: field -> new value, for the fields the request is about.
  correctedValues: Record<string, unknown> | null;
  attestationAccepted: boolean;
}

export interface CorrectionResponseResult {
  responseId: number;
  requestId: number;
  interactionId: number;
  answer: CorrectionAnswer;
  correctedValues: Record<string, string> | null;
  reason: string;
  respondedBy: string;
  statement: string;
  respondedAt: Date;
  // false when this exact answer had already been recorded; that one is returned.
  created: boolean;
}

// What each kind of request lets the job seeker change: a reviewer's request names one
// field; a U1 request asks for whatever identifies the recruiter.
function fieldsRequestAllows(issueKey: string): readonly CorrectableField[] {
  if (issueKey === UNIDENTIFIED_RECRUITER_ISSUE) {
    return ['recruiterEmail', 'recruiterCompany'];
  }
  const field = issueKey.startsWith('reviewer:') ? issueKey.slice('reviewer:'.length) : '';
  return (CORRECTABLE_FIELDS as readonly string[]).includes(field) ? [field as CorrectableField] : [];
}

// Checks each new value with the same rules an upload uses, and returns them as stored:
// trimmed, emails lower-cased, dates as ISO strings.
function normalizeCorrectedValues(values: Record<string, unknown> | null): Record<string, string> {
  if (values === null || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length === 0) {
    throw new InvalidCorrectionRequestInputError('A correction needs at least one new value.');
  }
  const normalized: Record<string, string> = {};
  for (const [field, value] of Object.entries(values)) {
    if (!(CORRECTABLE_FIELDS as readonly string[]).includes(field)) {
      throw new InvalidCorrectionRequestInputError(`"${field}" is not a field that can be corrected.`);
    }
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      throw new InvalidCorrectionRequestInputError(`Enter a value for ${field}.`);
    }
    const parsed = recruiterInteractionSchema.shape[field as CorrectableField].safeParse(value);
    if (!parsed.success) {
      throw new InvalidCorrectionRequestInputError(`${field}: ${parsed.error.issues[0].message}`);
    }
    normalized[field] = parsed.data instanceof Date ? parsed.data.toISOString() : String(parsed.data);
  }
  return normalized;
}

function toResponseResult(response: CorrectionResponse, created: boolean): CorrectionResponseResult {
  return {
    responseId: response.id,
    requestId: response.requestId,
    interactionId: response.interactionId,
    answer: response.answer,
    correctedValues: response.correctedValues === null ? null : JSON.parse(response.correctedValues),
    reason: response.reason,
    respondedBy: response.respondedBy,
    statement: response.statement,
    respondedAt: response.respondedAt,
    created,
  };
}

/**
 * The job seeker's attested answer to a correction request (REQ-010): a correction, a
 * confirmation that the data is right as entered, or a statement that the information is
 * unavailable -- each with a reason. A correction is stored as a new version alongside the
 * original, which is never changed. Recording the answer and moving the request to 'answered'
 * (back with the data reviewer) happen in one transaction.
 *
 * Only someone who attested the interaction's submission may answer; a submission from before
 * attestations existed has no owner on record, so any job seeker ID is accepted and recorded.
 * Sending the same answer again returns the recorded one; any other answer to a request that
 * is no longer open is refused. Returns null when the request does not exist.
 */
export async function respondToCorrectionRequest(input: RespondInput): Promise<CorrectionResponseResult | null> {
  const respondedBy = requireText(input.respondedBy, 'Enter your job seeker ID to answer this request.');
  if (!(CORRECTION_ANSWERS as readonly string[]).includes(input.answer)) {
    throw new InvalidCorrectionRequestInputError(`Answer must be one of: ${CORRECTION_ANSWERS.join(', ')}.`);
  }
  const answer = input.answer as CorrectionAnswer;
  const reason = requireText(input.reason, 'Give a reason for your answer.');
  if (input.attestationAccepted !== true) {
    throw new InvalidCorrectionRequestInputError('You must attest that your answer is factual.');
  }
  let correctedValues: Record<string, string> | null = null;
  if (answer === 'corrected') {
    correctedValues = normalizeCorrectedValues(input.correctedValues);
  } else if (input.correctedValues !== null && Object.keys(input.correctedValues).length > 0) {
    throw new InvalidCorrectionRequestInputError('Only a correction can include new values.');
  }
  const correctedJson = correctedValues === null ? null : JSON.stringify(correctedValues);

  await ensureModelsSynced();

  return serializedTransaction(async (transaction) => {
    const request = await CorrectionRequest.findByPk(input.requestId, { transaction });
    if (!request) {
      return null;
    }

    const existing = await CorrectionResponse.findOne({ where: { requestId: request.id }, transaction });
    if (existing) {
      const sameAnswer =
        existing.respondedBy === respondedBy &&
        existing.answer === answer &&
        existing.reason === reason &&
        existing.correctedValues === correctedJson;
      if (sameAnswer) {
        return toResponseResult(existing, false);
      }
    }
    if (request.status !== 'open') {
      throw new CorrectionRequestNotOpenError(request.status);
    }

    const record = await RecruiterInteractionRecord.findByPk(request.interactionId, { transaction });
    if (!record) {
      // A request is only ever raised against an existing interaction, and interactions are never deleted.
      throw new Error(`Correction request ${request.id} points at missing interaction ${request.interactionId}`);
    }
    const owners = await SubmissionAttestation.findAll({
      where: { batchId: record.batchId },
      attributes: ['attestedBy'],
      transaction,
    });
    if (owners.length > 0 && !owners.some((owner) => owner.attestedBy === respondedBy)) {
      throw new NotSubmissionOwnerError();
    }

    if (correctedValues !== null) {
      const allowed = fieldsRequestAllows(request.issueKey);
      const outside = Object.keys(correctedValues).filter((field) => !allowed.includes(field as CorrectableField));
      if (outside.length > 0) {
        throw new InvalidCorrectionRequestInputError(
          `This request only covers ${allowed.join(' and ') || 'no fields'}; it cannot change ${outside.join(', ')}.`
        );
      }
    }

    const response = await CorrectionResponse.create(
      {
        requestId: request.id,
        interactionId: request.interactionId,
        answer,
        correctedValues: correctedJson,
        reason,
        respondedBy,
        statement: CORRECTION_ATTESTATION_STATEMENT,
      },
      { transaction }
    );
    await request.update({ status: 'answered' }, { transaction });

    return toResponseResult(response, true);
  });
}

export interface WithdrawInput {
  requestId: number;
  reviewerId: string;
  reason: string;
}

export interface WithdrawResult {
  requestId: number;
  interactionId: number;
  closedBy: string;
  closedAt: Date;
  closeReason: string;
  // false when this reviewer had already withdrawn it for this reason; that withdrawal is returned.
  created: boolean;
}

/**
 * A data reviewer closes a request that is still waiting on the job seeker, without ruling --
 * for instance because it was raised in error, or they decide to rule without the answer
 * (REQ-010). Who, when and why are recorded on the request. Only an open request can be
 * withdrawn: an answered one carries a correction the reviewer has not yet ruled on, so it is
 * closed by a decision instead, never set aside. Returns null when the request does not exist.
 */
export async function withdrawCorrectionRequest(input: WithdrawInput): Promise<WithdrawResult | null> {
  const reviewerId = requireText(input.reviewerId, 'A reviewer ID is required to withdraw a request.');
  const reason = requireText(input.reason, 'Give a reason for withdrawing the request.');

  await ensureModelsSynced();

  return serializedTransaction(async (transaction) => {
    const request = await CorrectionRequest.findByPk(input.requestId, { transaction });
    if (!request) {
      return null;
    }
    const alreadyWithdrawn =
      request.status === 'closed' &&
      request.closedByDecisionId === null &&
      request.closedBy === reviewerId &&
      request.closeReason === reason;
    if (!alreadyWithdrawn) {
      if (request.status !== 'open') {
        throw new CorrectionRequestNotOpenError(request.status);
      }
      await request.update(
        { status: 'closed', openKey: null, closedBy: reviewerId, closedAt: new Date(), closeReason: reason },
        { transaction }
      );
    }
    return {
      requestId: request.id,
      interactionId: request.interactionId,
      closedBy: request.closedBy!,
      closedAt: request.closedAt!,
      closeReason: request.closeReason!,
      created: !alreadyWithdrawn,
    };
  });
}

export interface OpenCorrectionRequestItem {
  requestId: number;
  interactionId: number;
  issueKey: string;
  // The fields the job seeker may change in answer, with their current values.
  fields: CorrectableField[];
  currentValues: Partial<Record<CorrectableField, string | Date | null>>;
  raisedByType: CorrectionRequestRaiser;
  raisedBy: string;
  reason: string;
  raisedAt: Date;
  // Enough of the interaction for the job seeker to recognise it.
  interaction: { recruiterName: string; recruiterCompany: string | null; interactionDate: Date; interactionType: string };
  // Who may answer: the job seekers who attested the submission. Empty for a submission made
  // before attestations existed, which any job seeker ID may answer.
  forJobSeekers: string[];
}

/**
 * Every correction request still waiting on a job seeker, oldest first, for the "Requests for
 * you" list (REQ-010). There is no login yet, so this lists all of them and says whom each is
 * for; answering checks the job seeker's ID against the submission's attesters.
 */
export async function listOpenCorrectionRequests(): Promise<OpenCorrectionRequestItem[]> {
  await ensureModelsSynced();

  const requests = await CorrectionRequest.findAll({ where: { status: 'open' }, order: [['id', 'ASC']] });
  if (requests.length === 0) {
    return [];
  }
  const records = await RecruiterInteractionRecord.findAll({
    where: { id: [...new Set(requests.map((request) => request.interactionId))] },
  });
  const current = new Map((await getCurrentVersions(records)).map((record) => [record.id, record]));
  const attestations = await SubmissionAttestation.findAll({
    where: { batchId: [...new Set(records.map((record) => record.batchId))] },
    attributes: ['batchId', 'attestedBy'],
    order: [['id', 'ASC']],
  });

  return requests.map((request) => {
    const record = current.get(request.interactionId);
    if (!record) {
      // A request is only ever raised against an existing interaction, and interactions are never deleted.
      throw new Error(`Correction request ${request.id} points at missing interaction ${request.interactionId}`);
    }
    const fields = [...fieldsRequestAllows(request.issueKey)];
    return {
      requestId: request.id,
      interactionId: request.interactionId,
      issueKey: request.issueKey,
      fields,
      currentValues: Object.fromEntries(fields.map((field) => [field, record[field]])),
      raisedByType: request.raisedByType,
      raisedBy: request.raisedBy,
      reason: request.reason,
      raisedAt: request.raisedAt,
      interaction: {
        recruiterName: record.recruiterName,
        recruiterCompany: record.recruiterCompany,
        interactionDate: record.interactionDate,
        interactionType: record.interactionType,
      },
      forJobSeekers: attestations
        .filter((attestation) => attestation.batchId === record.batchId)
        .map((attestation) => attestation.attestedBy),
    };
  });
}

export interface CorrectionRequestHistoryItem {
  requestId: number;
  issueKey: string;
  fields: CorrectableField[];
  raisedByType: CorrectionRequestRaiser;
  raisedBy: string;
  reason: string;
  raisedAt: Date;
  status: CorrectionRequestStatus;
  response: {
    answer: CorrectionAnswer;
    correctedValues: Record<string, string> | null;
    reason: string;
    respondedBy: string;
    statement: string;
    respondedAt: Date;
  } | null;
  closedBy: string | null;
  closedAt: Date | null;
  closedByDecisionId: number | null;
  closeReason: string | null;
}

/**
 * Every correction request ever raised on one interaction, newest first, with the job seeker's
 * answer and how each was closed: the interaction's correction audit trail, for its detail page.
 */
export async function listCorrectionRequestsForInteraction(interactionId: number): Promise<CorrectionRequestHistoryItem[]> {
  await ensureModelsSynced();

  const requests = await CorrectionRequest.findAll({ where: { interactionId }, order: [['id', 'DESC']] });
  if (requests.length === 0) {
    return [];
  }
  const responses = await CorrectionResponse.findAll({ where: { requestId: requests.map((request) => request.id) } });
  const responseByRequest = new Map(responses.map((response) => [response.requestId, response]));

  return requests.map((request) => {
    const response = responseByRequest.get(request.id);
    return {
      requestId: request.id,
      issueKey: request.issueKey,
      fields: [...fieldsRequestAllows(request.issueKey)],
      raisedByType: request.raisedByType,
      raisedBy: request.raisedBy,
      reason: request.reason,
      raisedAt: request.raisedAt,
      status: request.status,
      response: response
        ? {
            answer: response.answer,
            correctedValues: response.correctedValues === null ? null : JSON.parse(response.correctedValues),
            reason: response.reason,
            respondedBy: response.respondedBy,
            statement: response.statement,
            respondedAt: response.respondedAt,
          }
        : null,
      closedBy: request.closedBy ?? null,
      closedAt: request.closedAt ?? null,
      closedByDecisionId: request.closedByDecisionId ?? null,
      closeReason: request.closeReason ?? null,
    };
  });
}
