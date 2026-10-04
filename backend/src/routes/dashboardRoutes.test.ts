import express from 'express';
import request from 'supertest';
import { dashboardRouter } from './dashboardRoutes';
import { sequelize } from '../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../models/VendorIngestionRecord';
import { InteractionViewLog } from '../models/InteractionViewLog';
import { RedFlagLog } from '../models/RedFlagLog';
import * as redFlagRules from '../services/redFlags/redFlagRules';
import { SubmissionAttestation } from '../models/SubmissionAttestation';
import { disputeInteraction } from '../services/historyReview/historyReviewService';
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

  it('moves an interaction from confirmed history to the review section once it is disputed (REQ-019)', async () => {
    const id = await seedInteraction();
    const record = await RecruiterInteractionRecord.findByPk(id);
    await SubmissionAttestation.create({
      batchId: record!.batchId,
      correlationId: 'corr',
      attestedBy: 'seeker-ana',
      statement: 'factual',
      channel: 'file',
      fileHash: null,
    });
    const reviewHeading = 'Waiting for review — not confirmed recruiter history';

    const before = await request(buildApp()).get('/dashboard');
    expect(before.text).toContain('Jane &lt;Doe&gt;');
    expect(before.text).not.toContain(reviewHeading);

    await disputeInteraction({ interactionId: id, disputedBy: 'recruiter-jane', reason: 'Never happened' });

    const after = await request(buildApp()).get('/dashboard');
    expect(after.text).toContain('No confirmed recruiter interactions yet.');
    expect(after.text.indexOf('Jane &lt;Doe&gt;')).toBeGreaterThan(after.text.indexOf(reviewHeading));
    expect(after.text).toContain('<td><span class="chip chip-amber">Disputed</span></td>');
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

describe('red flags on the dashboard (STORY-004)', () => {
  async function seedWithNotes(notes: string): Promise<number> {
    const batch = await IngestionBatch.create({
      fileHash: `hash-${Date.now()}-${Math.random()}`,
      fileName: 'interactions.csv',
      totalRows: 1,
      validCount: 1,
      errorCount: 0,
    });
    const record = await RecruiterInteractionRecord.create({
      batchId: batch.id,
      recruiterName: 'Sam Lee',
      recruiterEmail: 'sam@acme.com',
      recruiterCompany: 'Acme',
      interactionDate: new Date('2026-08-01'),
      interactionType: 'email',
      channel: 'email',
      notes,
    });
    return record.id;
  }

  const BADGE = '<span class="red-flag-badge">';

  it('highlights ingested data with a red flag and logs the identification for audit', async () => {
    const id = await seedWithNotes('They want an upfront fee before the interview.');

    const list = await request(buildApp()).get('/dashboard');
    const detail = await request(buildApp()).get(`/dashboard/interactions/${id}`);

    expect(list.status).toBe(200);
    expect(list.text).toContain(`${BADGE}&#9873; 1 red flag · for review</span>`);
    expect(detail.text).toContain('Red flags — for your review');
    // Two page loads, one identification: the audit log does not duplicate.
    const logs = await RedFlagLog.findAll();
    expect(logs.map((log) => [log.interactionId, log.ruleId, log.evidence])).toEqual([
      [id, 'money_or_personal_data', '"upfront", "fee"'],
    ]);
  });

  it('shows no highlights and logs nothing when there are no red flags', async () => {
    await seedWithNotes('Thanks for the feedback on my resume.');

    const response = await request(buildApp()).get('/dashboard');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Sam Lee');
    expect(response.text).not.toContain(BADGE);
    expect(await RedFlagLog.count()).toBe(0);
  });
});

describe('red flag check failure (STORY-004 "highlighting fails")', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('still loads the dashboard, says the check is unavailable, and logs the error', async () => {
    const batch = await IngestionBatch.create({ fileHash: 'hash-unavailable', fileName: 'i.csv', totalRows: 1, validCount: 1, errorCount: 0 });
    await RecruiterInteractionRecord.create({
      batchId: batch.id,
      recruiterName: 'Sam Lee',
      recruiterEmail: 'sam@acme.com',
      recruiterCompany: 'Acme',
      interactionDate: new Date('2026-08-01'),
      interactionType: 'email',
      channel: 'email',
      notes: 'They want an upfront fee.',
    });
    jest.spyOn(redFlagRules, 'detectRedFlags').mockImplementation(() => {
      throw new Error('rule crashed');
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(buildApp()).get('/dashboard');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Sam Lee');
    expect(response.text).toContain('<p class="check-unavailable">');
    expect(response.text).not.toContain('<span class="red-flag-badge">');
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Red flag check failed'), expect.any(Error));
  });
});
