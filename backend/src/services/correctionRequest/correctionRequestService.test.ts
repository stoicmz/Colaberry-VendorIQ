import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { CorrectionRequest } from '../../models/CorrectionRequest';
import { HistoryReviewDecision } from '../../models/HistoryReviewDecision';
import { CorrectionResponse } from '../../models/CorrectionResponse';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import {
  CORRECTION_ATTESTATION_STATEMENT,
  CorrectionRequestNotOpenError,
  InvalidCorrectionRequestInputError,
  NotSubmissionOwnerError,
  raiseCorrectionRequest,
  raiseSystemCorrectionRequests,
  respondToCorrectionRequest,
} from './correctionRequestService';
import * as uncertainDataService from '../uncertainData/uncertainDataService';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await sequelize.close();
});

let hashCounter = 0;
async function seedInteraction(options: { identifiable: boolean; attestedBy?: string }): Promise<number> {
  const seedNumber = hashCounter++;
  const fileHash = String(seedNumber).padStart(64, '0');
  const batch = await IngestionBatch.create({ fileHash, fileName: 'i.csv', totalRows: 1, validCount: 1, errorCount: 0 });
  if (options.attestedBy) {
    await SubmissionAttestation.create({
      batchId: batch.id,
      correlationId: 'corr',
      attestedBy: options.attestedBy,
      statement: 'factual',
      channel: 'file',
      fileHash,
    });
  }
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

const reviewerInput = { reviewerId: 'rev-1', field: 'recruiterCompany', reason: 'Company looks like a typo' };

describe('raiseCorrectionRequest', () => {
  it('records an open request with the reviewer ID, field, reason and time', async () => {
    const id = await seedInteraction({ identifiable: true });

    const result = await raiseCorrectionRequest({ interactionId: id, ...reviewerInput });

    expect(result).toMatchObject({
      interactionId: id,
      issueKey: 'reviewer:recruiterCompany',
      raisedByType: 'reviewer',
      raisedBy: 'rev-1',
      reason: 'Company looks like a typo',
      status: 'open',
      created: true,
    });
    expect(result!.raisedAt).toBeInstanceOf(Date);
  });

  it('never changes the interaction itself', async () => {
    const id = await seedInteraction({ identifiable: true });
    const before = (await RecruiterInteractionRecord.findByPk(id))!.toJSON();

    await raiseCorrectionRequest({ interactionId: id, ...reviewerInput });

    expect((await RecruiterInteractionRecord.findByPk(id))!.toJSON()).toEqual(before);
  });

  it('returns the live request instead of raising the same field twice', async () => {
    const id = await seedInteraction({ identifiable: true });
    const first = await raiseCorrectionRequest({ interactionId: id, ...reviewerInput });

    const second = await raiseCorrectionRequest({ interactionId: id, ...reviewerInput, reviewerId: 'rev-2' });

    expect(second).toMatchObject({ requestId: first!.requestId, raisedBy: 'rev-1', created: false });
    expect(await CorrectionRequest.count()).toBe(1);
  });

  it('raises only one request when the same raise arrives twice at once', async () => {
    const id = await seedInteraction({ identifiable: true });

    const results = await Promise.all([
      raiseCorrectionRequest({ interactionId: id, ...reviewerInput }),
      raiseCorrectionRequest({ interactionId: id, ...reviewerInput }),
    ]);

    expect(await CorrectionRequest.count()).toBe(1);
    expect(results.filter((r) => r!.created)).toHaveLength(1);
    expect(results[0]!.requestId).toBe(results[1]!.requestId);
  });

  it('allows requests on different fields of the same interaction', async () => {
    const id = await seedInteraction({ identifiable: true });

    await raiseCorrectionRequest({ interactionId: id, ...reviewerInput });
    await raiseCorrectionRequest({ interactionId: id, ...reviewerInput, field: 'interactionDate' });

    expect(await CorrectionRequest.count({ where: { interactionId: id } })).toBe(2);
  });

  it('allows a request on an interaction a reviewer already confirmed', async () => {
    const id = await seedInteraction({ identifiable: true });
    await HistoryReviewDecision.create({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });

    expect((await raiseCorrectionRequest({ interactionId: id, ...reviewerInput }))!.created).toBe(true);
  });

  it('returns null for an interaction that does not exist', async () => {
    expect(await raiseCorrectionRequest({ interactionId: 9999, ...reviewerInput })).toBeNull();
    expect(await CorrectionRequest.count()).toBe(0);
  });

  it.each([
    ['no reviewer ID', { reviewerId: '  ' }],
    ['no reason', { reason: '' }],
    ['an unknown field', { field: 'salary' }],
  ])('refuses a request with %s and records nothing', async (_label, override) => {
    const id = await seedInteraction({ identifiable: true });

    await expect(raiseCorrectionRequest({ interactionId: id, ...reviewerInput, ...override })).rejects.toBeInstanceOf(
      InvalidCorrectionRequestInputError
    );
    expect(await CorrectionRequest.count()).toBe(0);
  });
});

describe('raiseSystemCorrectionRequests', () => {
  it('asks the job seeker to identify the recruiter for each U1-flagged interaction', async () => {
    const unidentified = await seedInteraction({ identifiable: false });
    await seedInteraction({ identifiable: true });

    expect(await raiseSystemCorrectionRequests()).toBe(1);

    const requests = await CorrectionRequest.findAll();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      interactionId: unidentified,
      issueKey: 'rule:unidentified_recruiter',
      raisedByType: 'system',
      raisedBy: 'system',
      status: 'open',
    });
    expect(requests[0].reason).toContain('Recruiter cannot be identified');
  });

  it('raises nothing new when run again', async () => {
    await seedInteraction({ identifiable: false });
    await raiseSystemCorrectionRequests();

    expect(await raiseSystemCorrectionRequests()).toBe(0);
    expect(await CorrectionRequest.count()).toBe(1);
  });

  it('does not raise the same request again after a reviewer closed it', async () => {
    const id = await seedInteraction({ identifiable: false });
    await raiseSystemCorrectionRequests();
    await CorrectionRequest.update(
      { status: 'closed', openKey: null, closedBy: 'rev-1', closedAt: new Date(), closeReason: 'No longer needed' },
      { where: { interactionId: id } }
    );

    expect(await raiseSystemCorrectionRequests()).toBe(0);
    expect(await CorrectionRequest.count()).toBe(1);
  });

  it('leaves alone an interaction a reviewer has already ruled on', async () => {
    const id = await seedInteraction({ identifiable: false });
    await HistoryReviewDecision.create({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });

    expect(await raiseSystemCorrectionRequests()).toBe(0);
    expect(await CorrectionRequest.count()).toBe(0);
  });

  it('creates no duplicates when two runs overlap', async () => {
    await seedInteraction({ identifiable: false });

    await Promise.all([raiseSystemCorrectionRequests(), raiseSystemCorrectionRequests()]);

    expect(await CorrectionRequest.count()).toBe(1);
  });

  it('passes on a failure of the rules instead of hiding it', async () => {
    await seedInteraction({ identifiable: false });
    jest.spyOn(uncertainDataService, 'detectStoredUncertainData').mockRejectedValueOnce(new Error('rules crashed'));

    await expect(raiseSystemCorrectionRequests()).rejects.toThrow('rules crashed');
    expect(await CorrectionRequest.count()).toBe(0);
  });
});

