import express from 'express';
import request from 'supertest';
import { dashboardRouter } from './dashboardRoutes';
import { sequelize } from '../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../models/VendorIngestionRecord';
import { AttributionReview } from '../models/AttributionReview';
import * as attributionReviewService from '../services/attributionReview/attributionReviewService';

function buildApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use('/dashboard', dashboardRouter);
  return app;
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

async function seedInteraction(): Promise<number> {
  const batch = await IngestionBatch.create({
    fileHash: `hash-${Date.now()}-${Math.random()}`,
    fileName: 'interactions.csv',
    totalRows: 1,
    validCount: 1,
    errorCount: 0,
  });
  const record = await RecruiterInteractionRecord.create({
    batchId: batch.id,
    recruiterName: 'Jane Doe',
    recruiterEmail: 'jane@example.com',
    recruiterCompany: 'Acme Corp',
    interactionDate: new Date('2026-08-01'),
    interactionType: 'email',
    channel: 'email',
    notes: 'Initial outreach',
  });
  return record.id;
}

describe('GET /dashboard/interactions/:id/review', () => {
  it('renders the review form prefilled with the current attribution', async () => {
    const id = await seedInteraction();

    const response = await request(buildApp()).get(`/dashboard/interactions/${id}/review`);

    expect(response.status).toBe(200);
    expect(response.text).toContain('value="Jane Doe"');
    expect(response.text).toContain('value="Acme Corp"');
    expect(response.text).toContain('name="reviewerId"');
  });

  it('renders a not-found page for an interaction that does not exist', async () => {
    const response = await request(buildApp()).get('/dashboard/interactions/999999/review');

    expect(response.status).toBe(404);
    expect(response.text).toContain('Interaction not found');
  });
});

describe('POST /dashboard/interactions/:id/review', () => {
  it('confirms attribution, redirects to the detail page, and logs a confirmation with the reviewer ID and timestamp', async () => {
    const id = await seedInteraction();

    const response = await request(buildApp())
      .post(`/dashboard/interactions/${id}/review`)
      .type('form')
      .send({ reviewerId: 'reviewer-1', recruiterName: 'Jane Doe', recruiterCompany: 'Acme Corp' });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe(`/dashboard/interactions/${id}`);

    const logs = await AttributionReview.findAll({ where: { interactionId: id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('confirmed');
    expect(logs[0].reviewerId).toBe('reviewer-1');
    expect(logs[0].reviewedAt).toBeInstanceOf(Date);
  });

  it('corrects attribution, updates the record, redirects, and logs the correction', async () => {
    const id = await seedInteraction();

    const response = await request(buildApp())
      .post(`/dashboard/interactions/${id}/review`)
      .type('form')
      .send({ reviewerId: 'reviewer-42', recruiterName: 'Janet Doe', recruiterCompany: 'Acme Corporation' });

    expect(response.status).toBe(303);

    const record = await RecruiterInteractionRecord.findByPk(id);
    expect(record?.recruiterName).toBe('Janet Doe');
    expect(record?.recruiterCompany).toBe('Acme Corporation');

    const logs = await AttributionReview.findAll({ where: { interactionId: id } });
    expect(logs[0].action).toBe('corrected');
    expect(logs[0].reviewerId).toBe('reviewer-42');
  });

  it('re-renders the form with an error and preserves the submitted values when the reviewer ID is missing', async () => {
    const id = await seedInteraction();

    const response = await request(buildApp())
      .post(`/dashboard/interactions/${id}/review`)
      .type('form')
      .send({ reviewerId: '   ', recruiterName: 'Janet Doe', recruiterCompany: 'Acme Corp' });

    expect(response.status).toBe(400);
    expect(response.text).toContain('reviewer ID is required');
    expect(response.text).toContain('value="Janet Doe"');

    const record = await RecruiterInteractionRecord.findByPk(id);
    expect(record?.recruiterName).toBe('Jane Doe');
    expect(await AttributionReview.count()).toBe(0);
  });

  it('renders a not-found page when posting a review for an interaction that does not exist', async () => {
    const response = await request(buildApp())
      .post('/dashboard/interactions/999999/review')
      .type('form')
      .send({ reviewerId: 'reviewer-1', recruiterName: 'Jane Doe', recruiterCompany: 'Acme Corp' });

    expect(response.status).toBe(404);
    expect(response.text).toContain('Interaction not found');
  });

  it('renders an invalid-link page for a malformed id instead of crashing', async () => {
    const response = await request(buildApp())
      .post('/dashboard/interactions/not-a-number/review')
      .type('form')
      .send({ reviewerId: 'reviewer-1', recruiterName: 'Jane Doe', recruiterCompany: 'Acme Corp' });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Invalid interaction');
  });

  it('re-renders the form with an error instead of losing the review when saving fails', async () => {
    const id = await seedInteraction();
    jest.spyOn(attributionReviewService, 'reviewRecruiterAttribution').mockRejectedValueOnce(new Error('db down'));

    const response = await request(buildApp())
      .post(`/dashboard/interactions/${id}/review`)
      .type('form')
      .send({ reviewerId: 'reviewer-1', recruiterName: 'Janet Doe', recruiterCompany: 'Acme Corp' });

    expect(response.status).toBe(500);
    expect(response.text).toContain('could not save your review');
    expect(response.text).toContain('value="Janet Doe"');
  });
});
