import request from 'supertest';
import { buildApp } from '../index';
import { sequelize } from '../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../models/SubmissionAttestation';
import { CorrectionRequest } from '../models/CorrectionRequest';
import {
  raiseCorrectionRequest,
  respondToCorrectionRequest,
  withdrawCorrectionRequest,
} from '../services/correctionRequest/correctionRequestService';
import * as correctionRequestService from '../services/correctionRequest/correctionRequestService';
import { decideHistoryReview } from '../services/historyReview/historyReviewService';

// STORY-011 reviewer screens: the correction requests panel, the request form, and withdrawal.
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
async function seedInteraction(): Promise<number> {
  const seedNumber = hashCounter++;
  const fileHash = String(seedNumber).padStart(64, '0');
  const batch = await IngestionBatch.create({ fileHash, fileName: 'i.csv', totalRows: 1, validCount: 1, errorCount: 0 });
  await SubmissionAttestation.create({ batchId: batch.id, correlationId: 'corr', attestedBy: 'seeker-ana', statement: 'factual', channel: 'file', fileHash });
  const record = await RecruiterInteractionRecord.create({
    batchId: batch.id,
    recruiterName: 'Jane Doe',
    recruiterEmail: 'jane@acme.com',
    recruiterCompany: 'Acme',
    interactionDate: new Date(Date.UTC(2026, 7, 1 + seedNumber)),
    interactionType: 'email',
    channel: null,
    notes: null,
  });
  return record.id;
}

const app = () => request(buildApp());
const answer = { respondedBy: 'seeker-ana', reason: 'From the email signature', attestationAccepted: true };

async function raise(id: number, reason = 'Company looks wrong'): Promise<number> {
  const result = await raiseCorrectionRequest({ interactionId: id, reviewerId: 'rev-1', field: 'recruiterCompany', reason });
  return result!.requestId;
}