describe('respondToCorrectionRequest', () => {
  async function openRequest(options: { field?: string; system?: boolean; attestedBy?: string | null } = {}) {
    const attestedBy = options.attestedBy === null ? undefined : options.attestedBy ?? 'seeker-ana';
    const interactionId = await seedInteraction({ identifiable: !options.system, attestedBy });
    if (options.system) {
      await raiseSystemCorrectionRequests();
      const request = await CorrectionRequest.findOne({ where: { interactionId } });
      return { interactionId, requestId: request!.id };
    }
    const raised = await raiseCorrectionRequest({
      interactionId,
      ...reviewerInput,
      field: options.field ?? 'recruiterCompany',
    });
    return { interactionId, requestId: raised!.requestId };
  }

  const correction = {
    respondedBy: 'seeker-ana',
    answer: 'corrected',
    reason: 'The company was on the email signature',
    correctedValues: { recruiterCompany: '  Acme Staffing ' } as Record<string, unknown> | null,
    attestationAccepted: true,
  };

  it('records a correction as a new attested version and returns the request to the reviewer', async () => {
    const { interactionId, requestId } = await openRequest();
    const original = (await RecruiterInteractionRecord.findByPk(interactionId))!.toJSON();

    const result = await respondToCorrectionRequest({ requestId, ...correction });

    expect(result).toMatchObject({
      requestId,
      interactionId,
      answer: 'corrected',
      correctedValues: { recruiterCompany: 'Acme Staffing' },
      reason: correction.reason,
      respondedBy: 'seeker-ana',
      statement: CORRECTION_ATTESTATION_STATEMENT,
      created: true,
    });
    expect(result!.respondedAt).toBeInstanceOf(Date);
    expect((await CorrectionRequest.findByPk(requestId))!.status).toBe('answered');
    // The original is kept exactly as submitted.
    expect((await RecruiterInteractionRecord.findByPk(interactionId))!.toJSON()).toEqual(original);
  });

  it.each(['confirmed_as_is', 'unavailable'])('records the answer %s with its reason and no new values', async (answer) => {
    const { requestId } = await openRequest();

    const result = await respondToCorrectionRequest({ requestId, ...correction, answer, correctedValues: null });

    expect(result).toMatchObject({ answer, correctedValues: null, reason: correction.reason });
    expect((await CorrectionRequest.findByPk(requestId))!.status).toBe('answered');
  });

  it('lets a U1 request be answered with the email and the company', async () => {
    const { requestId } = await openRequest({ system: true });

    const result = await respondToCorrectionRequest({
      requestId,
      ...correction,
      correctedValues: { recruiterEmail: 'Jane@Acme.com', recruiterCompany: 'Acme' },
    });

    expect(result!.correctedValues).toEqual({ recruiterEmail: 'jane@acme.com', recruiterCompany: 'Acme' });
  });

  it('stores a corrected date in the same form as an upload', async () => {
    const { requestId } = await openRequest({ field: 'interactionDate' });

    const result = await respondToCorrectionRequest({
      requestId,
      ...correction,
      correctedValues: { interactionDate: '2026-08-03' },
    });

    expect(result!.correctedValues).toEqual({ interactionDate: '2026-08-03T00:00:00.000Z' });
  });

  it('returns the recorded answer when the same answer is sent again', async () => {
    const { requestId } = await openRequest();
    const first = await respondToCorrectionRequest({ requestId, ...correction });

    const second = await respondToCorrectionRequest({ requestId, ...correction });

    expect(second).toMatchObject({ responseId: first!.responseId, created: false });
    expect(await CorrectionResponse.count()).toBe(1);
  });

  it('records one answer when the same answer arrives twice at once', async () => {
    const { requestId } = await openRequest();

    const results = await Promise.all([
      respondToCorrectionRequest({ requestId, ...correction }),
      respondToCorrectionRequest({ requestId, ...correction }),
    ]);

    expect(await CorrectionResponse.count()).toBe(1);
    expect(results.filter((r) => r!.created)).toHaveLength(1);
  });

  it('refuses a different answer once the request has been answered', async () => {
    const { requestId } = await openRequest();
    await respondToCorrectionRequest({ requestId, ...correction });

    await expect(
      respondToCorrectionRequest({ requestId, ...correction, answer: 'unavailable', correctedValues: null })
    ).rejects.toBeInstanceOf(CorrectionRequestNotOpenError);
    expect(await CorrectionResponse.count()).toBe(1);
  });

  it('refuses an answer to a closed request', async () => {
    const { requestId } = await openRequest();
    await CorrectionRequest.update(
      { status: 'closed', openKey: null, closedBy: 'rev-1', closedAt: new Date(), closeReason: 'No longer needed' },
      { where: { id: requestId } }
    );

    await expect(respondToCorrectionRequest({ requestId, ...correction })).rejects.toBeInstanceOf(
      CorrectionRequestNotOpenError
    );
    expect(await CorrectionResponse.count()).toBe(0);
  });

  it('refuses an answer from someone who did not attest the submission', async () => {
    const { requestId } = await openRequest();

    await expect(
      respondToCorrectionRequest({ requestId, ...correction, respondedBy: 'seeker-ben' })
    ).rejects.toBeInstanceOf(NotSubmissionOwnerError);
    expect(await CorrectionResponse.count()).toBe(0);
    expect((await CorrectionRequest.findByPk(requestId))!.status).toBe('open');
  });

  it('accepts any job seeker ID for a submission that was never attested', async () => {
    const { requestId } = await openRequest({ attestedBy: null });

    const result = await respondToCorrectionRequest({ requestId, ...correction, respondedBy: 'seeker-ben' });

    expect(result!.respondedBy).toBe('seeker-ben');
  });

  it('refuses a correction to a field the request is not about', async () => {
    const { requestId } = await openRequest();

    await expect(
      respondToCorrectionRequest({ requestId, ...correction, correctedValues: { recruiterName: 'John Roe' } })
    ).rejects.toThrow('cannot change recruiterName');
    expect(await CorrectionResponse.count()).toBe(0);
    expect((await CorrectionRequest.findByPk(requestId))!.status).toBe('open');
  });

  it('refuses a U1 correction that changes the recruiter name', async () => {
    const { requestId } = await openRequest({ system: true });

    await expect(
      respondToCorrectionRequest({ requestId, ...correction, correctedValues: { recruiterName: 'John Roe' } })
    ).rejects.toBeInstanceOf(InvalidCorrectionRequestInputError);
  });

  it.each([
    ['no responder', { respondedBy: ' ' }],
    ['an unknown answer', { answer: 'maybe' }],
    ['no reason', { reason: '' }],
    ['no attestation', { attestationAccepted: false }],
    ['a correction with no values', { correctedValues: null }],
    ['a correction with an empty value', { correctedValues: { recruiterCompany: '  ' } }],
    ['a confirmation that carries values', { answer: 'confirmed_as_is' }],
  ])('refuses an answer with %s and records nothing', async (_label, override) => {
    const { requestId } = await openRequest();

    await expect(respondToCorrectionRequest({ requestId, ...correction, ...override })).rejects.toBeInstanceOf(
      InvalidCorrectionRequestInputError
    );
    expect(await CorrectionResponse.count()).toBe(0);
    expect((await CorrectionRequest.findByPk(requestId))!.status).toBe('open');
  });

  it('refuses a value that an upload would reject', async () => {
    const { requestId } = await openRequest({ system: true });

    await expect(
      respondToCorrectionRequest({ requestId, ...correction, correctedValues: { recruiterEmail: 'not-an-email' } })
    ).rejects.toThrow('recruiterEmail');
    expect(await CorrectionResponse.count()).toBe(0);
  });

  it('returns null for a request that does not exist', async () => {
    expect(await respondToCorrectionRequest({ requestId: 9999, ...correction })).toBeNull();
  });
});
