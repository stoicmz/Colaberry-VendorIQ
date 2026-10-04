import request from 'supertest';
import { buildApp } from '../index';
import { sequelize } from '../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../models/SubmissionAttestation';
import { HistoryReviewDecision } from '../models/HistoryReviewDecision';
import { CorrectionRequest } from '../models/CorrectionRequest';
import {
  raiseCorrectionRequest,
  raiseSystemCorrectionRequests,
  respondToCorrectionRequest,
} from '../services/correctionRequest/correctionRequestService';
import * as historyReviewService from '../services/historyReview/historyReviewService';
import * as uncertainDataService from '../services/uncertainData/uncertainDataService';
import { getHistoryStatuses } from '../services/historyStatus/historyStatusService';

// STORY-011 reviewer ruling from the interaction page (HTML over the STORY-015 decision code).
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
async function seedInteraction(options: { identifiable?: boolean } = {}): Promise<number> {
  const seedNumber = hashCounter++;
  const fileHash = String(seedNumber).padStart(64, '0');
  const batch = await IngestionBatch.create({ fileHash, fileName: 'i.csv', totalRows: 1, validCount: 1, errorCount: 0 });
  await SubmissionAttestation.create({ batchId: batch.id, correlationId: 'corr', attestedBy: 'seeker-ana', statement: 'factual', channel: 'file', fileHash });
  const record = await RecruiterInteractionRecord.create({
    batchId: batch.id,
    recruiterName: 'Jane Doe',
    recruiterEmail: null,
    recruiterCompany: options.identifiable === false ? null : 'Acme',
    interactionDate: new Date(Date.UTC(2026, 7, 1 + seedNumber)),
    interactionType: 'email',
    channel: null,
    notes: null,
  });
  return record.id;
}

const app = () => request(buildApp());
const ruling = { reviewerId: 'rev-1', decision: 'confirmed', note: 'Checked the signature' };

function rule(id: number, body: Record<string, string>) {
  return app().post(`/dashboard/interactions/${id}/decision`).type('form').send(body);
}

// An interaction answered by the job seeker, back with the reviewer.
async function answeredInteraction(): Promise<number> {
  const id = await seedInteraction();
  const raised = await raiseCorrectionRequest({ interactionId: id, reviewerId: 'rev-1', field: 'recruiterCompany', reason: 'Check' });
  await respondToCorrectionRequest({
    requestId: raised!.requestId,
    respondedBy: 'seeker-ana',
    answer: 'corrected',
    reason: 'From the signature',
    correctedValues: { recruiterCompany: 'Acme Staffing' },
    attestationAccepted: true,
  });
  return id;
}

