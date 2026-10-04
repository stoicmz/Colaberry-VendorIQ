import request from 'supertest';
import { buildApp } from '../index';
import { sequelize } from '../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../models/SubmissionAttestation';
import { CorrectionRequest } from '../models/CorrectionRequest';
import { CorrectionResponse } from '../models/CorrectionResponse';
import * as correctionRequestService from '../services/correctionRequest/correctionRequestService';

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
async function seedInteraction(options: { identifiable?: boolean; attestedBy?: string | null } = {}): Promise<number> {
  const seedNumber = hashCounter++;
  const fileHash = String(seedNumber).padStart(64, '0');
  const batch = await IngestionBatch.create({ fileHash, fileName: 'i.csv', totalRows: 1, validCount: 1, errorCount: 0 });
  const attestedBy = options.attestedBy === undefined ? 'seeker-ana' : options.attestedBy;
  if (attestedBy) {
    await SubmissionAttestation.create({ batchId: batch.id, correlationId: 'corr', attestedBy, statement: 'factual', channel: 'file', fileHash });
  }
  const record = await RecruiterInteractionRecord.create({
    batchId: batch.id,
    recruiterName: 'Jane Doe',
    recruiterEmail: null,
    recruiterCompany: options.identifiable === false ? null : 'Acme',
    // A different day per seed, so separate uploads are not STORY-005 possible duplicates.
    interactionDate: new Date(Date.UTC(2026, 7, 1 + seedNumber)),
    interactionType: 'email',
    channel: null,
    notes: null,
  });
  return record.id;
}

const app = () => request(buildApp());
const raiseBody = { reviewerId: 'rev-1', field: 'recruiterCompany', reason: 'Company looks wrong' };
const answerBody = {
  respondedBy: 'seeker-ana',
  answer: 'corrected',
  reason: 'From the email signature',
  correctedValues: { recruiterCompany: 'Acme Staffing' },
  attestationAccepted: true,
};

async function raised(interactionId: number): Promise<number> {
  const res = await app().post('/api/correction-requests').send({ interactionId, ...raiseBody });
  return res.body.request.requestId;
}

