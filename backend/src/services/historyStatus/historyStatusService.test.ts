import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import { InteractionDispute } from '../../models/InteractionDispute';
import { HistoryReviewDecision } from '../../models/HistoryReviewDecision';
import { deriveHistoryStatus, getHistoryStatuses } from './historyStatusService';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('deriveHistoryStatus', () => {
  it.each([
    // attested, openDispute, latestDecision -> status, reason
    [true, false, null, 'confirmed', 'attested'],
    [false, false, null, 'pending_review', 'unattested'],
    [true, true, null, 'pending_review', 'disputed'],
    [true, true, 'confirmed', 'pending_review', 'disputed'],
    [false, false, 'confirmed', 'confirmed', 'reviewer_confirmed'],
    [true, false, 'rejected', 'rejected', 'reviewer_rejected'],
  ] as const)(
    'attested=%s, openDispute=%s, latestDecision=%s -> %s (%s)',
    (attested, hasOpenDispute, latestDecision, status, reason) => {
      expect(deriveHistoryStatus({ attested, hasOpenDispute, latestDecision })).toEqual({ status, reason });
    }
  );
});

describe('getHistoryStatuses', () => {
  async function seedInteraction(options: { attested: boolean; fileHash: string }): Promise<number> {
    const batch = await IngestionBatch.create({
      fileHash: options.fileHash,
      fileName: 'i.csv',
      totalRows: 1,
      validCount: 1,
      errorCount: 0,
    });
    if (options.attested) {
      await SubmissionAttestation.create({
        batchId: batch.id,
        correlationId: 'corr',
        attestedBy: 'seeker-ana',
        statement: 'factual',
        channel: 'file',
        fileHash: options.fileHash,
      });
    }
    const record = await RecruiterInteractionRecord.create({
      batchId: batch.id,
      recruiterName: 'Jane Doe',
      recruiterEmail: null,
      recruiterCompany: null,
      interactionDate: new Date('2026-08-01'),
      interactionType: 'email',
      channel: null,
      notes: null,
    });
    return record.id;
  }

  it('treats an attested, undisputed interaction as confirmed history', async () => {
    const id = await seedInteraction({ attested: true, fileHash: 'a'.repeat(64) });

    expect((await getHistoryStatuses([id])).get(id)).toEqual({ status: 'confirmed', reason: 'attested' });
  });

  it('routes an interaction that was never attested (e.g. ingested before STORY-015) to manual review', async () => {
    const id = await seedInteraction({ attested: false, fileHash: 'b'.repeat(64) });

    expect((await getHistoryStatuses([id])).get(id)).toEqual({ status: 'pending_review', reason: 'unattested' });
  });

  it('routes an attested interaction back to manual review once it is disputed', async () => {
    const id = await seedInteraction({ attested: true, fileHash: 'c'.repeat(64) });
    await InteractionDispute.create({ interactionId: id, disputedBy: 'recruiter-jane', reason: 'Never happened' });

    expect((await getHistoryStatuses([id])).get(id)).toEqual({ status: 'pending_review', reason: 'disputed' });
  });

  it('keeps a dispute raised after a reviewer confirmation in manual review', async () => {
    const id = await seedInteraction({ attested: true, fileHash: 'd'.repeat(64) });
    await HistoryReviewDecision.create({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });
    await InteractionDispute.create({ interactionId: id, disputedBy: 'recruiter-jane', reason: 'Wrong date' });

    expect((await getHistoryStatuses([id])).get(id)?.status).toBe('pending_review');
  });

  it('uses the latest reviewer decision once the dispute it resolved is closed', async () => {
    const id = await seedInteraction({ attested: true, fileHash: 'e'.repeat(64) });
    const dispute = await InteractionDispute.create({ interactionId: id, disputedBy: 'recruiter-jane', reason: 'x' });
    await HistoryReviewDecision.create({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });
    const latest = await HistoryReviewDecision.create({
      interactionId: id,
      reviewerId: 'rev-2',
      decision: 'rejected',
      note: 'Recruiter provided evidence',
    });
    await dispute.update({ resolvedByDecisionId: latest.id });

    expect((await getHistoryStatuses([id])).get(id)).toEqual({ status: 'rejected', reason: 'reviewer_rejected' });
  });

  it('works out each interaction separately in one call, and skips unknown ids', async () => {
    const attested = await seedInteraction({ attested: true, fileHash: 'f'.repeat(64) });
    const unattested = await seedInteraction({ attested: false, fileHash: '0'.repeat(64) });

    const statuses = await getHistoryStatuses([attested, unattested, 9999]);

    expect(statuses.get(attested)?.status).toBe('confirmed');
    expect(statuses.get(unattested)?.status).toBe('pending_review');
    expect(statuses.has(9999)).toBe(false);
  });

  it('returns an empty result for no ids without querying', async () => {
    expect((await getHistoryStatuses([])).size).toBe(0);
  });
});