describe('interaction detail: correction requests panel', () => {
  it('says when no corrections have been requested, and offers to request one', async () => {
    const id = await seedInteraction();

    const res = await app().get(`/dashboard/interactions/${id}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('No corrections have been requested for this interaction.');
    expect(res.text).toContain(`href="/dashboard/interactions/${id}/request-correction"`);
  });

  it('shows an open request with who asked, why, and a withdraw form', async () => {
    const id = await seedInteraction();
    const requestId = await raise(id);

    const res = await app().get(`/dashboard/interactions/${id}`);

    expect(res.text).toContain('Waiting for the job seeker');
    expect(res.text).toContain('asked for: Company');
    expect(res.text).toContain('Requested by rev-1');
    expect(res.text).toContain('Company looks wrong');
    expect(res.text).toContain(`action="/dashboard/correction-requests/${requestId}/withdraw"`);
  });

  it('shows the attested answer, marks the corrected value with the original, and drops the withdraw form', async () => {
    const id = await seedInteraction();
    const requestId = await raise(id);
    await respondToCorrectionRequest({ requestId, ...answer, answer: 'corrected', correctedValues: { recruiterCompany: 'Acme Staffing' } });

    const res = await app().get(`/dashboard/interactions/${id}`);

    expect(res.text).toContain('Acme Staffing <span class="corrected">(corrected by the job seeker; originally Acme)</span>');
    expect(res.text).toContain('Answered — waiting for a reviewer');
    expect(res.text).toContain('<strong>Corrected</strong> — Company: Acme Staffing');
    expect(res.text).toContain('Attested by seeker-ana');
    expect(res.text).toContain('I attest that this answer is factual');
    expect(res.text).not.toContain('/withdraw"');
  });

  it('shows how each closed request was closed: by a ruling or a withdrawal', async () => {
    const id = await seedInteraction();
    const ruled = await raise(id);
    await respondToCorrectionRequest({ requestId: ruled, ...answer, answer: 'confirmed_as_is', correctedValues: null });
    await decideHistoryReview({ interactionId: id, reviewerId: 'rev-2', decision: 'confirmed', note: null });
    const withdrawn = await raiseCorrectionRequest({ interactionId: id, reviewerId: 'rev-1', field: 'channel', reason: 'Channel missing' });
    await withdrawCorrectionRequest({ requestId: withdrawn!.requestId, reviewerId: 'rev-1', reason: 'Not needed after all' });

    const res = await app().get(`/dashboard/interactions/${id}`);

    expect(res.text).toContain('<strong>Confirmed as correct</strong>');
    expect(res.text).toContain('Closed by rev-2’s ruling');
    expect(res.text).toContain('Withdrawn by rev-1');
    expect(res.text).toContain('Not needed after all');
  });

  it('escapes everything people typed', async () => {
    const id = await seedInteraction();
    await raise(id, '<script>alert(1)</script>');

    const res = await app().get(`/dashboard/interactions/${id}`);

    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows the error page, not a crash, when the requests cannot be loaded', async () => {
    const id = await seedInteraction();
    jest.spyOn(correctionRequestService, 'listCorrectionRequestsForInteraction').mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await app().get(`/dashboard/interactions/${id}`);

    expect(res.status).toBe(500);
    expect(res.text).toContain('Interaction detail unavailable');
  });
});

describe('request a correction (form)', () => {
  it('shows the form with each field and its current value', async () => {
    const id = await seedInteraction();

    const res = await app().get(`/dashboard/interactions/${id}/request-correction`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Reviewers do not change submitted data.');
    expect(res.text).toContain('<option value="recruiterCompany">Company (now: Acme)</option>');
  });

  it('sends the request and returns to the interaction', async () => {
    const id = await seedInteraction();

    const res = await app()
      .post(`/dashboard/interactions/${id}/request-correction`)
      .type('form')
      .send({ reviewerId: 'rev-1', field: 'recruiterCompany', reason: 'Company looks wrong' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/dashboard/interactions/${id}`);
    expect(await CorrectionRequest.count({ where: { interactionId: id, status: 'open' } })).toBe(1);
  });

  it('re-shows the form with the error and what was typed when the input is refused', async () => {
    const id = await seedInteraction();

    const res = await app()
      .post(`/dashboard/interactions/${id}/request-correction`)
      .type('form')
      .send({ reviewerId: 'rev-1', field: 'recruiterCompany', reason: '' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('Give a reason for the correction request.');
    expect(res.text).toContain('value="rev-1"');
    expect(res.text).toContain('<option value="recruiterCompany" selected>');
    expect(await CorrectionRequest.count()).toBe(0);
  });

  it('returns 404 for an unknown interaction and 400 for a malformed id', async () => {
    expect((await app().get('/dashboard/interactions/9999/request-correction')).status).toBe(404);
    expect((await app().get('/dashboard/interactions/abc/request-correction')).status).toBe(400);
    const post = await app()
      .post('/dashboard/interactions/9999/request-correction')
      .type('form')
      .send({ reviewerId: 'rev-1', field: 'recruiterCompany', reason: 'x' });
    expect(post.status).toBe(404);
  });

  it('re-shows the form with a message, not a crash, when saving fails', async () => {
    const id = await seedInteraction();
    jest.spyOn(correctionRequestService, 'raiseCorrectionRequest').mockRejectedValueOnce(new Error('disk full'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await app()
      .post(`/dashboard/interactions/${id}/request-correction`)
      .type('form')
      .send({ reviewerId: 'rev-1', field: 'recruiterCompany', reason: 'x' });

    expect(res.status).toBe(500);
    expect(res.text).toContain('We could not send your request. Please try again.');
  });
});

describe('withdraw a request (form)', () => {
  it('withdraws the request and returns to its interaction', async () => {
    const id = await seedInteraction();
    const requestId = await raise(id);

    const res = await app()
      .post(`/dashboard/correction-requests/${requestId}/withdraw`)
      .type('form')
      .send({ reviewerId: 'rev-1', reason: 'Raised in error' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/dashboard/interactions/${id}`);
    expect((await CorrectionRequest.findByPk(requestId))!.status).toBe('closed');
  });

  it('shows the error on the interaction page when the reason is missing or the request was answered', async () => {
    const id = await seedInteraction();
    const requestId = await raise(id);

    const noReason = await app()
      .post(`/dashboard/correction-requests/${requestId}/withdraw`)
      .type('form')
      .send({ reviewerId: 'rev-1', reason: '' });
    expect(noReason.status).toBe(400);
    expect(noReason.text).toContain('Give a reason for withdrawing the request.');
    expect(noReason.text).toContain('Correction requests');

    await respondToCorrectionRequest({ requestId, ...answer, answer: 'unavailable', correctedValues: null });
    const answered = await app()
      .post(`/dashboard/correction-requests/${requestId}/withdraw`)
      .type('form')
      .send({ reviewerId: 'rev-1', reason: 'Raised in error' });
    expect(answered.status).toBe(409);
    expect(answered.text).toContain('not waiting for an answer');
    expect((await CorrectionRequest.findByPk(requestId))!.status).toBe('answered');
  });

  it('returns 404 for an unknown request and 400 for a malformed id', async () => {
    const send = (path: string) => app().post(path).type('form').send({ reviewerId: 'rev-1', reason: 'x' });
    expect((await send('/dashboard/correction-requests/9999/withdraw')).status).toBe(404);
    expect((await send('/dashboard/correction-requests/abc/withdraw')).status).toBe(400);
  });
});
