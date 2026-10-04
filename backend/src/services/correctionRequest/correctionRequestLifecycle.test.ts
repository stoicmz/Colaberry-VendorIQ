import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import { CorrectionRequest } from '../../models/CorrectionRequest';
import { HistoryReviewDecision } from '../../models/HistoryReviewDecision';
import { InteractionDispute } from '../../models/InteractionDispute';
import {
  CorrectionRequestNotOpenError,
  InvalidCorrectionRequestInputError,
  raiseCorrectionRequest,
  raiseSystemCorrectionRequests,
  respondToCorrectionRequest,
  withdrawCorrectionRequest,
} from './correctionRequestService';
import {
  AwaitingJobSeekerError,
  decideHistoryReview,
  disputeInteraction,
  listPendingReview,
} from '../historyReview/historyReviewService';
import { getHistoryStatuses } from '../historyStatus/historyStatusService';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

let hashCounter = 0;
async function seedInteraction(options: { identifiable: boolean }): Promise<number> {
  const seedNumber = hashCounter++;
  const fileHash = String(seedNumber).padStart(64, '0');
  const batch = await IngestionBatch.create({ fileHash, fileName: 'i.csv', totalRows: 1, validCount: 1, errorCount: 0 });
  await SubmissionAttestation.create({
    batchId: batch.id,
    correlationId: 'corr',
    attestedBy: 'seeker-ana',
    statement: 'factual',
    channel: 'file',
    fileHash,
  });
  const record = await RecruiterInteractionRecord.create({
    batchId: batch.id,
    recruiterName: `Jane Doe ${seedNumber}`,
    recruiterEmail: null,
    recruiterCompany: options.identifiable ? 'Acme' : null,
    // A different day per seed, so separate uploads are not STORY-005 possible duplicates.
    interactionDate: new Date(Date.UTC(2026, 7, 1 + seedNumber)),
    interactionType: 'email',
    channel: null,
    notes: null,
  });
  return record.id;
}

async function statusOf(id: number) {
  return (await getHistoryStatuses([id])).get(id);
}

const answer = { respondedBy: 'seeker-ana', reason: 'From the email signature', attestationAccepted: true };

async function raise(interactionId: number) {
  const raised = await raiseCorrectionRequest({
    interactionId,
    reviewerId: 'rev-1',
    field: 'recruiterCompany',
    reason: 'Company looks wrong',
  });
  return raised!.requestId;
}

describe('a reviewer ruling and correction requests', () => {
  it('refuses to rule while a request waits on the job seeker, and records nothing', async () => {
    const id = await seedInteraction({ identifiable: true });
    await raise(id);

    await expect(
      decideHistoryReview({ interactionId: id, reviewerId: 'rev-1', decision: 'rejected', note: null })
    ).rejects.toBeInstanceOf(AwaitingJobSeekerError);
    expect(await HistoryReviewDecision.count()).toBe(0);
  });

  it('closes the answered request in the same ruling, linked to that decision', async () => {
    const id = await seedInteraction({ identifiable: true });
    const requestId = await raise(id);
    await respondToCorrectionRequest({
      requestId,
      ...answer,
      answer: 'corrected',
      correctedValues: { recruiterCompany: 'Acme Staffing' },
    });
    expect((await statusOf(id))?.reason).toBe('correction_answered');

    const decision = await decideHistoryReview({ interactionId: id, reviewerId: 'rev-2', decision: 'confirmed', note: null });

    expect(decision!.closedRequestCount).toBe(1);
    const closed = await CorrectionRequest.findByPk(requestId);
    expect(closed).toMatchObject({
      status: 'closed',
      openKey: null,
      closedBy: 'rev-2',
      closedByDecisionId: decision!.decisionId,
      closeReason: null,
    });
    expect(closed!.closedAt).toEqual(decision!.decidedAt);
    expect(await statusOf(id)).toEqual({ status: 'confirmed', reason: 'reviewer_confirmed' });
  });

  it('closes an answered request and a dispute together in one ruling', async () => {
    const id = await seedInteraction({ identifiable: true });
    const requestId = await raise(id);
    await respondToCorrectionRequest({ requestId, ...answer, answer: 'confirmed_as_is', correctedValues: null });
    await disputeInteraction({ interactionId: id, disputedBy: 'recruiter-jane', reason: 'Wrong company' });
    expect((await statusOf(id))?.reason).toBe('disputed');

    const decision = await decideHistoryReview({ interactionId: id, reviewerId: 'rev-2', decision: 'rejected', note: 'x' });

    expect(decision).toMatchObject({ resolvedDisputeCount: 1, closedRequestCount: 1 });
    expect(await statusOf(id)).toEqual({ status: 'rejected', reason: 'reviewer_rejected' });
    expect(await InteractionDispute.count({ where: { resolvedByDecisionId: null } })).toBe(0);
  });

  it('runs the whole system path once: flag, request, answer, ruling -- and never re-raises it', async () => {
    const id = await seedInteraction({ identifiable: false });
    await raiseSystemCorrectionRequests();
    // A system request does not hold the reviewer up: the data stays uncertain, in review.
    expect((await statusOf(id))?.reason).toBe('uncertain');

    const request = await CorrectionRequest.findOne({ where: { interactionId: id } });
    await respondToCorrectionRequest({ requestId: request!.id, ...answer, answer: 'unavailable', correctedValues: null });
    // The flag still stands (there was no email to add), so the reviewer sees it with the answer.
    expect(await statusOf(id)).toMatchObject({
      status: 'pending_review',
      reason: 'correction_answered',
      uncertainFlags: [expect.objectContaining({ ruleId: 'unidentified_recruiter' })],
    });

    await decideHistoryReview({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: 'Name is enough here' });
    expect(await statusOf(id)).toEqual({ status: 'confirmed', reason: 'reviewer_confirmed' });

    expect(await raiseSystemCorrectionRequests()).toBe(0);
    expect(await CorrectionRequest.count({ where: { interactionId: id } })).toBe(1);
  });
});

