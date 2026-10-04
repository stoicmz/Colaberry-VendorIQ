import express from 'express';
import request from 'supertest';
import { vendorIngestionRouter } from './vendorIngestionRoutes';
import { historyReviewRouter } from './historyReviewRoutes';
import { sequelize } from '../config/database';
import { CorrectionRequest } from '../models/CorrectionRequest';
import { RecruiterInteractionRecord } from '../models/VendorIngestionRecord';
import * as correctionRequestService from '../services/correctionRequest/correctionRequestService';

// STORY-011 end to end: an upload with an unidentified recruiter (rule U1) asks the job seeker.
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
const CSV = [
  'recruiterName,recruiterEmail,recruiterCompany,interactionDate,interactionType',
  'Jane Doe,,,2026-08-01,email',
  'John Smith,john@example.com,Acme,2026-08-02,call',
].join('\n');

function upload(csv: string) {
  return request(buildApp())
    .post('/api/vendor-ingestion/upload')
    .field('attested', 'true')
    .field('attestedBy', 'seeker-ana')
    .attach('file', Buffer.from(csv), 'interactions.csv');
}

async function janeId(): Promise<number> {
  return (await RecruiterInteractionRecord.findOne({ where: { recruiterName: 'Jane Doe' } }))!.id;
}

describe('system correction requests on upload', () => {
  it('asks the job seeker to identify the recruiter, and only for the unidentified one', async () => {
    const uploaded = await upload(CSV);

    expect(uploaded.status).toBe(200);
    expect(uploaded.body.correctionRequestCheck).toBe('completed');
    const requests = await CorrectionRequest.findAll();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      interactionId: await janeId(),
      issueKey: 'rule:unidentified_recruiter',
      raisedByType: 'system',
      status: 'open',
    });
  });

  it('keeps STORY-005 as it was: the reviewer is still notified and still has it in the queue', async () => {
    await upload(CSV);

    const notifications = await request(buildApp()).get('/api/history-review/notifications');
    const queue = await request(buildApp()).get('/api/history-review/queue');

    expect(notifications.body.notifications).toEqual([expect.objectContaining({ ruleId: 'unidentified_recruiter' })]);
    expect(queue.body.items).toEqual([
      expect.objectContaining({
        recruiterName: 'Jane Doe',
        reason: 'uncertain',
        openRequests: [expect.objectContaining({ raisedByType: 'system' })],
      }),
    ]);
  });

  it('does not ask twice when the same file is uploaded again', async () => {
    await upload(CSV);
    await upload(CSV);

    expect(await CorrectionRequest.count()).toBe(1);
  });

  it('keeps the upload when raising the request fails, says so, and raises it on the next check', async () => {
    jest
      .spyOn(correctionRequestService, 'raiseSystemCorrectionRequests')
      .mockRejectedValueOnce(new Error('database locked'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const uploaded = await upload(CSV);

    expect(uploaded.status).toBe(200);
    expect(uploaded.body.validCount).toBe(2);
    expect(uploaded.body.correctionRequestCheck).toBe('failed');
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Raising system correction requests failed after upload'),
      expect.any(Error)
    );
    expect(await CorrectionRequest.count()).toBe(0);

    await request(buildApp()).get('/api/history-review/notifications');

    expect(await CorrectionRequest.count({ where: { interactionId: await janeId() } })).toBe(1);
  });

  it('still returns notifications when the catch-up raise fails, and logs the failure', async () => {
    await upload(CSV);
    await CorrectionRequest.destroy({ where: {} });
    jest
      .spyOn(correctionRequestService, 'raiseSystemCorrectionRequests')
      .mockRejectedValueOnce(new Error('database locked'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(buildApp()).get('/api/history-review/notifications');

    expect(response.status).toBe(200);
    expect(response.body.notifications).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Catch-up raising of system correction requests failed'),
      expect.any(Error)
    );
  });
});
