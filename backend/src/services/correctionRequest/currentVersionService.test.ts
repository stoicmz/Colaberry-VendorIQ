import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import { CorrectionResponse } from '../../models/CorrectionResponse';
import { getCurrentVersions } from './currentVersionService';
import { raiseCorrectionRequest, raiseSystemCorrectionRequests, respondToCorrectionRequest } from './correctionRequestService';
import { CorrectionRequest } from '../../models/CorrectionRequest';
import { detectStoredUncertainData } from '../uncertainData/uncertainDataService';
import { getInteractionById, listInteractions } from '../recruiterInteractions/recruiterInteractionsService';
import { listPendingReview } from '../historyReview/historyReviewService';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

let hashCounter = 0;
async function seedInteraction(options: { identifiable: boolean }): Promise<RecruiterInteractionRecord> {
  const seedNumber = hashCounter++;
  const fileHash = String(seedNumber).padStart(64, '0');
  const batch = await IngestionBatch.create({ fileHash, fileName: 'i.csv', totalRows: 1, validCount: 1, errorCount: 0 });
  await SubmissionAttestation.create({
    batchId: batch.id,
    correlationId: 'corr',
    attestedBy: 'seeker-ana',
    statement: 'factual',
    channel: 'file',
    fileHash,
  });
  return RecruiterInteractionRecord.create({
    batchId: batch.id,
    recruiterName: `Jane Doe ${seedNumber}`,
    recruiterEmail: null,
    recruiterCompany: options.identifiable ? 'Acme' : null,
    // A different day per seed, so separate uploads are not STORY-005 possible duplicates.
    interactionDate: new Date(Date.UTC(2026, 7, 1 + seedNumber)),
    interactionType: 'email',
    channel: null,
    notes: null,
  });
}

const answer = { respondedBy: 'seeker-ana', reason: 'From the email signature', attestationAccepted: true };

async function correct(interactionId: number, field: string, value: string): Promise<void> {
  const request = await raiseCorrectionRequest({ interactionId, reviewerId: 'rev-1', field, reason: 'Please check' });
  await respondToCorrectionRequest({ requestId: request!.requestId, ...answer, answer: 'corrected', correctedValues: { [field]: value } });
  // Close it, so the next correction to the same field can be requested (step 4c does this on a decision).
  await CorrectionRequest.update(
    { status: 'closed', openKey: null, closedBy: 'rev-1', closedAt: new Date(), closeReason: 'No longer needed' },
    { where: { id: request!.requestId } }
  );
}

