import express from 'express';
import request from 'supertest';
import { vendorIngestionRouter } from './vendorIngestionRoutes';
import { sequelize } from '../config/database';
import { DataCleaningLog } from '../models/DataCleaningLog';

function buildApp() {
  const app = express();
  app.use('/api/vendor-ingestion', vendorIngestionRouter);
  return app;
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/vendor-ingestion/clean', () => {
  it('corrects fixable rows, flags rows missing a required field, and removes unrecoverable rows', async () => {
    const csv = [
      'recruiterName,recruiterEmail,interactionDate',
      'Jane Doe,jane@example.com,2026-08-01',
      'Casing Test,MixedCase@Example.COM,2026-08-02',
      ',,2026-08-03',
      'John Smith,,not-a-date',
    ].join('\n');

    const response = await request(buildApp())
      .post('/api/vendor-ingestion/clean')
      .field('administratorId', 'admin-jane')
      .attach('file', Buffer.from(csv), 'interactions.csv');

    expect(response.status).toBe(200);
    expect(response.body.administratorId).toBe('admin-jane');
    expect(response.body.totalRows).toBe(4);
    expect(response.body.cleanCount).toBe(2);
    expect(response.body.correctedRowCount).toBe(1);
    expect(response.body.flaggedCount).toBe(1);
    expect(response.body.removedCount).toBe(1);
    expect(response.body.flagged[0].data.interactionDate).toBe('2026-08-03');

    const logs = await DataCleaningLog.findAll({ where: { correlationId: response.body.correlationId } });
    expect(logs).toHaveLength(3);
    expect(logs.every((log) => log.administratorId === 'admin-jane')).toBe(true);
    expect(logs.every((log) => log.cleanedAt instanceof Date)).toBe(true);
    expect(logs.map((log) => log.action).sort()).toEqual(['corrected', 'flagged_for_review', 'removed']);
  });

  it('rejects the request when administratorId is missing, and logs nothing', async () => {
    const csv = ['recruiterName,interactionDate', 'Jane Doe,2026-08-01'].join('\n');

    const response = await request(buildApp())
      .post('/api/vendor-ingestion/clean')
      .attach('file', Buffer.from(csv), 'interactions.csv');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/administratorId/);

    const logs = await DataCleaningLog.findAll();
    expect(logs).toHaveLength(0);
  });

  it('rejects an unsupported file format', async () => {
    const response = await request(buildApp())
      .post('/api/vendor-ingestion/clean')
      .field('administratorId', 'admin-jane')
      .attach('file', Buffer.from('not a real file'), 'interactions.txt');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Unsupported file format/);
  });
});
