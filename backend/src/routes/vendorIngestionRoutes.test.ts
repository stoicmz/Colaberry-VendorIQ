import express from 'express';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { vendorIngestionRouter } from './vendorIngestionRoutes';
import { sequelize } from '../config/database';
import { IngestionAuditLog } from '../models/IngestionAuditLog';
import { IngestionBatch, RecruiterInteractionRecord } from '../models/VendorIngestionRecord';
import { SubmissionAttestation } from '../models/SubmissionAttestation';
import { ATTESTATION_STATEMENT } from '../services/vendorIngestion/vendorIngestionService';

function buildApp() {
  const app = express();
  app.use('/api/vendor-ingestion', vendorIngestionRouter);
  return app;
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

async function buildXlsxBuffer(rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Interactions');
  rows.forEach((row) => worksheet.addRow(row));
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('POST /api/vendor-ingestion/upload', () => {
  it('ingests a well-formed CSV file', async () => {
    const csv = [
      'recruiterName,recruiterEmail,interactionDate,interactionType',
      'Jane Doe,jane@example.com,2026-08-01,email',
      'John Smith,john@example.com,2026-08-02,call',
    ].join('\n');

    const response = await request(buildApp())
      .post('/api/vendor-ingestion/upload')
      .field('attested', 'true')
      .field('attestedBy', 'seeker-ana')
      .attach('file', Buffer.from(csv), 'interactions.csv');

    expect(response.status).toBe(200);
    expect(response.body.duplicate).toBe(false);
    expect(response.body.batchId).toBeDefined();
    expect(response.body.correlationId).toBeDefined();
    expect(response.body.totalRows).toBe(2);
    expect(response.body.validCount).toBe(2);
    expect(response.body.errorCount).toBe(0);
    expect(response.body.valid[0].recruiterName).toBe('Jane Doe');

    const auditEntries = await IngestionAuditLog.findAll({ where: { correlationId: response.body.correlationId } });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].outcome).toBe('success');
    expect(auditEntries[0].batchId).toBe(response.body.batchId);
  });

  it('does not create a duplicate batch when the same file is uploaded twice', async () => {
    const csv = [
      'recruiterName,recruiterEmail,interactionDate,interactionType',
      'Jane Doe,jane@example.com,2026-08-01,email',
    ].join('\n');

    const app = buildApp();
    const first = await request(app)
      .post('/api/vendor-ingestion/upload')
      .field('attested', 'true')
      .field('attestedBy', 'seeker-ana')
      .attach('file', Buffer.from(csv), 'interactions.csv');
    const second = await request(app)
      .post('/api/vendor-ingestion/upload')
      .field('attested', 'true')
      .field('attestedBy', 'seeker-ana')
      .attach('file', Buffer.from(csv), 'interactions.csv');

    expect(first.body.duplicate).toBe(false);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.batchId).toBe(first.body.batchId);
    expect(second.body.correlationId).not.toBe(first.body.correlationId);

    const auditEntries = await IngestionAuditLog.findAll({ order: [['id', 'ASC']] });
    expect(auditEntries.map((entry) => entry.outcome)).toEqual(['success', 'duplicate']);
  });

  it('ingests a well-formed XLSX file', async () => {
    const buffer = await buildXlsxBuffer([
      ['recruiterName', 'recruiterEmail', 'interactionDate', 'interactionType'],
      ['Jane Doe', 'jane@example.com', '2026-08-01', 'email'],
    ]);

    const response = await request(buildApp())
      .post('/api/vendor-ingestion/upload')
      .field('attested', 'true')
      .field('attestedBy', 'seeker-ana')
      .attach('file', buffer, 'interactions.xlsx');

    expect(response.status).toBe(200);
    expect(response.body.totalRows).toBe(1);
    expect(response.body.validCount).toBe(1);
    expect(response.body.valid[0].recruiterName).toBe('Jane Doe');
  });

  it('rejects an unsupported file format with an error message, and logs the rejection', async () => {
    const response = await request(buildApp())
      .post('/api/vendor-ingestion/upload')
      .field('attested', 'true')
      .field('attestedBy', 'seeker-ana')
      .attach('file', Buffer.from('just some text'), 'interactions.txt');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Unsupported file format/);
    expect(response.body.correlationId).toBeDefined();

    const auditEntries = await IngestionAuditLog.findAll({ where: { correlationId: response.body.correlationId } });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].outcome).toBe('rejected');
    expect(auditEntries[0].fileName).toBe('interactions.txt');
  });

  it('rejects a corrupted CSV file with an error message instead of crashing', async () => {
    const malformed = '"unterminated quote,recruiterName\n"Jane';

    const response = await request(buildApp())
      .post('/api/vendor-ingestion/upload')
      .field('attested', 'true')
      .field('attestedBy', 'seeker-ana')
      .attach('file', Buffer.from(malformed), 'interactions.csv');

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('rejects a corrupted XLSX file with an error message instead of crashing', async () => {
    const garbage = Buffer.from('this is not a real xlsx file');

    const response = await request(buildApp())
      .post('/api/vendor-ingestion/upload')
      .field('attested', 'true')
      .field('attestedBy', 'seeker-ana')
      .attach('file', garbage, 'interactions.xlsx');

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('rejects a file with no data rows', async () => {
    const csv = 'recruiterName,interactionDate';

    const response = await request(buildApp())
      .post('/api/vendor-ingestion/upload')
      .field('attested', 'true')
      .field('attestedBy', 'seeker-ana')
      .attach('file', Buffer.from(csv), 'interactions.csv');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/no data/i);
  });

  describe('attestation (REQ-019 / STORY-015)', () => {
    const csv = ['recruiterName,interactionDate', 'Jane Doe,2026-08-01'].join('\n');

    it('accepts an attested upload and logs the attestation against the batch with a timestamp', async () => {
      const response = await request(buildApp())
        .post('/api/vendor-ingestion/upload')
        .field('attested', 'true')
        .field('attestedBy', 'seeker-ana')
        .attach('file', Buffer.from(csv), 'interactions.csv');

      expect(response.status).toBe(200);
      expect(response.body.attestation.attestedBy).toBe('seeker-ana');
      expect(response.body.attestation.statement).toBe(ATTESTATION_STATEMENT);
      expect(response.body.attestation.attestedAt).toBeDefined();

      const attestations = await SubmissionAttestation.findAll({ where: { batchId: response.body.batchId } });
      expect(attestations).toHaveLength(1);
      expect(attestations[0].correlationId).toBe(response.body.correlationId);
    });

    it.each([
      ['no attestation fields at all', {}],
      ['attested is not "true"', { attested: 'false', attestedBy: 'seeker-ana' }],
      ['no attestedBy', { attested: 'true' }],
      ['a blank attestedBy', { attested: 'true', attestedBy: '   ' }],
    ])('rejects the upload and accepts no rows when there is %s', async (_label, fields: Record<string, string>) => {
      let req = request(buildApp()).post('/api/vendor-ingestion/upload');
      for (const [name, value] of Object.entries(fields)) {
        req = req.field(name, value);
      }
      const response = await req.attach('file', Buffer.from(csv), 'interactions.csv');

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/attest/i);
      expect(await IngestionBatch.count()).toBe(0);
      expect(await RecruiterInteractionRecord.count()).toBe(0);
      expect(await SubmissionAttestation.count()).toBe(0);

      const auditEntries = await IngestionAuditLog.findAll({ where: { correlationId: response.body.correlationId } });
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].outcome).toBe('rejected');
      expect(auditEntries[0].fileName).toBe('interactions.csv');
    });
  });

  it('rejects a request with no file attached, and logs the rejection', async () => {
    const response = await request(buildApp()).post('/api/vendor-ingestion/upload');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/No file was uploaded/);

    const auditEntries = await IngestionAuditLog.findAll({ where: { correlationId: response.body.correlationId } });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].outcome).toBe('rejected');
    expect(auditEntries[0].fileName).toBeNull();
  });
});
