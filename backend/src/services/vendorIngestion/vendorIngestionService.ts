import { createHash } from 'crypto';
import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord, ensureModelsSynced } from '../../models/VendorIngestionRecord';
import { IngestionAuditLog } from '../../models/IngestionAuditLog';
import { SubmissionAttestation } from '../../models/SubmissionAttestation';
import { parseRecruiterInteractionsCsv } from './vendorIngestionCsvParser';
import { parseRecruiterInteractionsXlsx } from './vendorIngestionXlsxParser';
import { RowError } from './vendorIngestionRowValidator';
import { RecruiterInteraction } from './vendorIngestionSchema';

export type SupportedIngestionFormat = 'csv' | 'xlsx';

// The wording a job seeker agrees to when submitting (REQ-019). It is copied onto every
// SubmissionAttestation row, so changing it here never rewrites what earlier submitters attested.
export const ATTESTATION_STATEMENT =
  'I attest that the recruiter interaction data in this submission is factual to the best of my knowledge.';

export interface AttestationInput {
  attestedBy: string;
}

export interface AttestationSummary {
  attestedBy: string;
  statement: string;
  attestedAt: Date;
  // false when this person had already attested this submission (a retry or re-upload);
  // the original attestation stands and no second row is written.
  newlyRecorded: boolean;
}

export interface IngestFileResult {
  batchId: number;
  duplicate: boolean;
  totalRows: number;
  validCount: number;
  errorCount: number;
  valid: RecruiterInteraction[];
  errors: RowError[];
  attestation: AttestationSummary;
}

export class NoDataError extends Error {
  constructor() {
    super('File contains no data.');
    this.name = 'NoDataError';
  }
}

export class AttestationRequiredError extends Error {
  constructor() {
    super('You must attest that the submitted data is factual before it can be accepted.');
    this.name = 'AttestationRequiredError';
  }
}

function toSummary(row: SubmissionAttestation, newlyRecorded: boolean): AttestationSummary {
  return { attestedBy: row.attestedBy, statement: row.statement, attestedAt: row.attestedAt, newlyRecorded };
}

function hashFile(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Idempotency key is the uploaded file's own content hash (translating CLAUDE.md's
 * (vendor_id, source, file_hash) dedup rule to this schema, which has no vendor_id/source
 * concept). Re-submitting the same file returns the original batch instead of re-inserting.
 *
 * Attestation (REQ-019) is required: without an attester nothing is parsed or stored. On a
 * new file the attestation is written in the same transaction as the batch, so a batch can
 * never exist without one. On a re-upload the attestation is logged against the original
 * batch -- this is how rows ingested before attestation existed get attested -- unless the
 * same person already attested it, in which case the original stands.
 */
export async function ingestRecruiterInteractionsFile(
  buffer: Buffer,
  fileName: string,
  format: SupportedIngestionFormat,
  correlationId: string,
  attestation: AttestationInput
): Promise<IngestFileResult> {
  const attestedBy = attestation.attestedBy.trim();
  if (attestedBy === '') {
    throw new AttestationRequiredError();
  }

  await ensureModelsSynced();

  const fileHash = hashFile(buffer);

  const existing = await IngestionBatch.findOne({ where: { fileHash } });
  if (existing) {
    const [attestationRow, created] = await SubmissionAttestation.findOrCreate({
      where: { batchId: existing.id, attestedBy },
      defaults: {
        batchId: existing.id,
        correlationId,
        attestedBy,
        statement: ATTESTATION_STATEMENT,
        channel: 'file',
        fileHash,
      },
    });

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
      attestation: toSummary(attestationRow, created),
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

  const { batchId, attestationRow } = await sequelize.transaction(async (transaction) => {
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

    const createdAttestation = await SubmissionAttestation.create(
      {
        batchId: createdBatch.id,
        correlationId,
        attestedBy,
        statement: ATTESTATION_STATEMENT,
        channel: 'file',
        fileHash,
      },
      { transaction }
    );

    return { batchId: createdBatch.id, attestationRow: createdAttestation };
  });

  return {
    batchId,
    duplicate: false,
    totalRows: parseResult.totalRows,
    validCount: parseResult.valid.length,
    errorCount: parseResult.errors.length,
    valid: parseResult.valid,
    errors: parseResult.errors,
    attestation: toSummary(attestationRow, true),
  };
}