describe('withdrawCorrectionRequest', () => {
  const withdrawal = { reviewerId: 'rev-1', reason: 'Raised on the wrong interaction' };

  it('closes an open request with who, when and why, and the reviewer can then rule', async () => {
    const id = await seedInteraction({ identifiable: true });
    await HistoryReviewDecision.create({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });
    const requestId = await raise(id);

    const result = await withdrawCorrectionRequest({ requestId, ...withdrawal });

    expect(result).toMatchObject({
      requestId,
      interactionId: id,
      closedBy: 'rev-1',
      closeReason: withdrawal.reason,
      created: true,
    });
    expect(result!.closedAt).toBeInstanceOf(Date);
    expect((await CorrectionRequest.findByPk(requestId))!.status).toBe('closed');
    // The earlier ruling stands again.
    expect(await statusOf(id)).toEqual({ status: 'confirmed', reason: 'reviewer_confirmed' });
  });

  it('returns the recorded withdrawal when the same withdrawal is sent again', async () => {
    const id = await seedInteraction({ identifiable: true });
    const requestId = await raise(id);
    const first = await withdrawCorrectionRequest({ requestId, ...withdrawal });

    const second = await withdrawCorrectionRequest({ requestId, ...withdrawal });

    expect(second).toMatchObject({ created: false, closedAt: first!.closedAt });
  });

  it('refuses to withdraw an answered request, so an unreviewed correction is never set aside', async () => {
    const id = await seedInteraction({ identifiable: true });
    const requestId = await raise(id);
    await respondToCorrectionRequest({
      requestId,
      ...answer,
      answer: 'corrected',
      correctedValues: { recruiterCompany: 'Acme Staffing' },
    });

    await expect(withdrawCorrectionRequest({ requestId, ...withdrawal })).rejects.toBeInstanceOf(
      CorrectionRequestNotOpenError
    );
    expect((await CorrectionRequest.findByPk(requestId))!.status).toBe('answered');
  });

  it('refuses to withdraw a request already closed by a ruling', async () => {
    const id = await seedInteraction({ identifiable: true });
    const requestId = await raise(id);
    await respondToCorrectionRequest({ requestId, ...answer, answer: 'confirmed_as_is', correctedValues: null });
    await decideHistoryReview({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });

    await expect(withdrawCorrectionRequest({ requestId, ...withdrawal })).rejects.toBeInstanceOf(
      CorrectionRequestNotOpenError
    );
  });

  it.each([
    ['no reviewer ID', { reviewerId: '' }],
    ['no reason', { reason: '  ' }],
  ])('refuses a withdrawal with %s and leaves the request open', async (_label, override) => {
    const id = await seedInteraction({ identifiable: true });
    const requestId = await raise(id);

    await expect(withdrawCorrectionRequest({ requestId, ...withdrawal, ...override })).rejects.toBeInstanceOf(
      InvalidCorrectionRequestInputError
    );
    expect((await CorrectionRequest.findByPk(requestId))!.status).toBe('open');
  });

  it('returns null for a request that does not exist', async () => {
    expect(await withdrawCorrectionRequest({ requestId: 9999, ...withdrawal })).toBeNull();
  });
});