describe('getCurrentVersions', () => {
  it('returns the stored values unchanged when there are no corrections', async () => {
    const record = await seedInteraction({ identifiable: true });

    const [current] = await getCurrentVersions([record]);

    expect(current).toMatchObject({
      id: record.id,
      recruiterName: record.recruiterName,
      recruiterCompany: 'Acme',
      correctedFields: [],
      originalValues: {},
    });
  });

  it('lays a correction over the stored row and keeps the original value alongside', async () => {
    const record = await seedInteraction({ identifiable: true });
    await correct(record.id, 'recruiterCompany', 'Acme Staffing');

    const [current] = await getCurrentVersions([record]);

    expect(current.recruiterCompany).toBe('Acme Staffing');
    expect(current.correctedFields).toEqual(['recruiterCompany']);
    expect(current.originalValues).toEqual({ recruiterCompany: 'Acme' });
    // The stored row is never changed.
    expect((await RecruiterInteractionRecord.findByPk(record.id))!.recruiterCompany).toBe('Acme');
  });

  it('applies corrections oldest first, so the latest one wins and the original is still the stored value', async () => {
    const record = await seedInteraction({ identifiable: true });
    await correct(record.id, 'recruiterCompany', 'Acme Staffing');
    await correct(record.id, 'recruiterCompany', 'Acme Staffing Ltd');

    const [current] = await getCurrentVersions([record]);

    expect(current.recruiterCompany).toBe('Acme Staffing Ltd');
    expect(current.correctedFields).toEqual(['recruiterCompany']);
    expect(current.originalValues).toEqual({ recruiterCompany: 'Acme' });
  });

  it('turns a corrected date back into a date', async () => {
    const record = await seedInteraction({ identifiable: true });
    await correct(record.id, 'interactionDate', '2026-07-15');

    const [current] = await getCurrentVersions([record]);

    expect(current.interactionDate).toEqual(new Date('2026-07-15T00:00:00.000Z'));
    expect(current.originalValues.interactionDate).toEqual(record.interactionDate);
  });

  it('ignores answers that change nothing', async () => {
    const record = await seedInteraction({ identifiable: true });
    const request = await raiseCorrectionRequest({
      interactionId: record.id,
      reviewerId: 'rev-1',
      field: 'recruiterCompany',
      reason: 'Please check',
    });
    await respondToCorrectionRequest({
      requestId: request!.requestId,
      ...answer,
      answer: 'confirmed_as_is',
      correctedValues: null,
    });

    const [current] = await getCurrentVersions([record]);

    expect(current.recruiterCompany).toBe('Acme');
    expect(current.correctedFields).toEqual([]);
  });

  it('keeps each interaction’s corrections to itself and the records in the order given', async () => {
    const first = await seedInteraction({ identifiable: true });
    const second = await seedInteraction({ identifiable: true });
    await correct(second.id, 'recruiterCompany', 'Globex');

    const current = await getCurrentVersions([second, first]);

    expect(current.map((c) => c.id)).toEqual([second.id, first.id]);
    expect(current[0].recruiterCompany).toBe('Globex');
    expect(current[1].recruiterCompany).toBe('Acme');
  });

  it('refuses to guess when a stored correction is corrupted', async () => {
    const record = await seedInteraction({ identifiable: true });
    await CorrectionResponse.create({
      requestId: 999,
      interactionId: record.id,
      answer: 'corrected',
      correctedValues: JSON.stringify({ salary: '100k' }),
      reason: 'x',
      respondedBy: 'seeker-ana',
      statement: 'factual',
    });

    await expect(getCurrentVersions([record])).rejects.toThrow('cannot be corrected: salary');
  });

  it('returns nothing for no records without querying', async () => {
    expect(await getCurrentVersions([])).toEqual([]);
  });
});

describe('the current version is what the rest of the system sees', () => {
  it('clears the unidentified-recruiter flag once the job seeker adds the email', async () => {
    const record = await seedInteraction({ identifiable: false });
    expect((await detectStoredUncertainData()).get(record.id)!.map((f) => f.ruleId)).toContain('unidentified_recruiter');

    await raiseSystemCorrectionRequests();
    const request = await CorrectionRequest.findOne({ where: { interactionId: record.id } });
    await respondToCorrectionRequest({
      requestId: request!.id,
      ...answer,
      answer: 'corrected',
      correctedValues: { recruiterEmail: 'jane@acme.com' },
    });

    expect((await detectStoredUncertainData()).get(record.id)!.map((f) => f.ruleId)).not.toContain('unidentified_recruiter');
  });

  it('shows corrected values on the dashboard list and detail, with the original on the detail', async () => {
    const record = await seedInteraction({ identifiable: true });
    await correct(record.id, 'recruiterCompany', 'Acme Staffing');

    const history = await listInteractions();
    const listed = [...history.confirmed, ...history.pendingReview].find((i) => i.id === record.id)!;
    expect(listed.recruiterCompany).toBe('Acme Staffing');
    expect(listed.correctedFields).toEqual(['recruiterCompany']);

    const detail = await getInteractionById(record.id);
    expect(detail!.recruiterCompany).toBe('Acme Staffing');
    expect(detail!.originalValues).toEqual({ recruiterCompany: 'Acme' });
  });

  it('shows the reviewer the corrected values in the review queue', async () => {
    const record = await seedInteraction({ identifiable: false });
    await raiseSystemCorrectionRequests();
    const request = await CorrectionRequest.findOne({ where: { interactionId: record.id } });
    await respondToCorrectionRequest({
      requestId: request!.id,
      ...answer,
      answer: 'corrected',
      correctedValues: { recruiterCompany: 'Initech' },
    });

    const item = (await listPendingReview()).find((i) => i.interactionId === record.id)!;
    expect(item.recruiterCompany).toBe('Initech');
  });
});