describe('interaction detail: reviewer decision panel', () => {
  it('offers confirm and reject when the interaction is waiting for review', async () => {
    const id = await answeredInteraction();

    const res = await app().get(`/dashboard/interactions/${id}`);

    expect(res.text).toContain('Reviewer decision');
    expect(res.text).toContain(`action="/dashboard/interactions/${id}/decision"`);
    expect(res.text).toContain('value="confirmed"');
    expect(res.text).toContain('value="rejected"');
  });

  it('shows no ruling form for confirmed history', async () => {
    const id = await seedInteraction();

    expect((await app().get(`/dashboard/interactions/${id}`)).text).not.toContain('Reviewer decision');
  });

  it('pauses the ruling while the reviewer’s own request waits on the job seeker', async () => {
    const id = await seedInteraction();
    await raiseCorrectionRequest({ interactionId: id, reviewerId: 'rev-1', field: 'recruiterCompany', reason: 'Check' });

    const res = await app().get(`/dashboard/interactions/${id}`);

    expect(res.text).toContain('Ruling paused: waiting for the job seeker’s answer. Withdraw the request to rule now.');
    expect(res.text).not.toContain('/decision"');
  });

  it('offers the ruling on uncertain data even while a system request is open (STORY-005 unchanged)', async () => {
    const id = await seedInteraction({ identifiable: false });
    await raiseSystemCorrectionRequests();

    expect((await app().get(`/dashboard/interactions/${id}`)).text).toContain(`action="/dashboard/interactions/${id}/decision"`);
  });

  it('pauses the ruling while the uncertain-data check is unavailable', async () => {
    const id = await answeredInteraction();
    jest.spyOn(uncertainDataService, 'detectStoredUncertainData').mockRejectedValue(new Error('rules crashed'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await app().get(`/dashboard/interactions/${id}`);

    expect(res.text).toContain('Ruling paused: the uncertain-data check is unavailable right now.');
  });
});

describe('recording a ruling (form)', () => {
  it('confirms the interaction, closes the answered request, and returns to the page', async () => {
    const id = await answeredInteraction();

    const res = await rule(id, ruling);

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/dashboard/interactions/${id}`);
    expect(await getHistoryStatuses([id]).then((s) => s.get(id))).toEqual({ status: 'confirmed', reason: 'reviewer_confirmed' });
    expect(await HistoryReviewDecision.findOne({ where: { interactionId: id } })).toMatchObject({
      reviewerId: 'rev-1',
      decision: 'confirmed',
      note: 'Checked the signature',
    });
    expect(await CorrectionRequest.findOne({ where: { interactionId: id } })).toMatchObject({ status: 'closed', closedBy: 'rev-1' });
    expect((await app().get(`/dashboard/interactions/${id}`)).text).toContain('Closed by rev-1’s ruling');
  });

  it('rejects the interaction out of history', async () => {
    const id = await answeredInteraction();

    await rule(id, { ...ruling, decision: 'rejected' });

    expect((await getHistoryStatuses([id])).get(id)?.status).toBe('rejected');
  });

  it('re-shows the page with the error and what was typed when the reviewer ID is missing', async () => {
    const id = await answeredInteraction();

    const res = await rule(id, { ...ruling, reviewerId: '' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('A reviewer ID is required to record a decision.');
    expect(res.text).toContain('value="confirmed" checked');
    expect(res.text).toContain('Checked the signature');
    expect(await HistoryReviewDecision.count()).toBe(0);
  });

  it('refuses a ruling while the reviewer’s own request is open (409)', async () => {
    const id = await seedInteraction();
    await raiseCorrectionRequest({ interactionId: id, reviewerId: 'rev-1', field: 'recruiterCompany', reason: 'Check' });

    const res = await rule(id, ruling);

    expect(res.status).toBe(409);
    expect(res.text).toContain('A correction request is still waiting for the job seeker.');
    expect(await HistoryReviewDecision.count()).toBe(0);
  });

  it('refuses a ruling on an interaction that is not waiting for review (409)', async () => {
    const id = await seedInteraction();

    const res = await rule(id, ruling);

    expect(res.status).toBe(409);
    expect(res.text).toContain('This interaction is not waiting for review');
  });

  it('pauses with 503 while the uncertain-data check is unavailable', async () => {
    const id = await answeredInteraction();
    jest.spyOn(uncertainDataService, 'detectStoredUncertainData').mockRejectedValue(new Error('rules crashed'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await rule(id, ruling);

    expect(res.status).toBe(503);
    expect(await HistoryReviewDecision.count()).toBe(0);
  });

  it('returns 404 for an unknown interaction and 400 for a malformed id', async () => {
    expect((await rule(9999, ruling)).status).toBe(404);
    expect((await app().post('/dashboard/interactions/abc/decision').type('form').send(ruling)).status).toBe(400);
  });

  it('re-shows the page with a message, not a crash, when saving fails', async () => {
    const id = await answeredInteraction();
    jest.spyOn(historyReviewService, 'decideHistoryReview').mockRejectedValueOnce(new Error('disk full'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await rule(id, ruling);

    expect(res.status).toBe(500);
    expect(res.text).toContain('We could not record your ruling. Please try again.');
  });

  it('escapes what was typed when re-showing the form', async () => {
    const id = await answeredInteraction();

    const res = await rule(id, { ...ruling, reviewerId: '', note: '</textarea><script>x</script>' });

    expect(res.text).not.toContain('<script>x</script>');
  });
});
