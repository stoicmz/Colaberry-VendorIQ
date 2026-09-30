import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import { InteractionDispute } from '../../models/InteractionDispute';
import { HistoryReviewDecision } from '../../models/HistoryReviewDecision';
import { getHistoryStatuses } from '../historyStatus/historyStatusService';
import {
  decideHistoryReview,
  disputeInteraction,
  InvalidHistoryReviewInputError,
  listPendingReview,
  NotPendingReviewError,
} from './historyReviewService';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

let hashCounter = 0;
async function seedInteraction(attested: boolean): Promise<number> {
  const fileHash = String(hashCounter++).padStart(64, '0');
  const batch = await IngestionBatch.create({ fileHash, fileName: 'i.csv', totalRows: 1, validCount: 1, errorCount: 0 });
  if (attested) {
    await SubmissionAttestation.create({
      batchId: batch.id,
      correlationId: 'corr',
      attestedBy: 'seeker-ana',
      statement: 'factual',
      channel: 'file',
      fileHash,
    });
  }
  const record = await RecruiterInteractionRecord.create({
    batchId: batch.id,
    recruiterName: 'Jane Doe',
    recruiterEmail: null,
    recruiterCompany: 'Acme',
    interactionDate: new Date('2026-08-01'),
    interactionType: 'email',
    channel: null,
    notes: null,
  });
  return record.id;
}

async function statusOf(id: number) {
  return (await getHistoryStatuses([id])).get(id);
}

describe('disputeInteraction', () => {
  it('moves an attested interaction out of confirmed history and into manual review', async () => {
    const id = await seedInteraction(true);
    expect((await statusOf(id))?.status).toBe('confirmed');

    const result = await disputeInteraction({ interactionId: id, disputedBy: 'recruiter-jane', reason: 'Never happened' });

    expect(result?.created).toBe(true);
    expect(result?.disputedAt).toBeInstanceOf(Date);
    expect(await statusOf(id)).toEqual({ status: 'pending_review', reason: 'disputed' });
  });

  it('does not create a second open dispute when the same person disputes again', async () => {
    const id = await seedInteraction(true);
    const first = await disputeInteraction({ interactionId: id, disputedBy: 'recruiter-jane', reason: 'x' });
    const second = await disputeInteraction({ interactionId: id, disputedBy: 'recruiter-jane', reason: 'x again' });

    expect(second?.created).toBe(false);
    expect(second?.disputeId).toBe(first?.disputeId);
    expect(await InteractionDispute.count()).toBe(1);
  });

  it('does not create duplicates when the same dispute is submitted twice at once', async () => {
    const id = await seedInteraction(true);
    const input = { interactionId: id, disputedBy: 'recruiter-jane', reason: 'double click' };

    await Promise.all([disputeInteraction(input), disputeInteraction(input)]);

    expect(await InteractionDispute.count()).toBe(1);
  });

  it.each([
    ['disputedBy', { disputedBy: '  ', reason: 'x' }],
    ['reason', { disputedBy: 'recruiter-jane', reason: '' }],
  ])('rejects a dispute with a blank %s and writes nothing', async (_field, fields) => {
    const id = await seedInteraction(true);

    await expect(disputeInteraction({ interactionId: id, ...fields })).rejects.toThrow(InvalidHistoryReviewInputError);
    expect(await InteractionDispute.count()).toBe(0);
  });

  it('returns null for an interaction that does not exist', async () => {
    expect(await disputeInteraction({ interactionId: 9999, disputedBy: 'x', reason: 'y' })).toBeNull();
  });
});

describe('decideHistoryReview', () => {
  it('lets a reviewer confirm an unattested interaction, logged with reviewer ID and timestamp', async () => {
    const id = await seedInteraction(false);

    const result = await decideHistoryReview({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });

    expect(result?.reviewerId).toBe('rev-1');
    expect(result?.decidedAt).toBeInstanceOf(Date);
    expect(await statusOf(id)).toEqual({ status: 'confirmed', reason: 'reviewer_confirmed' });
  });

  it('closes the open disputes in the same step as recording the decision', async () => {
    const id = await seedInteraction(true);
    await disputeInteraction({ interactionId: id, disputedBy: 'recruiter-jane', reason: 'x' });
    await disputeInteraction({ interactionId: id, disputedBy: 'recruiter-bob', reason: 'y' });

    const result = await decideHistoryReview({ interactionId: id, reviewerId: 'rev-1', decision: 'rejected', note: 'n' });

    expect(result?.resolvedDisputeCount).toBe(2);
    expect(await InteractionDispute.count({ where: { resolvedByDecisionId: null } })).toBe(0);
    expect(await statusOf(id)).toEqual({ status: 'rejected', reason: 'reviewer_rejected' });
  });

  it('refuses to rule on an interaction that is not waiting for review, and writes nothing', async () => {
    const id = await seedInteraction(true);

    await expect(
      decideHistoryReview({ interactionId: id, reviewerId: 'rev-1', decision: 'rejected', note: null })
    ).rejects.toThrow(NotPendingReviewError);
    expect(await HistoryReviewDecision.count()).toBe(0);
  });

  it('does not record a second ruling when the same decision is submitted twice', async () => {
    const id = await seedInteraction(false);
    const input = { interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null };

    const results = await Promise.allSettled([decideHistoryReview(input), decideHistoryReview(input)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await HistoryReviewDecision.count()).toBe(1);
  });

  it.each([
    ['a blank reviewer ID', { reviewerId: ' ', decision: 'confirmed' }],
    ['an unknown decision', { reviewerId: 'rev-1', decision: 'approved' }],
  ])('rejects %s and writes nothing', async (_label, fields) => {
    const id = await seedInteraction(false);

    await expect(decideHistoryReview({ interactionId: id, note: null, ...fields })).rejects.toThrow(
      InvalidHistoryReviewInputError
    );
    expect(await HistoryReviewDecision.count()).toBe(0);
  });

  it('returns null for an interaction that does not exist', async () => {
    expect(
      await decideHistoryReview({ interactionId: 9999, reviewerId: 'rev-1', decision: 'confirmed', note: null })
    ).toBeNull();
  });
});

describe('listPendingReview', () => {
  it('lists unattested and disputed interactions with the reason and open disputes, and nothing else', async () => {
    const confirmed = await seedInteraction(true);
    const unattested = await seedInteraction(false);
    const disputed = await seedInteraction(true);
    await disputeInteraction({ interactionId: disputed, disputedBy: 'recruiter-jane', reason: 'Never happened' });

    const queue = await listPendingReview();

    expect(queue.map((item) => item.interactionId)).toEqual([unattested, disputed]);
    expect(queue.map((item) => item.interactionId)).not.toContain(confirmed);
    expect(queue[0].reason).toBe('unattested');
    expect(queue[0].openDisputes).toEqual([]);
    expect(queue[1].reason).toBe('disputed');
    expect(queue[1].openDisputes[0]).toMatchObject({ disputedBy: 'recruiter-jane', reason: 'Never happened' });
  });

  it('drops an interaction from the queue once a reviewer rules on it', async () => {
    const id = await seedInteraction(false);
    await decideHistoryReview({ interactionId: id, reviewerId: 'rev-1', decision: 'confirmed', note: null });

    expect(await listPendingReview()).toEqual([]);
  });
});
