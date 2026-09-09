import ExcelJS from 'exceljs';
import { RawRow, RowError, validateRows } from './vendorIngestionRowValidator';
import { RecruiterInteraction } from './vendorIngestionSchema';

export interface XlsxParseResult {
  totalRows: number;
  valid: RecruiterInteraction[];
  errors: RowError[];
}

export class XlsxParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'XlsxParseError';
  }
}

function cellToString(value: ExcelJS.CellValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return String(value);
  if ('richText' in value) return value.richText.map((segment) => segment.text).join('');
  if ('text' in value) return String(value.text);
  if ('result' in value) return value.result === undefined ? undefined : String(value.result);
  return undefined;
}

function isRowBlank(row: ExcelJS.Row): boolean {
  let hasValue = false;
  row.eachCell({ includeEmpty: false }, (cell) => {
    const asString = cellToString(cell.value);
    if (asString !== undefined && asString.trim() !== '') {
      hasValue = true;
    }
  });
  return !hasValue;
}

export async function parseRecruiterInteractionsXlsx(input: Buffer): Promise<XlsxParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's own index.d.ts declares `declare interface Buffer extends ArrayBuffer {}`,
    // which merges into and corrupts the global Node Buffer type project-wide once @types/node
    // is also loaded, so no real Buffer value can satisfy `load`'s declared parameter type.
    await workbook.xlsx.load(input as any);
  } catch (err) {
    throw new XlsxParseError('Unable to parse XLSX file', err);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { totalRows: 0, valid: [], errors: [] };
  }

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = cellToString(cell.value) ?? '';
  });

  const rows: RawRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (isRowBlank(row)) continue;

    const data: Record<string, string | undefined> = {};
    headers.forEach((header, colNumber) => {
      if (!header) return;
      data[header] = cellToString(row.getCell(colNumber).value);
    });
    rows.push({ rowNumber, data });
  }

  const { valid, errors } = validateRows(rows);

  return { totalRows: rows.length, valid, errors };
}
