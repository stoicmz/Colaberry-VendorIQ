import ExcelJS from 'exceljs';
import { parseRecruiterInteractionsXlsx, XlsxParseError } from './vendorIngestionXlsxParser';

async function buildXlsxBuffer(rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Interactions');
  rows.forEach((row) => worksheet.addRow(row));
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('parseRecruiterInteractionsXlsx', () => {
  it('parses a well-formed workbook into valid records', async () => {
    const buffer = await buildXlsxBuffer([
      ['recruiterName', 'recruiterEmail', 'interactionDate', 'interactionType'],
      ['Jane Doe', 'jane@example.com', '2026-08-01', 'email'],
      ['John Smith', 'john@example.com', '2026-08-02', 'call'],
    ]);

    const result = await parseRecruiterInteractionsXlsx(buffer);

    expect(result.totalRows).toBe(2);
    expect(result.valid).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.valid[0].recruiterName).toBe('Jane Doe');
    expect(result.valid[0].interactionType).toBe('email');
  });

  it('normalizes human-friendly header variants to schema field names', async () => {
    const buffer = await buildXlsxBuffer([
      ['Recruiter Name', 'Recruiter Email', 'Interaction Date'],
      ['Jane Doe', 'jane@example.com', '2026-08-01'],
    ]);

    const result = await parseRecruiterInteractionsXlsx(buffer);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].recruiterName).toBe('Jane Doe');
  });

  it('drops unrecognized columns instead of failing', async () => {
    const buffer = await buildXlsxBuffer([
      ['recruiterName', 'interactionDate', 'favoriteColor'],
      ['Jane Doe', '2026-08-01', 'blue'],
    ]);

    const result = await parseRecruiterInteractionsXlsx(buffer);

    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('collects a row-level error without discarding valid rows in the same file', async () => {
    const buffer = await buildXlsxBuffer([
      ['recruiterName', 'interactionDate'],
      ['Jane Doe', '2026-08-01'],
      ['', '2026-08-02'],
    ]);

    const result = await parseRecruiterInteractionsXlsx(buffer);

    expect(result.totalRows).toBe(2);
    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    expect(result.errors[0].message).toMatch(/recruiterName/);
  });

  it('skips blank rows without breaking row numbers on later rows', async () => {
    const buffer = await buildXlsxBuffer([
      ['recruiterName', 'interactionDate'],
      ['Jane Doe', '2026-08-01'],
      [],
      ['', '2026-08-03'],
    ]);

    const result = await parseRecruiterInteractionsXlsx(buffer);

    expect(result.totalRows).toBe(2);
    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(4);
  });

  it('reports totalRows 0 for a header-only workbook (no data)', async () => {
    const buffer = await buildXlsxBuffer([['recruiterName', 'interactionDate']]);

    const result = await parseRecruiterInteractionsXlsx(buffer);

    expect(result.totalRows).toBe(0);
    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('reports totalRows 0 for a workbook with no rows at all', async () => {
    const buffer = await buildXlsxBuffer([]);

    const result = await parseRecruiterInteractionsXlsx(buffer);

    expect(result.totalRows).toBe(0);
    expect(result.valid).toHaveLength(0);
  });

  it('throws an XlsxParseError instead of an unhandled exception on a corrupted file', async () => {
    const garbage = Buffer.from('this is not a real xlsx file');

    await expect(parseRecruiterInteractionsXlsx(garbage)).rejects.toThrow(XlsxParseError);
  });
});
