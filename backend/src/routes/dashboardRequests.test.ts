import request from 'supertest';
import { buildApp } from '../index';
import { sequelize } from '../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../models/SubmissionAttestation';
import { CorrectionRequest } from '../models/CorrectionRequest';
import { CorrectionResponse } from '../models/CorrectionResponse';
import {
  raiseCorrectionRequest,
  raiseSystemCorrectionRequests,
  withdrawCorrectionRequest,
} from '../services/correctionRequest/correctionRequestService';
import * as correctionRequestService from '../services/correctionRequest/correctionRequestService';
import { getHistoryStatuses } from '../services/historyStatus/historyStatusService';

// STORY-011 job seeker screens: the dashboard link, "Requests for you", and the answer form.
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

async function raise(id: number, reason = 'Company looks wrong'): Promise<number> {
  const result = await raiseCorrectionRequest({ interactionId: id, reviewerId: 'rev-1', field: 'recruiterCompany', reason });
  return result!.requestId;
}

const form = {
  respondedBy: 'seeker-ana',
  answer: 'corrected',
  value_recruiterCompany: 'Acme Staffing',
  reason: 'From the email signature',
  attest: 'yes',
};

function answer(requestId: number, body: Record<string, string>) {
  return app().post(`/dashboard/requests/${requestId}`).type('form').send(body);
}

describe('dashboard: requests link', () => {
  it('links to the requests waiting for an answer, with how many', async () => {
    await raise(await seedInteraction());

    const res = await app().get('/dashboard');

    expect(res.text).toContain('<a href="/dashboard/requests">Requests for you (1) &rarr;</a>');
  });

  it('shows no link when nothing is waiting', async () => {
    await seedInteraction();

    expect((await app().get('/dashboard')).text).not.toContain('Requests for you');
  });

  it('still shows the dashboard, saying requests could not be checked, when counting fails', async () => {
    await seedInteraction();
    jest.spyOn(correctionRequestService, 'listOpenCorrectionRequests').mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await app().get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Your Recruiter Interactions');
    expect(res.text).toContain('We could not check for requests waiting for you right now.');
  });
});

describe('requests for you (list)', () => {
  it('lists each open request: the interaction, what is asked, why, who asked, and whom it is for', async () => {
    const requestId = await raise(await seedInteraction());

    const res = await app().get('/dashboard/requests');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<strong>Jane Doe</strong> — Acme, email');
    expect(res.text).toContain('Asked for: Company');
    expect(res.text).toContain('Why: Company looks wrong');
    expect(res.text).toContain('Asked by data reviewer rev-1');
    expect(res.text).toContain('For: seeker-ana');
    expect(res.text).toContain(`href="/dashboard/requests/${requestId}"`);
  });

  it('describes an automatic request plainly, and says when nothing is waiting once it is closed', async () => {
    await seedInteraction({ identifiable: false });
    await raiseSystemCorrectionRequests();

    const listed = await app().get('/dashboard/requests');
    expect(listed.text).toContain('Asked by VendorIQ (an automatic data check)');
    expect(listed.text).toContain('Asked for: Email or Company');

    await CorrectionRequest.update(
      { status: 'closed', openKey: null, closedBy: 'rev-1', closedAt: new Date(), closeReason: 'x' },
      { where: {} }
    );
    expect((await app().get('/dashboard/requests')).text).toContain('No requests are waiting for an answer.');
  });

  it('shows the error page, not a crash, when the list cannot be loaded', async () => {
    jest.spyOn(correctionRequestService, 'listOpenCorrectionRequests').mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await app().get('/dashboard/requests');

    expect(res.status).toBe(500);
    expect(res.text).toContain('Requests unavailable');
  });
});

