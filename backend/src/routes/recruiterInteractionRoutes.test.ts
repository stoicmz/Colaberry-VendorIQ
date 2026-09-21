import express from 'express';
import request from 'supertest';
import { recruiterInteractionRouter } from './recruiterInteractionRoutes';
import { sequelize } from '../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../models/VendorIngestionRecord';

function buildApp() {
  const app = express();
  app.use('/api/interactions', recruiterInteractionRouter);
  return app;
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

async function seedInteraction(overrides: Partial<{ recruiterName: string; interactionDate: Date }> = {}) {
  const batch = await IngestionBatch.create({
    fileHash: `hash-${Date.now()}-${Math.random()}`,
    fileName: 'interactions.csv',
    totalRows: 1,
    validCount: 1,
    errorCount: 0,
  });
  return RecruiterInteractionRecord.create({
    batchId: batch.id,
    recruiterName: overrides.recruiterName ?? 'Jane Doe',
    recruiterEmail: 'jane@example.com',
    recruiterCompany: 'Acme Corp',
    interactionDate: overrides.interactionDate ?? new Date('2026-08-01'),
    interactionType: 'email',
    channel: 'email',
    notes: 'Initial outreach',
  });
}

describe('GET /api/interactions', () => {
  it('lists ingested recruiter interactions', async () => {
    await seedInteraction({ recruiterName: 'Jane Doe' });
    await seedInteraction({ recruiterName: 'John Smith' });

    const response = await request(buildApp()).get('/api/interactions');

    expect(response.status).toBe(200);
    expect(response.body.interactions).toHaveLength(2);
    expect(response.body.interactions.map((i: { recruiterName: string }) => i.recruiterName)).toEqual(
      expect.arrayContaining(['Jane Doe', 'John Smith'])
    );
  });

  it('returns an empty list rather than an error when there is no data yet', async () => {
    const response = await request(buildApp()).get('/api/interactions');

    expect(response.status).toBe(200);
    expect(response.body.interactions).toEqual([]);
  });
});

describe('GET /api/interactions/:id', () => {
  it('returns the full detail for an existing interaction', async () => {
    const record = await seedInteraction();

    const response = await request(buildApp()).get(`/api/interactions/${record.id}`);

    expect(response.status).toBe(200);
    expect(response.body.interaction.id).toBe(record.id);
    expect(response.body.interaction.recruiterName).toBe('Jane Doe');
    expect(response.body.interaction.notes).toBe('Initial outreach');
  });

  it('returns 404 when the interaction does not exist', async () => {
    const response = await request(buildApp()).get('/api/interactions/999999');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/No interaction found/);
  });

  it('returns 400 when the id is not a valid positive integer', async () => {
    const response = await request(buildApp()).get('/api/interactions/not-a-number');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/positive integer/);
  });
});
