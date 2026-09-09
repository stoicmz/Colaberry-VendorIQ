import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { CsvParseError } from '../services/vendorIngestion/vendorIngestionCsvParser';
import { XlsxParseError } from '../services/vendorIngestion/vendorIngestionXlsxParser';
import { ingestRecruiterInteractionsFile, NoDataError } from '../services/vendorIngestion/vendorIngestionService';
import { ensureModelsSynced } from '../models/VendorIngestionRecord';
import { IngestionAuditLog } from '../models/IngestionAuditLog';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const SUPPORTED_EXTENSIONS = ['csv', 'xlsx'] as const;
type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

function getExtension(filename: string): string {
  const match = /\.([^.]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : '';
}

function isSupportedExtension(extension: string): extension is SupportedExtension {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extension);
}

async function logRejection(params: {
  correlationId: string;
  fileName: string | null;
  format: string | null;
  errorMessage: string;
}): Promise<void> {
  await ensureModelsSynced();
  await IngestionAuditLog.create({
    correlationId: params.correlationId,
    outcome: 'rejected',
    fileName: params.fileName,
    fileHash: null,
    format: params.format,
    batchId: null,
    totalRows: null,
    validCount: null,
    errorCount: null,
    errorMessage: params.errorMessage,
  });
}

export const vendorIngestionRouter = Router();

// Rejections that happen before the ingestion service runs (bad upload, unsupported
// format) are logged here; rejections/successes inside the service log themselves,
// since only the service knows the file hash and, on success, the batch id.
vendorIngestionRouter.post('/upload', (req: Request, res: Response) => {
  const correlationId = randomUUID();

  upload.single('file')(req, res, async (uploadErr: unknown) => {
    try {
      if (uploadErr instanceof multer.MulterError) {
        const message = `Upload rejected: ${uploadErr.message}`;
        await logRejection({ correlationId, fileName: req.file?.originalname ?? null, format: null, errorMessage: message });
        res.status(400).json({ error: message, correlationId });
        return;
      }
      if (uploadErr) {
        await logRejection({ correlationId, fileName: null, format: null, errorMessage: 'Upload failed' });
        res.status(400).json({ error: 'Upload failed', correlationId });
        return;
      }

      const file = req.file;
      if (!file) {
        const message = 'No file was uploaded. Attach a file under the "file" field.';
        await logRejection({ correlationId, fileName: null, format: null, errorMessage: message });
        res.status(400).json({ error: message, correlationId });
        return;
      }

      const extension = getExtension(file.originalname);
      if (!isSupportedExtension(extension)) {
        const message = `Unsupported file format ".${extension || 'unknown'}". Upload a .csv or .xlsx file.`;
        await logRejection({
          correlationId,
          fileName: file.originalname,
          format: extension || null,
          errorMessage: message,
        });
        res.status(400).json({ error: message, correlationId });
        return;
      }

      const result = await ingestRecruiterInteractionsFile(file.buffer, file.originalname, extension, correlationId);

      res.status(200).json({
        correlationId,
        batchId: result.batchId,
        duplicate: result.duplicate,
        totalRows: result.totalRows,
        validCount: result.validCount,
        errorCount: result.errorCount,
        valid: result.valid,
        errors: result.errors,
      });
    } catch (err) {
      if (err instanceof NoDataError || err instanceof CsvParseError || err instanceof XlsxParseError) {
        res.status(400).json({ error: err.message, correlationId });
        return;
      }
      // eslint-disable-next-line no-console
      console.error('Unexpected error while processing vendor ingestion upload', err);
      try {
        await logRejection({
          correlationId,
          fileName: req.file?.originalname ?? null,
          format: null,
          errorMessage: 'Unexpected error while processing the file.',
        });
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('Failed to write ingestion audit log for unexpected error', logErr);
      }
      res.status(500).json({ error: 'Unexpected error while processing the file.', correlationId });
    }
  });
});