describe('answer a request (form)', () => {
  it('shows the request, the three answers, an input for only the asked-about field, and the attestation', async () => {
    const requestId = await raise(await seedInteraction());

    const res = await app().get(`/dashboard/requests/${requestId}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('value="corrected"');
    expect(res.text).toContain('value="confirmed_as_is"');
    expect(res.text).toContain('value="unavailable"');
    expect(res.text).toContain('name="value_recruiterCompany" value="Acme"');
    expect(res.text).not.toContain('name="value_recruiterName"');
    expect(res.text).toContain('I attest that this answer is factual to the best of my knowledge.');
  });

  it('records a correction as a new attested version and thanks the job seeker', async () => {
    const id = await seedInteraction();
    const requestId = await raise(id);

    const res = await answer(requestId, form);

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/dashboard/requests?answered=1');
    const stored = await CorrectionResponse.findOne({ where: { requestId } });
    expect(stored).toMatchObject({ answer: 'corrected', respondedBy: 'seeker-ana' });
    expect(JSON.parse(stored!.correctedValues!)).toEqual({ recruiterCompany: 'Acme Staffing' });
    expect((await getHistoryStatuses([id])).get(id)?.reason).toBe('correction_answered');
    expect((await app().get('/dashboard/requests?answered=1')).text).toContain(
      'Thank you — your answer has been sent to a reviewer.'
    );
  });

  it.each(['confirmed_as_is', 'unavailable'])('records "%s" without any values, even though the input was filled', async (choice) => {
    const requestId = await raise(await seedInteraction());

    const res = await answer(requestId, { ...form, answer: choice });

    expect(res.status).toBe(303);
    const stored = await CorrectionResponse.findOne({ where: { requestId } });
    expect(stored).toMatchObject({ answer: choice, correctedValues: null });
  });

  it('refuses a correction that changes nothing, keeping what was typed', async () => {
    const requestId = await raise(await seedInteraction());

    const res = await answer(requestId, { ...form, value_recruiterCompany: 'Acme' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('A correction needs at least one new value.');
    expect(res.text).toContain('From the email signature');
    expect(res.text).toContain('value="corrected" checked');
    expect(await CorrectionResponse.count()).toBe(0);
  });

  it('refuses an answer without the attestation', async () => {
    const requestId = await raise(await seedInteraction());
    const { attest: _omitted, ...withoutAttest } = form;

    const res = await answer(requestId, withoutAttest);

    expect(res.status).toBe(400);
    expect(res.text).toContain('You must attest that your answer is factual.');
    expect(await CorrectionResponse.count()).toBe(0);
  });

  it('refuses an answer from someone who did not submit the data (403)', async () => {
    const requestId = await raise(await seedInteraction());

    const res = await answer(requestId, { ...form, respondedBy: 'seeker-ben' });

    expect(res.status).toBe(403);
    expect(res.text).toContain('Only the job seeker who submitted and attested this interaction can answer this request.');
    expect(await CorrectionResponse.count()).toBe(0);
  });

  it('says the request is no longer waiting once it was answered or withdrawn (409)', async () => {
    const answered = await raise(await seedInteraction());
    await answer(answered, form);
    const withdrawn = await raise(await seedInteraction());
    await withdrawCorrectionRequest({ requestId: withdrawn, reviewerId: 'rev-1', reason: 'Raised in error' });

    for (const requestId of [answered, withdrawn]) {
      const page = await app().get(`/dashboard/requests/${requestId}`);
      expect(page.status).toBe(409);
      expect(page.text).toContain('This request is no longer waiting for an answer.');
      expect((await answer(requestId, form)).status).toBe(409);
    }
    expect(await CorrectionResponse.count()).toBe(1);
  });

  it('returns 404 for an unknown request and 400 for a malformed id', async () => {
    expect((await app().get('/dashboard/requests/9999')).status).toBe(404);
    expect((await app().get('/dashboard/requests/abc')).status).toBe(400);
    expect((await answer(9999, form)).status).toBe(404);
  });

  it('re-shows the form with a message, not a crash, when saving fails', async () => {
    const requestId = await raise(await seedInteraction());
    jest.spyOn(correctionRequestService, 'respondToCorrectionRequest').mockRejectedValueOnce(new Error('disk full'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await answer(requestId, form);

    expect(res.status).toBe(500);
    expect(res.text).toContain('We could not send your answer. Please try again.');
  });

  it('escapes everything people typed', async () => {
    const requestId = await raise(await seedInteraction(), '<img src=x onerror=alert(1)>');

    const page = await app().get(`/dashboard/requests/${requestId}`);
    const refused = await answer(requestId, { ...form, reason: '', respondedBy: '"><script>x</script>' });

    expect(page.text).not.toContain('<img src=x onerror=alert(1)>');
    expect(page.text).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(refused.text).not.toContain('<script>x</script>');
  });
});
