import { randomUUID } from 'crypto';
import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { IngestionAuditLog } from '../../models/IngestionAuditLog';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import {
  ATTESTATION_STATEMENT,
  AttestationRequiredError,
  ingestRecruiterInteractionsFile,
  NoDataError,
} from './vendorIngestionService';

const ATTESTED = { attestedBy: 'seeker-ana' };

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

    const result = await ingestRecruiterInteractionsFile(Buffer.from(csv), 'interactions.csv', 'csv', randomUUID(), ATTESTED);

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

    const result = await ingestRecruiterInteractionsFile(Buffer.from(csv), 'interactions.csv', 'csv', randomUUID(), ATTESTED);

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

    const first = await ingestRecruiterInteractionsFile(buffer, 'interactions.csv', 'csv', randomUUID(), ATTESTED);
    const second = await ingestRecruiterInteractionsFile(buffer, 'interactions.csv', 'csv', randomUUID(), ATTESTED);

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

    const first = await ingestRecruiterInteractionsFile(Buffer.from(csvA), 'a.csv', 'csv', randomUUID(), ATTESTED);
    const second = await ingestRecruiterInteractionsFile(Buffer.from(csvB), 'b.csv', 'csv', randomUUID(), ATTESTED);

    expect(second.duplicate).toBe(false);
    expect(second.batchId).not.toBe(first.batchId);

    const batches = await IngestionBatch.findAll();
    expect(batches).toHaveLength(2);
  });

  it('throws NoDataError instead of persisting an empty batch', async () => {
    const csv = 'recruiterName,interactionDate';

    await expect(ingestRecruiterInteractionsFile(Buffer.from(csv), 'empty.csv', 'csv', randomUUID(), ATTESTED)).rejects.toThrow(
      NoDataError
    );

    const batches = await IngestionBatch.findAll();
    expect(batches).toHaveLength(0);
  });

  describe('audit logging', () => {
    it('logs a success entry with the batch id and counts', async () => {
      const csv = ['recruiterName,interactionDate', 'Jane Doe,2026-08-01'].join('\n');
      const correlationId = randomUUID();

      const result = await ingestRecruiterInteractionsFile(Buffer.from(csv), 'interactions.csv', 'csv', correlationId, ATTESTED);

      const entries = await IngestionAuditLog.findAll({ where: { correlationId } });
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe('success');
      expect(entries[0].batchId).toBe(result.batchId);
      expect(entries[0].validCount).toBe(1);
    });

    it('logs a duplicate entry (distinct from the original success entry) on re-upload', async () => {
      const csv = ['recruiterName,interactionDate', 'Jane Doe,2026-08-01'].join('\n');
      const buffer = Buffer.from(csv);

      const first = await ingestRecruiterInteractionsFile(buffer, 'interactions.csv', 'csv', randomUUID(), ATTESTED);
      const duplicateCorrelationId = randomUUID();
      await ingestRecruiterInteractionsFile(buffer, 'interactions.csv', 'csv', duplicateCorrelationId, ATTESTED);

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
        ingestRecruiterInteractionsFile(Buffer.from('recruiterName,interactionDate'), 'empty.csv', 'csv', correlationId, ATTESTED)
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
        ingestRecruiterInteractionsFile(Buffer.from(malformed), 'bad.csv', 'csv', correlationId, ATTESTED)
      ).rejects.toThrow();

      const entries = await IngestionAuditLog.findAll({ where: { correlationId } });
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe('rejected');
      expect(entries[0].batchId).toBeNull();
    });
  });

  describe('attestation (REQ-019)', () => {
    const csv = ['recruiterName,interactionDate', 'Jane Doe,2026-08-01'].join('\n');

    it('records the attestation against the new batch, with the statement and a timestamp', async () => {
      const correlationId = randomUUID();
      const result = await ingestRecruiterInteractionsFile(Buffer.from(csv), 'i.csv', 'csv', correlationId, ATTESTED);

      expect(result.attestation.newlyRecorded).toBe(true);
      const rows = await SubmissionAttestation.findAll({ where: { batchId: result.batchId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].attestedBy).toBe('seeker-ana');
      expect(rows[0].statement).toBe(ATTESTATION_STATEMENT);
      expect(rows[0].channel).toBe('file');
      expect(rows[0].correlationId).toBe(correlationId);
      expect(rows[0].attestedAt).toBeInstanceOf(Date);
    });

    it('accepts no rows and writes nothing when the attester is blank', async () => {
      await expect(
        ingestRecruiterInteractionsFile(Buffer.from(csv), 'i.csv', 'csv', randomUUID(), { attestedBy: '   ' })
      ).rejects.toThrow(AttestationRequiredError);

      expect(await IngestionBatch.count()).toBe(0);
      expect(await RecruiterInteractionRecord.count()).toBe(0);
      expect(await SubmissionAttestation.count()).toBe(0);
    });

    it('logs a re-upload attestation against the original batch without re-ingesting rows', async () => {
      const buffer = Buffer.from(csv);
      const first = await ingestRecruiterInteractionsFile(buffer, 'i.csv', 'csv', randomUUID(), ATTESTED);
      const second = await ingestRecruiterInteractionsFile(buffer, 'i.csv', 'csv', randomUUID(), {
        attestedBy: 'seeker-ben',
      });

      expect(second.duplicate).toBe(true);
      expect(second.attestation.newlyRecorded).toBe(true);
      const rows = await SubmissionAttestation.findAll({ where: { batchId: first.batchId }, order: [['id', 'ASC']] });
      expect(rows.map((row) => row.attestedBy)).toEqual(['seeker-ana', 'seeker-ben']);
      expect(await RecruiterInteractionRecord.count()).toBe(1);
    });

    it('does not double-record when the same person re-submits the same file', async () => {
      const buffer = Buffer.from(csv);
      const first = await ingestRecruiterInteractionsFile(buffer, 'i.csv', 'csv', randomUUID(), ATTESTED);
      const retry = await ingestRecruiterInteractionsFile(buffer, 'i.csv', 'csv', randomUUID(), ATTESTED);

      expect(retry.attestation.newlyRecorded).toBe(false);
      expect(retry.attestation.attestedAt).toEqual(first.attestation.attestedAt);
      expect(await SubmissionAttestation.count()).toBe(1);
    });
  });
});
