import { createHash } from 'crypto';
import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord, ensureModelsSynced } from '../../models/VendorIngestionRecord';
import { IngestionAuditLog } from '../../models/IngestionAuditLog';
import { parseRecruiterInteractionsCsv } from './vendorIngestionCsvParser';
import { parseRecruiterInteractionsXlsx } from './vendorIngestionXlsxParser';
import { RowError } from './vendorIngestionRowValidator';
import { RecruiterInteraction } from './vendorIngestionSchema';

export type SupportedIngestionFormat = 'csv' | 'xlsx';

export interface IngestFileResult {
  batchId: number;
  duplicate: boolean;
  totalRows: number;
  validCount: number;
  errorCount: number;
  valid: RecruiterInteraction[];
  errors: RowError[];
}

export class NoDataError extends Error {
  constructor() {
    super('File contains no data.');
    this.name = 'NoDataError';
  }
}

function hashFile(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Idempotency key is the uploaded file's own content hash (translating CLAUDE.md's
 * (vendor_id, source, file_hash) dedup rule to this schema, which has no vendor_id/source
 * concept). Re-submitting the same file returns the original batch instead of re-inserting.
 */
export async function ingestRecruiterInteractionsFile(
  buffer: Buffer,
  fileName: string,
  format: SupportedIngestionFormat,
  correlationId: string
): Promise<IngestFileResult> {
  await ensureModelsSynced();

  const fileHash = hashFile(buffer);

  const existing = await IngestionBatch.findOne({ where: { fileHash } });
  if (existing) {
    await IngestionAuditLog.create({
      correlationId,
      outcome: 'duplicate',
      fileName,
      fileHash,
      format,
      batchId: existing.id,
      totalRows: existing.totalRows,
      validCount: existing.validCount,
      errorCount: existing.errorCount,
      errorMessage: null,
    });

    return {
      batchId: existing.id,
      duplicate: true,
      totalRows: existing.totalRows,
      validCount: existing.validCount,
      errorCount: existing.errorCount,
      valid: [],
      errors: [],
    };
  }

  let parseResult: Awaited<ReturnType<typeof parseRecruiterInteractionsCsv>>;
  try {
    parseResult =
      format === 'csv' ? parseRecruiterInteractionsCsv(buffer) : await parseRecruiterInteractionsXlsx(buffer);
  } catch (err) {
    await IngestionAuditLog.create({
      correlationId,
      outcome: 'rejected',
      fileName,
      fileHash,
      format,
      batchId: null,
      totalRows: null,
      validCount: null,
      errorCount: null,
      errorMessage: err instanceof Error ? err.message : 'Unable to parse file',
    });
    throw err;
  }

  if (parseResult.totalRows === 0) {
    await IngestionAuditLog.create({
      correlationId,
      outcome: 'rejected',
      fileName,
      fileHash,
      format,
      batchId: null,
      totalRows: 0,
      validCount: 0,
      errorCount: 0,
      errorMessage: 'File contains no data.',
    });
    throw new NoDataError();
  }

  const batchId = await sequelize.transaction(async (transaction) => {
    const createdBatch = await IngestionBatch.create(
      {
        fileHash,
        fileName,
        totalRows: parseResult.totalRows,
        validCount: parseResult.valid.length,
        errorCount: parseResult.errors.length,
      },
      { transaction }
    );

    if (parseResult.valid.length > 0) {
      await RecruiterInteractionRecord.bulkCreate(
        parseResult.valid.map((record) => ({
          batchId: createdBatch.id,
          recruiterName: record.recruiterName,
          recruiterEmail: record.recruiterEmail ?? null,
          recruiterCompany: record.recruiterCompany ?? null,
          interactionDate: record.interactionDate,
          interactionType: record.interactionType,
          channel: record.channel ?? null,
          notes: record.notes ?? null,
        })),
        { transaction }
      );
    }

    await IngestionAuditLog.create(
      {
        correlationId,
        outcome: 'success',
        fileName,
        fileHash,
        format,
        batchId: createdBatch.id,
        totalRows: parseResult.totalRows,
        validCount: parseResult.valid.length,
        errorCount: parseResult.errors.length,
        errorMessage: null,
      },
      { transaction }
    );

    return createdBatch.id;
  });

  return {
    batchId,
    duplicate: false,
    totalRows: parseResult.totalRows,
    validCount: parseResult.valid.length,
    errorCount: parseResult.errors.length,
    valid: parseResult.valid,
    errors: parseResult.errors,
  };
}
