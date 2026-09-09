import { randomUUID } from 'crypto';
import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { IngestionAuditLog } from '../../models/IngestionAuditLog';
import { ingestRecruiterInteractionsFile, NoDataError } from './vendorIngestionService';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('ingestRecruiterInteractionsFile', () => {
  it('persists a batch and its valid rows on first upload', async () => {
    const csv = [
      'recruiterName,recruiterEmail,interactionDate,interactionType',
      'Jane Doe,jane@example.com,2026-08-01,email',
      'John Smith,john@example.com,2026-08-02,call',
    ].join('\n');

    const result = await ingestRecruiterInteractionsFile(Buffer.from(csv), 'interactions.csv', 'csv', randomUUID());

    expect(result.duplicate).toBe(false);
    expect(result.validCount).toBe(2);

    const batches = await IngestionBatch.findAll();
    expect(batches).toHaveLength(1);
    expect(batches[0].fileName).toBe('interactions.csv');

    const rows = await RecruiterInteractionRecord.findAll({ where: { batchId: result.batchId } });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.recruiterName).sort()).toEqual(['Jane Doe', 'John Smith']);
  });

  it('does not persist rows that failed row-level validation', async () => {
    const csv = ['recruiterName,interactionDate', 'Jane Doe,2026-08-01', ',2026-08-02'].join('\n');

    const result = await ingestRecruiterInteractionsFile(Buffer.from(csv), 'interactions.csv', 'csv', randomUUID());

    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(1);

    const rows = await RecruiterInteractionRecord.findAll({ where: { batchId: result.batchId } });
    expect(rows).toHaveLength(1);
  });

  it('is idempotent: re-ingesting the exact same file does not create a duplicate batch or rows', async () => {
    const csv = [
      'recruiterName,recruiterEmail,interactionDate,interactionType',
      'Jane Doe,jane@example.com,2026-08-01,email',
    ].join('\n');
    const buffer = Buffer.from(csv);

    const first = await ingestRecruiterInteractionsFile(buffer, 'interactions.csv', 'csv', randomUUID());
    const second = await ingestRecruiterInteractionsFile(buffer, 'interactions.csv', 'csv', randomUUID());

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.batchId).toBe(first.batchId);

    const batches = await IngestionBatch.findAll();
    expect(batches).toHaveLength(1);

    const rows = await RecruiterInteractionRecord.findAll();
    expect(rows).toHaveLength(1);
  });

  it('treats files with different content as distinct uploads', async () => {
    const csvA = ['recruiterName,interactionDate', 'Jane Doe,2026-08-01'].join('\n');
    const csvB = ['recruiterName,interactionDate', 'John Smith,2026-08-02'].join('\n');

    const first = await ingestRecruiterInteractionsFile(Buffer.from(csvA), 'a.csv', 'csv', randomUUID());
    const second = await ingestRecruiterInteractionsFile(Buffer.from(csvB), 'b.csv', 'csv', randomUUID());

    expect(second.duplicate).toBe(false);
    expect(second.batchId).not.toBe(first.batchId);

    const batches = await IngestionBatch.findAll();
    expect(batches).toHaveLength(2);
  });

  it('throws NoDataError instead of persisting an empty batch', async () => {
    const csv = 'recruiterName,interactionDate';

    await expect(ingestRecruiterInteractionsFile(Buffer.from(csv), 'empty.csv', 'csv', randomUUID())).rejects.toThrow(
      NoDataError
    );

    const batches = await IngestionBatch.findAll();
    expect(batches).toHaveLength(0);
  });

  describe('audit logging', () => {
    it('logs a success entry with the batch id and counts', async () => {
      const csv = ['recruiterName,interactionDate', 'Jane Doe,2026-08-01'].join('\n');
      const correlationId = randomUUID();

      const result = await ingestRecruiterInteractionsFile(Buffer.from(csv), 'interactions.csv', 'csv', correlationId);

      const entries = await IngestionAuditLog.findAll({ where: { correlationId } });
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe('success');
      expect(entries[0].batchId).toBe(result.batchId);
      expect(entries[0].validCount).toBe(1);
    });

    it('logs a duplicate entry (distinct from the original success entry) on re-upload', async () => {
      const csv = ['recruiterName,interactionDate', 'Jane Doe,2026-08-01'].join('\n');
      const buffer = Buffer.from(csv);

      const first = await ingestRecruiterInteractionsFile(buffer, 'interactions.csv', 'csv', randomUUID());
      const duplicateCorrelationId = randomUUID();
      await ingestRecruiterInteractionsFile(buffer, 'interactions.csv', 'csv', duplicateCorrelationId);

      const duplicateEntries = await IngestionAuditLog.findAll({ where: { correlationId: duplicateCorrelationId } });
      expect(duplicateEntries).toHaveLength(1);
      expect(duplicateEntries[0].outcome).toBe('duplicate');
      expect(duplicateEntries[0].batchId).toBe(first.batchId);

      const allEntries = await IngestionAuditLog.findAll();
      expect(allEntries).toHaveLength(2);
    });

    it('logs a rejected entry (with no batch id) when the file has no data', async () => {
      const correlationId = randomUUID();

      await expect(
        ingestRecruiterInteractionsFile(Buffer.from('recruiterName,interactionDate'), 'empty.csv', 'csv', correlationId)
      ).rejects.toThrow(NoDataError);

      const entries = await IngestionAuditLog.findAll({ where: { correlationId } });
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe('rejected');
      expect(entries[0].batchId).toBeNull();
      expect(entries[0].errorMessage).toMatch(/no data/i);
    });

    it('logs a rejected entry when the file is corrupted', async () => {
      const correlationId = randomUUID();
      const malformed = '"unterminated quote,recruiterName\n"Jane';

      await expect(
        ingestRecruiterInteractionsFile(Buffer.from(malformed), 'bad.csv', 'csv', correlationId)
      ).rejects.toThrow();

      const entries = await IngestionAuditLog.findAll({ where: { correlationId } });
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe('rejected');
      expect(entries[0].batchId).toBeNull();
    });
  });
});
