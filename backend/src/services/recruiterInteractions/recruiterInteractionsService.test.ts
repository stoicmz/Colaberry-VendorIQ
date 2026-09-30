import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { InteractionViewLog } from '../../models/InteractionViewLog';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import { HistoryReviewDecision } from '../../models/HistoryReviewDecision';
import { getInteractionById, listInteractions } from './recruiterInteractionsService';

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
    recruiterName: 'Jane Doe',
    recruiterEmail: 'jane@example.com',
    recruiterCompany: 'Acme Corp',
    interactionDate: new Date('2026-08-01'),
    interactionType: 'email',
    channel: 'email',
    notes: 'Initial outreach',
  });
  return record.id;
}

describe('listInteractions', () => {
  it('returns empty lists when nothing has been ingested', async () => {
    await expect(listInteractions()).resolves.toEqual({ confirmed: [], pendingReview: [] });
  });

  it('keeps an unattested interaction out of confirmed history (REQ-019)', async () => {
    const id = await seedInteraction();

    const history = await listInteractions();

    expect(history.confirmed).toEqual([]);
    expect(history.pendingReview.map((i) => i.id)).toEqual([id]);
    expect(history.pendingReview[0].historyStatusReason).toBe('unattested');
  });

  it('lists an attested interaction as confirmed history', async () => {
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

    const history = await listInteractions();

    expect(history.confirmed.map((i) => i.id)).toEqual([id]);
    expect(history.pendingReview).toEqual([]);
  });

  it('leaves a reviewer-rejected interaction out of both lists', async () => {
    const id = await seedInteraction();
    await HistoryReviewDecision.create({ interactionId: id, reviewerId: 'rev-1', decision: 'rejected', note: null });

    await expect(listInteractions()).resolves.toEqual({ confirmed: [], pendingReview: [] });
  });
});

describe('getInteractionById', () => {
  it('returns null for an id that does not exist, without writing a view log', async () => {
    const result = await getInteractionById(999999);

    expect(result).toBeNull();
    expect(await InteractionViewLog.count()).toBe(0);
  });

  it('logs a timestamped view every time a detail view is loaded, including repeat views', async () => {
    const id = await seedInteraction();

    await getInteractionById(id);
    await getInteractionById(id);

    const logs = await InteractionViewLog.findAll({ where: { interactionId: id }, order: [['id', 'ASC']] });
    expect(logs).toHaveLength(2);
    expect(logs[0].viewedAt).toBeInstanceOf(Date);
    expect(logs[1].viewedAt).toBeInstanceOf(Date);
  });
});
