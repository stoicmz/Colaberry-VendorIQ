import { parse } from 'csv-parse/sync';
import { RawRow, RowError, validateRows } from './vendorIngestionRowValidator';
import { RecruiterInteraction } from './vendorIngestionSchema';

export interface CsvParseResult {
  totalRows: number;
  valid: RecruiterInteraction[];
  errors: RowError[];
}

export class CsvParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'CsvParseError';
  }
}

export function parseRecruiterInteractionsCsvRows(input: Buffer | string): RawRow[] {
  let rawRows: Record<string, string>[];
  try {
    rawRows = parse(input, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    });
  } catch (err) {
    throw new CsvParseError('Unable to parse CSV file', err);
  }

  return rawRows.map((data, index) => ({ rowNumber: index + 2, data }));
}

export function parseRecruiterInteractionsCsv(input: Buffer | string): CsvParseResult {
  const rows = parseRecruiterInteractionsCsvRows(input);
  const { valid, errors } = validateRows(rows);

  return { totalRows: rows.length, valid, errors };
}
