import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import { InteractionDispute } from '../../models/InteractionDispute';
import { HistoryReviewDecision } from '../../models/HistoryReviewDecision';
import { deriveHistoryStatus, getHistoryStatuses } from './historyStatusService';
import * as uncertainDataService from '../uncertainData/uncertainDataService';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('deriveHistoryStatus', () => {
  it.each([
    // attested, uncertain, openDispute, latestDecision -> status, reason
    [true, false, false, null, 'confirmed', 'attested'],
    [false, false, false, null, 'pending_review', 'unattested'],
    [true, false, true, null, 'pending_review', 'disputed'],
    [true, false, true, 'confirmed', 'pending_review', 'disputed'],
    [false, false, false, 'confirmed', 'confirmed', 'reviewer_confirmed'],
    [true, false, false, 'rejected', 'rejected', 'reviewer_rejected'],
    // STORY-005: uncertain data waits for review even when attested; a reviewer ruling clears it.
    [true, true, false, null, 'pending_review', 'uncertain'],
    [false, true, false, null, 'pending_review', 'uncertain'],
    [true, true, true, null, 'pending_review', 'disputed'],
    [true, true, false, 'confirmed', 'confirmed', 'reviewer_confirmed'],
    [true, true, false, 'rejected', 'rejected', 'reviewer_rejected'],
    // Check unavailable (null): an attestation alone never confirms unchecked data.
    [true, null, false, null, 'pending_review', 'uncertainty_unchecked'],
    [false, null, false, null, 'pending_review', 'unattested'],
    [true, null, true, null, 'pending_review', 'disputed'],
    [true, null, false, 'confirmed', 'confirmed', 'reviewer_confirmed'],
  ] as const)(
    'attested=%s, uncertain=%s, openDispute=%s, latestDecision=%s -> %s (%s)',
    (attested, uncertain, hasOpenDispute, latestDecision, status, reason) => {
      expect(deriveHistoryStatus({ attested, uncertain, hasOpenDispute, latestDecision })).toEqual({ status, reason });
    }
  );
});

describe('getHistoryStatuses', () => {
  async function seedInteraction(options: {
    attested: boolean;
    fileHash: string;
    interactionDate?: Date;
    identifiable?: boolean;
  }): Promise<number> {
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
      // An identifiable recruiter, so the STORY-005 uncertain-data rules stay out of these tests.
      recruiterEmail: options.identifiable === false ? null : 'jane@acme.com',
      recruiterCompany: options.identifiable === false ? null : 'Acme',
      interactionDate: options.interactionDate ?? new Date('2026-08-01'),
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
    // A different day, so the two are not a STORY-005 possible duplicate of each other.
    const unattested = await seedInteraction({
      attested: false,
      fileHash: '0'.repeat(64),
      interactionDate: new Date('2026-08-02'),
    });

    const statuses = await getHistoryStatuses([attested, unattested, 9999]);

    expect(statuses.get(attested)?.status).toBe('confirmed');
    expect(statuses.get(unattested)?.status).toBe('pending_review');
    expect(statuses.has(9999)).toBe(false);
  });

  it('returns an empty result for no ids without querying', async () => {
    expect((await getHistoryStatuses([])).size).toBe(0);
  });

  describe('uncertain data (STORY-005)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('routes attested but uncertain data to manual review, with the flags that explain why', async () => {
      const id = await seedInteraction({ attested: true, fileHash: '1'.repeat(64), identifiable: false });

      expect((await getHistoryStatuses([id])).get(id)).toEqual({
        status: 'pending_review',
        reason: 'uncertain',
        uncertainFlags: [expect.objectContaining({ ruleId: 'unidentified_recruiter' })],
      });
    });

    it('treats it as confirmed once a data reviewer confirms it', async () => {
      const id = await seedInteraction({ attested: true, fileHash: '2'.repeat(64), identifiable: false });
      await HistoryReviewDecision.create({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });

      expect((await getHistoryStatuses([id])).get(id)).toEqual({ status: 'confirmed', reason: 'reviewer_confirmed' });
    });

    it('when the check fails: holds attested data for review instead of confirming it, and logs the failure', async () => {
      const id = await seedInteraction({ attested: true, fileHash: '3'.repeat(64) });
      jest.spyOn(uncertainDataService, 'detectStoredUncertainData').mockRejectedValueOnce(new Error('rules crashed'));
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      expect((await getHistoryStatuses([id])).get(id)).toEqual({
        status: 'pending_review',
        reason: 'uncertainty_unchecked',
        uncertainFlags: null,
      });
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Uncertain-data check failed'), expect.any(Error));
    });

    it('when the check fails: keeps a reviewer ruling as it was, marking the check unavailable', async () => {
      const id = await seedInteraction({ attested: true, fileHash: '4'.repeat(64) });
      await HistoryReviewDecision.create({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });
      jest.spyOn(uncertainDataService, 'detectStoredUncertainData').mockRejectedValueOnce(new Error('rules crashed'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      expect((await getHistoryStatuses([id])).get(id)).toEqual({
        status: 'confirmed',
        reason: 'reviewer_confirmed',
        uncertainFlags: null,
      });
    });

    it('recovers by itself: once the check runs again, held data is confirmed with nothing to clean up', async () => {
      const id = await seedInteraction({ attested: true, fileHash: '5'.repeat(64) });
      jest.spyOn(uncertainDataService, 'detectStoredUncertainData').mockRejectedValueOnce(new Error('rules crashed'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      expect((await getHistoryStatuses([id])).get(id)?.reason).toBe('uncertainty_unchecked');

      expect((await getHistoryStatuses([id])).get(id)).toEqual({ status: 'confirmed', reason: 'attested' });
    });
  });
});
