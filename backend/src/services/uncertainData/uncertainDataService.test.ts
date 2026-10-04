import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { UncertainDataFlag as UncertainDataFlagRow } from '../../models/UncertainDataFlag';
import { detectStoredUncertainData, flagUncertainData } from './uncertainDataService';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await sequelize.close();
});

async function seedBatch(createdAt: Date): Promise<number> {
  const batch = await IngestionBatch.create({
    fileHash: `hash-${Date.now()}-${Math.random()}`,
    fileName: 'interactions.csv',
    totalRows: 1,
    validCount: 1,
    errorCount: 0,
    createdAt,
  });
  return batch.id;
}

async function seedInteraction(
  batchId: number,
  overrides: Partial<{ interactionDate: Date; recruiterEmail: string | null; recruiterCompany: string | null }> = {}
): Promise<number> {
  const record = await RecruiterInteractionRecord.create({
    batchId,
    recruiterName: 'Jane Doe',
    recruiterEmail: 'jane@acme.com',
    recruiterCompany: 'Acme',
    interactionDate: new Date('2026-09-01T00:00:00Z'),
    interactionType: 'email',
    channel: 'email',
    notes: null,
    ...overrides,
  });
  return record.id;
}

const SUBMITTED = new Date('2026-09-20T15:00:00Z');

describe('detectStoredUncertainData', () => {
  it("checks U2 against the submission's real ingestion date", async () => {
    const batchId = await seedBatch(SUBMITTED);
    const id = await seedInteraction(batchId, { interactionDate: new Date('2026-09-23T00:00:00Z') });

    const flags = await detectStoredUncertainData();

    expect(flags.get(id)).toEqual([
      expect.objectContaining({ ruleId: 'date_after_submission', evidence: 'Dated 2026-09-23, submitted 2026-09-20' }),
    ]);
  });

  it('flags the same row uploaded in two submissions as a possible duplicate, on both records', async () => {
    const first = await seedInteraction(await seedBatch(SUBMITTED));
    const second = await seedInteraction(await seedBatch(SUBMITTED));

    const flags = await detectStoredUncertainData();

    expect(flags.get(first)!.map((flag) => flag.ruleId)).toEqual(['possible_duplicate']);
    expect(flags.get(second)!.map((flag) => flag.ruleId)).toEqual(['possible_duplicate']);
  });

  it('returns an empty list for every certain record', async () => {
    const batchId = await seedBatch(SUBMITTED);
    const a = await seedInteraction(batchId);
    const b = await seedInteraction(batchId, { interactionDate: new Date('2026-09-05T00:00:00Z') });

    const flags = await detectStoredUncertainData();

    expect(flags.get(a)).toEqual([]);
    expect(flags.get(b)).toEqual([]);
  });

  it('only reads: it never records a flag', async () => {
    await seedInteraction(await seedBatch(SUBMITTED), { recruiterEmail: null, recruiterCompany: null });

    await detectStoredUncertainData();

    expect(await UncertainDataFlagRow.count()).toBe(0);
  });

  it('returns an empty map when nothing has been ingested', async () => {
    await expect(detectStoredUncertainData()).resolves.toEqual(new Map());
  });
});

describe('flagUncertainData', () => {
  it('records each flag (the reviewer notification and audit entry) and reports how many', async () => {
    const id = await seedInteraction(await seedBatch(SUBMITTED), { recruiterEmail: null, recruiterCompany: null });

    await expect(flagUncertainData()).resolves.toBe(1);

    const rows = await UncertainDataFlagRow.findAll();
    expect(rows.map((row) => [row.interactionId, row.ruleId])).toEqual([[id, 'unidentified_recruiter']]);
  });

  it('is safe to run repeatedly: one row per flag', async () => {
    await seedInteraction(await seedBatch(SUBMITTED), { recruiterEmail: null, recruiterCompany: null });

    await flagUncertainData();
    await flagUncertainData();

    expect(await UncertainDataFlagRow.count()).toBe(1);
  });

  it('writes nothing for certain data', async () => {
    await seedInteraction(await seedBatch(SUBMITTED));

    await expect(flagUncertainData()).resolves.toBe(0);
    expect(await UncertainDataFlagRow.count()).toBe(0);
  });

  it('propagates a database failure to the caller', async () => {
    await seedInteraction(await seedBatch(SUBMITTED), { recruiterEmail: null, recruiterCompany: null });
    jest.spyOn(UncertainDataFlagRow, 'bulkCreate').mockRejectedValueOnce(new Error('disk full'));

    await expect(flagUncertainData()).rejects.toThrow('disk full');
  });
});
