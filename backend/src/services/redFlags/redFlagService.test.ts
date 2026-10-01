import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { HistoryReviewDecision } from '../../models/HistoryReviewDecision';
import { RedFlagLog } from '../../models/RedFlagLog';
import { identifyRedFlags } from './redFlagService';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await sequelize.close();
});

async function seedInteraction(overrides: Partial<{ recruiterCompany: string | null; notes: string | null }> = {}): Promise<number> {
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
    recruiterEmail: 'jane@acme.com',
    recruiterCompany: 'Acme',
    interactionDate: new Date('2026-08-01'),
    interactionType: 'email',
    channel: 'email',
    notes: 'Initial outreach',
    ...overrides,
  });
  return record.id;
}

describe('identifyRedFlags', () => {
  it('returns the flags for each requested interaction and logs them for audit', async () => {
    const feeId = await seedInteraction({ notes: 'Asked for an upfront fee.' });

    const flags = await identifyRedFlags([feeId]);

    expect(flags!.get(feeId)).toEqual([expect.objectContaining({ ruleId: 'money_or_personal_data' })]);
    const logs = await RedFlagLog.findAll();
    expect(logs.map((log) => [log.interactionId, log.ruleId])).toEqual([[feeId, 'money_or_personal_data']]);
  });

  it('returns an empty list, and logs nothing, for clean data', async () => {
    const id = await seedInteraction();

    const flags = await identifyRedFlags([id]);

    expect(flags!.get(id)).toEqual([]);
    expect(await RedFlagLog.count()).toBe(0);
  });

  it('compares against other interactions, so R3 sees the same email under another company', async () => {
    const acmeId = await seedInteraction({ recruiterCompany: 'Acme' });
    await seedInteraction({ recruiterCompany: 'Beta LLC' });

    const flags = await identifyRedFlags([acmeId]);

    expect(flags!.get(acmeId)).toEqual([expect.objectContaining({ ruleId: 'email_multiple_companies' })]);
  });

  it('does not use a reviewer-rejected interaction as evidence', async () => {
    const acmeId = await seedInteraction({ recruiterCompany: 'Acme' });
    const betaId = await seedInteraction({ recruiterCompany: 'Beta LLC' });
    await HistoryReviewDecision.create({ interactionId: betaId, reviewerId: 'rev-1', decision: 'rejected', note: null });

    const flags = await identifyRedFlags([acmeId]);

    expect(flags!.get(acmeId)).toEqual([]);
  });

  it('logging twice does not duplicate audit rows', async () => {
    const id = await seedInteraction({ notes: 'Send your SSN.' });

    await identifyRedFlags([id]);
    await identifyRedFlags([id]);

    expect(await RedFlagLog.count()).toBe(1);
  });

  it('returns null -- never an empty list -- and logs the error when the check fails', async () => {
    const id = await seedInteraction({ notes: 'Asked for an upfront fee.' });
    jest.spyOn(RecruiterInteractionRecord, 'findAll').mockRejectedValueOnce(new Error('database locked'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(identifyRedFlags([id])).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Red flag check failed'), expect.any(Error));
  });

  it('still returns the flags when only the audit write fails, and logs the error', async () => {
    const id = await seedInteraction({ notes: 'Asked for an upfront fee.' });
    jest.spyOn(RedFlagLog, 'bulkCreate').mockRejectedValueOnce(new Error('disk full'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const flags = await identifyRedFlags([id]);

    expect(flags!.get(id)).toEqual([expect.objectContaining({ ruleId: 'money_or_personal_data' })]);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('red flag audit log'), expect.any(Error));
  });

  it('returns an empty map for no ids', async () => {
    await expect(identifyRedFlags([])).resolves.toEqual(new Map());
  });
});
