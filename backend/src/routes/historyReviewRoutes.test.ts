import request from 'supertest';
import { buildApp } from '../index';
import { sequelize } from '../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../models/SubmissionAttestation';
import { HistoryReviewDecision } from '../models/HistoryReviewDecision';
import * as historyReviewService from '../services/historyReview/historyReviewService';

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
async function seedInteraction(attested: boolean): Promise<number> {
  const fileHash = String(hashCounter++).padStart(64, '0');
  const batch = await IngestionBatch.create({ fileHash, fileName: 'i.csv', totalRows: 1, validCount: 1, errorCount: 0 });
  if (attested) {
    await SubmissionAttestation.create({
      batchId: batch.id,
      correlationId: 'corr',
      attestedBy: 'seeker-ana',
      statement: 'factual',
      channel: 'file',
      fileHash,
    });
  }
  const record = await RecruiterInteractionRecord.create({
    batchId: batch.id,
    recruiterName: 'Jane Doe',
    recruiterEmail: null,
    recruiterCompany: 'Acme',
    interactionDate: new Date('2026-08-01'),
    interactionType: 'email',
    channel: null,
    notes: null,
  });
  return record.id;
}

describe('POST /api/history-review/interactions/:id/dispute', () => {
  it('records a dispute (201) and a repeat by the same person returns the same one (200)', async () => {
    const id = await seedInteraction(true);
    const body = { disputedBy: 'recruiter-jane', reason: 'Never happened' };

    const first = await request(buildApp()).post(`/api/history-review/interactions/${id}/dispute`).send(body);
    const second = await request(buildApp()).post(`/api/history-review/interactions/${id}/dispute`).send(body);

    expect(first.status).toBe(201);
    expect(first.body.dispute.disputedAt).toBeDefined();
    expect(second.status).toBe(200);
    expect(second.body.dispute.disputeId).toBe(first.body.dispute.disputeId);
  });

  it('rejects a dispute with no reason (400)', async () => {
    const id = await seedInteraction(true);

    const response = await request(buildApp())
      .post(`/api/history-review/interactions/${id}/dispute`)
      .send({ disputedBy: 'recruiter-jane' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/reason/i);
  });

  it('returns 400 for a malformed id and 404 for an unknown one', async () => {
    const body = { disputedBy: 'x', reason: 'y' };

    expect((await request(buildApp()).post('/api/history-review/interactions/abc/dispute').send(body)).status).toBe(400);
    expect((await request(buildApp()).post('/api/history-review/interactions/9999/dispute').send(body)).status).toBe(404);
  });
});

describe('GET /api/history-review/queue', () => {
  it('lists an interaction waiting for review with its reason, and leaves out a confirmed one', async () => {
    const confirmed = await seedInteraction(true);
    const unattested = await seedInteraction(false);

    const response = await request(buildApp()).get('/api/history-review/queue');

    expect(response.status).toBe(200);
    const ids = response.body.items.map((item: { interactionId: number }) => item.interactionId);
    expect(ids).toEqual([unattested]);
    expect(ids).not.toContain(confirmed);
    expect(response.body.items[0].reason).toBe('unattested');
  });

  it('returns 500 with a message, not a crash, when the queue cannot be loaded', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(historyReviewService, 'listPendingReview').mockRejectedValue(new Error('db down'));

    const response = await request(buildApp()).get('/api/history-review/queue');

    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/review queue/);
  });
});

describe('POST /api/history-review/interactions/:id/decision', () => {
  it('records a reviewer ruling and removes the interaction from the queue', async () => {
    const id = await seedInteraction(false);

    const response = await request(buildApp())
      .post(`/api/history-review/interactions/${id}/decision`)
      .send({ reviewerId: 'rev-1', decision: 'confirmed', note: 'Checked with the job seeker' });

    expect(response.status).toBe(200);
    expect(response.body.decision.reviewerId).toBe('rev-1');
    expect(response.body.decision.decidedAt).toBeDefined();
    expect((await request(buildApp()).get('/api/history-review/queue')).body.items).toEqual([]);
  });

  it('refuses to rule on an interaction that is not waiting for review (409)', async () => {
    const id = await seedInteraction(true);

    const response = await request(buildApp())
      .post(`/api/history-review/interactions/${id}/decision`)
      .send({ reviewerId: 'rev-1', decision: 'rejected' });

    expect(response.status).toBe(409);
    expect(response.body.currentStatus).toBe('confirmed');
    expect(await HistoryReviewDecision.count()).toBe(0);
  });

  it('rejects a ruling with no reviewer ID (400) and writes nothing', async () => {
    const id = await seedInteraction(false);

    const response = await request(buildApp())
      .post(`/api/history-review/interactions/${id}/decision`)
      .send({ decision: 'confirmed' });

    expect(response.status).toBe(400);
    expect(await HistoryReviewDecision.count()).toBe(0);
  });

  it('returns 404 for an unknown interaction', async () => {
    const response = await request(buildApp())
      .post('/api/history-review/interactions/9999/decision')
      .send({ reviewerId: 'rev-1', decision: 'confirmed' });

    expect(response.status).toBe(404);
  });
});
