import { parseRecruiterInteractionsCsv, CsvParseError } from './vendorIngestionCsvParser';

describe('parseRecruiterInteractionsCsv', () => {
  it('parses a well-formed CSV into valid records', () => {
    const csv = [
      'recruiterName,recruiterEmail,interactionDate,interactionType',
      'Jane Doe,jane@example.com,2026-08-01,email',
      'John Smith,john@example.com,2026-08-02,call',
    ].join('\n');

    const result = parseRecruiterInteractionsCsv(csv);

    expect(result.totalRows).toBe(2);
    expect(result.valid).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.valid[0].recruiterName).toBe('Jane Doe');
    expect(result.valid[0].interactionType).toBe('email');
  });

  it('normalizes human-friendly header variants to schema field names', () => {
    const csv = [
      'Recruiter Name,Recruiter Email,Interaction Date',
      'Jane Doe,jane@example.com,2026-08-01',
    ].join('\n');

    const result = parseRecruiterInteractionsCsv(csv);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].recruiterName).toBe('Jane Doe');
  });

  it('drops unrecognized columns instead of failing', () => {
    const csv = [
      'recruiterName,interactionDate,favoriteColor',
      'Jane Doe,2026-08-01,blue',
    ].join('\n');

    const result = parseRecruiterInteractionsCsv(csv);

    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('collects a row-level error without discarding valid rows in the same file', () => {
    const csv = [
      'recruiterName,interactionDate',
      'Jane Doe,2026-08-01',
      ',2026-08-02',
    ].join('\n');

    const result = parseRecruiterInteractionsCsv(csv);

    expect(result.totalRows).toBe(2);
    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    expect(result.errors[0].message).toMatch(/recruiterName/);
  });

  it('reports totalRows 0 for a header-only file (no data)', () => {
    const csv = 'recruiterName,interactionDate';

    const result = parseRecruiterInteractionsCsv(csv);

    expect(result.totalRows).toBe(0);
    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('reports totalRows 0 for a completely empty file', () => {
    const result = parseRecruiterInteractionsCsv('');

    expect(result.totalRows).toBe(0);
    expect(result.valid).toHaveLength(0);
  });

  it('throws a CsvParseError instead of an unhandled exception on malformed CSV', () => {
    const malformed = '"unterminated quote,recruiterName\n"Jane';

    expect(() => parseRecruiterInteractionsCsv(malformed)).toThrow(CsvParseError);
  });

  it('strips a UTF-8 BOM instead of corrupting the first header', () => {
    const csv = '﻿recruiterName,interactionDate\nJane Doe,2026-08-01';

    const result = parseRecruiterInteractionsCsv(csv);

    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });
});