describe('POST /api/correction-requests', () => {
  it('raises a request (201), and the same raise again returns it (200)', async () => {
    const id = await seedInteraction();

    const first = await app().post('/api/correction-requests').send({ interactionId: id, ...raiseBody });
    const second = await app().post('/api/correction-requests').send({ interactionId: String(id), ...raiseBody });

    expect(first.status).toBe(201);
    expect(first.body.request).toMatchObject({ interactionId: id, issueKey: 'reviewer:recruiterCompany', status: 'open' });
    expect(second.status).toBe(200);
    expect(second.body.request.requestId).toBe(first.body.request.requestId);
  });

  it('returns 400 for a bad interaction id or input, and 404 for an unknown interaction', async () => {
    const id = await seedInteraction();

    expect((await app().post('/api/correction-requests').send({ interactionId: 'x', ...raiseBody })).status).toBe(400);
    const noReason = await app().post('/api/correction-requests').send({ interactionId: id, ...raiseBody, reason: '' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error).toContain('reason');
    expect((await app().post('/api/correction-requests').send({ interactionId: 9999, ...raiseBody })).status).toBe(404);
    expect(await CorrectionRequest.count()).toBe(0);
  });

  it('returns 500 with a message, not a crash, when the request cannot be saved', async () => {
    const id = await seedInteraction();
    jest.spyOn(correctionRequestService, 'raiseCorrectionRequest').mockRejectedValueOnce(new Error('disk full'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await app().post('/api/correction-requests').send({ interactionId: id, ...raiseBody });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to raise the correction request.');
  });
});

describe('GET /api/correction-requests', () => {
  it('lists open requests with what is asked, the current values, and whom each is for', async () => {
    const id = await seedInteraction();
    const requestId = await raised(id);

    const res = await app().get('/api/correction-requests');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      expect.objectContaining({
        requestId,
        interactionId: id,
        fields: ['recruiterCompany'],
        currentValues: { recruiterCompany: 'Acme' },
        raisedBy: 'rev-1',
        reason: 'Company looks wrong',
        interaction: expect.objectContaining({ recruiterName: 'Jane Doe', recruiterCompany: 'Acme' }),
        forJobSeekers: ['seeker-ana'],
      }),
    ]);
  });

  it('lists a system request with the fields that identify the recruiter, and drops answered ones', async () => {
    const unidentified = await seedInteraction({ identifiable: false });
    await correctionRequestService.raiseSystemCorrectionRequests();
    const answeredId = await raised(await seedInteraction());
    await app().post(`/api/correction-requests/${answeredId}/response`).send(answerBody);

    const res = await app().get('/api/correction-requests');

    expect(res.body.items).toEqual([
      expect.objectContaining({
        interactionId: unidentified,
        raisedByType: 'system',
        fields: ['recruiterEmail', 'recruiterCompany'],
      }),
    ]);
  });

  it('says a request is open to any job seeker ID when the submission was never attested', async () => {
    await raised(await seedInteraction({ attestedBy: null }));

    const res = await app().get('/api/correction-requests');

    expect(res.body.items[0].forJobSeekers).toEqual([]);
  });

  it('returns 500 with a message when the list cannot be loaded', async () => {
    jest.spyOn(correctionRequestService, 'listOpenCorrectionRequests').mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await app().get('/api/correction-requests');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to load correction requests.');
  });
});

describe('POST /api/correction-requests/:id/response', () => {
  it('records the attested answer (201), and the same answer again returns it (200)', async () => {
    const requestId = await raised(await seedInteraction());

    const first = await app().post(`/api/correction-requests/${requestId}/response`).send(answerBody);
    const second = await app().post(`/api/correction-requests/${requestId}/response`).send(answerBody);

    expect(first.status).toBe(201);
    expect(first.body.response).toMatchObject({ answer: 'corrected', correctedValues: { recruiterCompany: 'Acme Staffing' } });
    expect(second.status).toBe(200);
    expect(await CorrectionResponse.count()).toBe(1);
  });

  it('returns 403 when the answer is not from the job seeker who submitted the data', async () => {
    const requestId = await raised(await seedInteraction());

    const res = await app()
      .post(`/api/correction-requests/${requestId}/response`)
      .send({ ...answerBody, respondedBy: 'seeker-ben' });

    expect(res.status).toBe(403);
    expect(await CorrectionResponse.count()).toBe(0);
  });

  it('returns 409 when the request was already answered differently', async () => {
    const requestId = await raised(await seedInteraction());
    await app().post(`/api/correction-requests/${requestId}/response`).send(answerBody);

    const res = await app()
      .post(`/api/correction-requests/${requestId}/response`)
      .send({ ...answerBody, answer: 'unavailable', correctedValues: null });

    expect(res.status).toBe(409);
    expect(res.body.currentStatus).toBe('answered');
  });

  it.each([
    ['the attestation is not explicitly true', { attestationAccepted: 'true' }],
    ['correctedValues is not an object', { correctedValues: ['Acme'] }],
    ['there is no reason', { reason: '' }],
  ])('returns 400 when %s, and records nothing', async (_label, override) => {
    const requestId = await raised(await seedInteraction());

    const res = await app()
      .post(`/api/correction-requests/${requestId}/response`)
      .send({ ...answerBody, ...override });

    expect(res.status).toBe(400);
    expect(await CorrectionResponse.count()).toBe(0);
  });

  it('returns 400 for a malformed id and 404 for an unknown request', async () => {
    expect((await app().post('/api/correction-requests/abc/response').send(answerBody)).status).toBe(400);
    expect((await app().post('/api/correction-requests/9999/response').send(answerBody)).status).toBe(404);
  });
});

describe('POST /api/correction-requests/:id/withdraw', () => {
  const withdrawBody = { reviewerId: 'rev-1', reason: 'Raised on the wrong interaction' };

  it('withdraws an open request with who, when and why', async () => {
    const requestId = await raised(await seedInteraction());

    const res = await app().post(`/api/correction-requests/${requestId}/withdraw`).send(withdrawBody);

    expect(res.status).toBe(200);
    expect(res.body.withdrawal).toMatchObject({ requestId, closedBy: 'rev-1', closeReason: withdrawBody.reason });
    expect((await CorrectionRequest.findByPk(requestId))!.status).toBe('closed');
  });

  it('returns 409 for an answered request, 400 without a reason, and 404 for an unknown one', async () => {
    const requestId = await raised(await seedInteraction());
    expect((await app().post(`/api/correction-requests/${requestId}/withdraw`).send({ ...withdrawBody, reason: '' })).status).toBe(400);
    await app().post(`/api/correction-requests/${requestId}/response`).send(answerBody);

    expect((await app().post(`/api/correction-requests/${requestId}/withdraw`).send(withdrawBody)).status).toBe(409);
    expect((await app().post('/api/correction-requests/9999/withdraw').send(withdrawBody)).status).toBe(404);
  });
});
