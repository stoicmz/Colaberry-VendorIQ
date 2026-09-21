import express from 'express';
import request from 'supertest';
import { dashboardRouter } from './dashboardRoutes';
import { sequelize } from '../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../models/VendorIngestionRecord';
import { InteractionViewLog } from '../models/InteractionViewLog';
import * as recruiterInteractionsService from '../services/recruiterInteractions/recruiterInteractionsService';

function buildApp() {
  const app = express();
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
    recruiterName: 'Jane <Doe>',
    recruiterEmail: 'jane@example.com',
    recruiterCompany: 'Acme & Co',
    interactionDate: new Date('2026-08-01'),
    interactionType: 'email',
    channel: 'email',
    notes: 'Initial outreach',
  });
  return record.id;
}

describe('GET /dashboard', () => {
  it('lists interactions with a link to each detail page', async () => {
    const id = await seedInteraction();

    const response = await request(buildApp()).get('/dashboard');

    expect(response.status).toBe(200);
    expect(response.text).toContain(`/dashboard/interactions/${id}`);
    // recruiter name is HTML-escaped rather than injected raw
    expect(response.text).toContain('Jane &lt;Doe&gt;');
    expect(response.text).not.toContain('Jane <Doe>');
  });

  it('shows an empty state instead of an error when there is no data yet', async () => {
    const response = await request(buildApp()).get('/dashboard');

    expect(response.status).toBe(200);
    expect(response.text).toContain('No recruiter interactions');
  });

  it('renders an error page instead of crashing when the interaction list fails to load', async () => {
    jest.spyOn(recruiterInteractionsService, 'listInteractions').mockRejectedValueOnce(new Error('db down'));

    const response = await request(buildApp()).get('/dashboard');

    expect(response.status).toBe(500);
    expect(response.text).toContain('Dashboard unavailable');
  });
});

describe('GET /dashboard/interactions/:id', () => {
  it('loads the detail view and logs the view with a timestamp', async () => {
    const id = await seedInteraction();

    const response = await request(buildApp()).get(`/dashboard/interactions/${id}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain('Jane &lt;Doe&gt;');
    expect(response.text).toContain('Initial outreach');

    const logs = await InteractionViewLog.findAll({ where: { interactionId: id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].viewedAt).toBeInstanceOf(Date);
  });

  it('is reachable within one click from the dashboard (link is present) and loads', async () => {
    const id = await seedInteraction();

    const dashboard = await request(buildApp()).get('/dashboard');
    const link = `/dashboard/interactions/${id}`;
    expect(dashboard.text).toContain(link);

    const detail = await request(buildApp()).get(link);
    expect(detail.status).toBe(200);
  });

  it('renders a not-found page for an interaction that does not exist', async () => {
    const response = await request(buildApp()).get('/dashboard/interactions/999999');

    expect(response.status).toBe(404);
    expect(response.text).toContain('Interaction not found');
  });

  it('renders an invalid-link page for a malformed id instead of crashing', async () => {
    const response = await request(buildApp()).get('/dashboard/interactions/not-a-number');

    expect(response.status).toBe(400);
    expect(response.text).toContain('Invalid interaction');
  });

  it('renders an error page instead of crashing when the detail fails to load', async () => {
    const id = await seedInteraction();
    jest.spyOn(recruiterInteractionsService, 'getInteractionById').mockRejectedValueOnce(new Error('db down'));

    const response = await request(buildApp()).get(`/dashboard/interactions/${id}`);

    expect(response.status).toBe(500);
    expect(response.text).toContain('Interaction detail unavailable');
  });
});
