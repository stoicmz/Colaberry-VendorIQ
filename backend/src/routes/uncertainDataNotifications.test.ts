import express from 'express';
import request from 'supertest';
import { vendorIngestionRouter } from './vendorIngestionRoutes';
import { historyReviewRouter } from './historyReviewRoutes';
import { sequelize } from '../config/database';
import { UncertainDataFlag as UncertainDataFlagRow } from '../models/UncertainDataFlag';
import * as uncertainDataService from '../services/uncertainData/uncertainDataService';

// STORY-005 end to end: upload -> flag (reviewer notification + audit) -> review.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/vendor-ingestion', vendorIngestionRouter);
  app.use('/api/history-review', historyReviewRouter);
  return app;
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await sequelize.close();
});

// Jane Doe has only a name: no email, no company (rule U1). John Smith is identifiable.
const UNCERTAIN_CSV = [
  'recruiterName,recruiterEmail,recruiterCompany,interactionDate,interactionType',
  'Jane Doe,,,2026-08-01,email',
  'John Smith,john@example.com,Acme,2026-08-02,call',
].join('\n');
const CERTAIN_CSV = [
  'recruiterName,recruiterEmail,recruiterCompany,interactionDate,interactionType',
  'John Smith,john@example.com,Acme,2026-08-02,call',
].join('\n');

function upload(csv: string, fileName = 'interactions.csv') {
  return request(buildApp())
    .post('/api/vendor-ingestion/upload')
    .field('attested', 'true')
    .field('attestedBy', 'seeker-ana')
    .attach('file', Buffer.from(csv), fileName);
}

describe('uncertain data notifications (STORY-005)', () => {
  it('flags uncertain data on upload, notifies reviewers, and logs the flag for audit', async () => {
    const uploaded = await upload(UNCERTAIN_CSV);
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.uncertainDataCheck).toBe('completed');

    const response = await request(buildApp()).get('/api/history-review/notifications');

    expect(response.status).toBe(200);
    expect(response.body.refreshFailed).toBe(false);
    expect(response.body.notifications).toEqual([
      expect.objectContaining({
        recruiterName: 'Jane Doe',
        ruleId: 'unidentified_recruiter',
        description: 'Recruiter cannot be identified: no email or company recorded',
        evidence: 'Only a name is recorded: Jane Doe',
      }),
    ]);
    const rows = await UncertainDataFlagRow.findAll();
    expect(rows.map((row) => [row.ruleId, row.evidence])).toEqual([['unidentified_recruiter', 'Only a name is recorded: Jane Doe']]);
    expect(rows[0].flaggedAt).toBeInstanceOf(Date);
  });

  it('puts the uncertain interaction in the review queue with what to check, and leaves certain data out', async () => {
    await upload(UNCERTAIN_CSV);

    const queue = await request(buildApp()).get('/api/history-review/queue');

    expect(queue.body.items).toEqual([
      expect.objectContaining({
        recruiterName: 'Jane Doe',
        reason: 'uncertain',
        uncertainFlags: [expect.objectContaining({ ruleId: 'unidentified_recruiter' })],
      }),
    ]);
  });

  it('raises no flag and no notification for certain data', async () => {
    const uploaded = await upload(CERTAIN_CSV);
    expect(uploaded.body.uncertainDataCheck).toBe('completed');

    const response = await request(buildApp()).get('/api/history-review/notifications');

    expect(response.body.notifications).toEqual([]);
    expect(await UncertainDataFlagRow.count()).toBe(0);
  });

  it('never notifies twice: a re-upload and repeated checks leave one flag', async () => {
    await upload(UNCERTAIN_CSV);
    const again = await upload(UNCERTAIN_CSV);
    expect(again.body.duplicate).toBe(true);

    await request(buildApp()).get('/api/history-review/notifications');
    const response = await request(buildApp()).get('/api/history-review/notifications');

    expect(response.body.notifications).toHaveLength(1);
    expect(await UncertainDataFlagRow.count()).toBe(1);
  });

  it('keeps the upload when notification fails, holds the data for review, and notifies on the next check', async () => {
    jest.spyOn(UncertainDataFlagRow, 'bulkCreate').mockRejectedValueOnce(new Error('disk full'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const uploaded = await upload(UNCERTAIN_CSV);

    expect(uploaded.status).toBe(200);
    expect(uploaded.body.validCount).toBe(2);
    expect(uploaded.body.uncertainDataCheck).toBe('failed');
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Uncertain-data flagging failed'), expect.any(Error));
    expect(await UncertainDataFlagRow.count()).toBe(0);
    // Still not confirmed history: status is worked out from the rules, not from the flag row.
    const queue = await request(buildApp()).get('/api/history-review/queue');
    expect(queue.body.items.map((item: { reason: string }) => item.reason)).toEqual(['uncertain']);

    const response = await request(buildApp()).get('/api/history-review/notifications');

    expect(response.body.refreshFailed).toBe(false);
    expect(response.body.notifications).toHaveLength(1);
    expect(await UncertainDataFlagRow.count()).toBe(1);
  });

  it('still returns recorded notifications, marked refreshFailed, when the catch-up run fails', async () => {
    await upload(UNCERTAIN_CSV);
    jest.spyOn(UncertainDataFlagRow, 'bulkCreate').mockRejectedValueOnce(new Error('disk full'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(buildApp()).get('/api/history-review/notifications');

    expect(response.status).toBe(200);
    expect(response.body.refreshFailed).toBe(true);
    expect(response.body.notifications).toHaveLength(1);
  });

  it('closes the notification once a data reviewer rules, and keeps the audit row', async () => {
    await upload(UNCERTAIN_CSV);
    const [notification] = (await request(buildApp()).get('/api/history-review/notifications')).body.notifications;

    const decision = await request(buildApp())
      .post(`/api/history-review/interactions/${notification.interactionId}/decision`)
      .send({ reviewerId: 'rev-1', decision: 'confirmed', note: 'Confirmed with the job seeker' });
    expect(decision.status).toBe(200);

    const response = await request(buildApp()).get('/api/history-review/notifications');

    expect(response.body.notifications).toEqual([]);
    expect(await UncertainDataFlagRow.count()).toBe(1);
  });

  it('while the check is unavailable: keeps recorded notifications showing and pauses rulings with a 503', async () => {
    await upload(UNCERTAIN_CSV);
    const [notification] = (await request(buildApp()).get('/api/history-review/notifications')).body.notifications;
    // The status lookup's check fails from here on; the flag recorded above stays.
    jest.spyOn(uncertainDataService, 'detectStoredUncertainData').mockRejectedValue(new Error('rules crashed'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(buildApp()).get('/api/history-review/notifications');
    expect(response.status).toBe(200);
    expect(response.body.notifications.map((n: { flagId: number }) => n.flagId)).toEqual([notification.flagId]);

    const decision = await request(buildApp())
      .post(`/api/history-review/interactions/${notification.interactionId}/decision`)
      .send({ reviewerId: 'rev-1', decision: 'confirmed', note: null });
    expect(decision.status).toBe(503);
    expect(decision.body.error).toContain('decisions are paused');
  });
});