describe('the review queue and correction requests', () => {
  it('leaves out an interaction while it waits on the job seeker', async () => {
    const id = await seedInteraction({ identifiable: true });
    await raise(id);

    expect((await listPendingReview()).map((item) => item.interactionId)).not.toContain(id);
  });

  it('lists an answered correction with the request, the attested answer, and original beside corrected', async () => {
    const id = await seedInteraction({ identifiable: true });
    const requestId = await raise(id);
    await respondToCorrectionRequest({
      requestId,
      ...answer,
      answer: 'corrected',
      correctedValues: { recruiterCompany: 'Acme Staffing' },
    });

    const item = (await listPendingReview()).find((i) => i.interactionId === id)!;

    expect(item).toMatchObject({
      reason: 'correction_answered',
      recruiterCompany: 'Acme Staffing',
      correctedFields: ['recruiterCompany'],
      originalValues: { recruiterCompany: 'Acme' },
    });
    expect(item.answeredRequests).toHaveLength(1);
    expect(item.answeredRequests[0]).toMatchObject({
      requestId,
      issueKey: 'reviewer:recruiterCompany',
      raisedByType: 'reviewer',
      raisedBy: 'rev-1',
      reason: 'Company looks wrong',
      response: {
        answer: 'corrected',
        correctedValues: { recruiterCompany: 'Acme Staffing' },
        reason: answer.reason,
        respondedBy: 'seeker-ana',
      },
    });
    expect(item.answeredRequests[0].response.statement).toContain('I attest');
    expect(item.answeredRequests[0].response.respondedAt).toBeInstanceOf(Date);
  });

  it('still shows the answer when the interaction is in the queue because it is also disputed', async () => {
    const id = await seedInteraction({ identifiable: true });
    const requestId = await raise(id);
    await respondToCorrectionRequest({ requestId, ...answer, answer: 'unavailable', correctedValues: null });
    await disputeInteraction({ interactionId: id, disputedBy: 'recruiter-jane', reason: 'Wrong company' });

    const item = (await listPendingReview()).find((i) => i.interactionId === id)!;

    expect(item.reason).toBe('disputed');
    expect(item.answeredRequests.map((r) => r.response.answer)).toEqual(['unavailable']);
    expect(item.correctedFields).toEqual([]);
  });

  it('lists nothing for an interaction once the ruling has closed its request', async () => {
    const id = await seedInteraction({ identifiable: true });
    const requestId = await raise(id);
    await respondToCorrectionRequest({ requestId, ...answer, answer: 'confirmed_as_is', correctedValues: null });
    await decideHistoryReview({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });

    expect((await listPendingReview()).map((item) => item.interactionId)).not.toContain(id);
  });

  it('refuses to show a request marked answered that has no answer, rather than hiding the gap', async () => {
    const id = await seedInteraction({ identifiable: true });
    const requestId = await raise(id);
    await CorrectionRequest.update({ status: 'answered' }, { where: { id: requestId } });

    await expect(listPendingReview()).rejects.toThrow('marked answered but has no answer');
  });
});

describe('system requests never hold up the reviewer (STORY-005 stays as verified)', () => {
  async function systemRequestFor(id: number) {
    await raiseSystemCorrectionRequests();
    return (await CorrectionRequest.findOne({ where: { interactionId: id } }))!;
  }

  it('keeps uncertain data in the queue, notes that the job seeker has been asked', async () => {
    const id = await seedInteraction({ identifiable: false });
    const request = await systemRequestFor(id);

    const item = (await listPendingReview()).find((i) => i.interactionId === id)!;

    expect(item.reason).toBe('uncertain');
    expect(item.uncertainFlags).toEqual([expect.objectContaining({ ruleId: 'unidentified_recruiter' })]);
    expect(item.openRequests).toEqual([
      expect.objectContaining({ requestId: request.id, raisedByType: 'system', issueKey: 'rule:unidentified_recruiter' }),
    ]);
    expect(item.answeredRequests).toEqual([]);
  });

  it('lets the reviewer rule without waiting, and the ruling closes the unanswered system request', async () => {
    const id = await seedInteraction({ identifiable: false });
    const request = await systemRequestFor(id);

    const decision = await decideHistoryReview({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });

    expect(decision!.closedRequestCount).toBe(1);
    expect(await CorrectionRequest.findByPk(request.id)).toMatchObject({
      status: 'closed',
      closedBy: 'rev-1',
      closedByDecisionId: decision!.decisionId,
    });
    expect(await statusOf(id)).toEqual({ status: 'confirmed', reason: 'reviewer_confirmed' });
    // Once ruled on and closed, the job seeker can no longer answer it.
    await expect(
      respondToCorrectionRequest({ requestId: request.id, ...answer, answer: 'unavailable', correctedValues: null })
    ).rejects.toBeInstanceOf(CorrectionRequestNotOpenError);
  });

  it('still blocks a ruling while a reviewer’s own request is open, even alongside a system one', async () => {
    const id = await seedInteraction({ identifiable: false });
    await systemRequestFor(id);
    await raiseCorrectionRequest({ interactionId: id, reviewerId: 'rev-1', field: 'interactionDate', reason: 'Date looks off' });

    expect((await statusOf(id))?.reason).toBe('awaiting_job_seeker');
    await expect(
      decideHistoryReview({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null })
    ).rejects.toBeInstanceOf(AwaitingJobSeekerError);
  });

  it('clears the flag and moves to the reviewer once the job seeker supplies the missing email', async () => {
    const id = await seedInteraction({ identifiable: false });
    const request = await systemRequestFor(id);

    await respondToCorrectionRequest({
      requestId: request.id,
      ...answer,
      answer: 'corrected',
      correctedValues: { recruiterEmail: 'jane@acme.com' },
    });

    expect(await statusOf(id)).toEqual({ status: 'pending_review', reason: 'correction_answered' });
  });
});
