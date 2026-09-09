import { recruiterInteractionSchema, RecruiterInteraction } from './vendorIngestionSchema';

const SCHEMA_FIELD_KEYS = [
  'recruiterName',
  'recruiterEmail',
  'recruiterCompany',
  'interactionDate',
  'interactionType',
  'channel',
  'notes',
] as const;

export interface RowError {
  row: number;
  message: string;
}

export interface RawRow {
  rowNumber: number;
  data: Record<string, string | undefined>;
}

export interface RowValidationResult {
  valid: RecruiterInteraction[];
  errors: RowError[];
}

function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NORMALIZED_TO_FIELD: Record<string, (typeof SCHEMA_FIELD_KEYS)[number]> = Object.fromEntries(
  SCHEMA_FIELD_KEYS.map((key) => [normalizeHeaderKey(key), key])
);

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

export function normalizeRow(rawRow: Record<string, string | undefined>): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [rawKey, value] of Object.entries(rawRow)) {
    const fieldKey = NORMALIZED_TO_FIELD[normalizeHeaderKey(rawKey)];
    if (fieldKey) {
      normalized[fieldKey] = emptyToUndefined(value);
    }
  }
  return normalized;
}

export function validateRows(rows: RawRow[]): RowValidationResult {
  const valid: RecruiterInteraction[] = [];
  const errors: RowError[] = [];

  rows.forEach(({ rowNumber, data }) => {
    const cleaned = normalizeRow(data);
    const result = recruiterInteractionSchema.safeParse(cleaned);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({
        row: rowNumber,
        message: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      });
    }
  });

  return { valid, errors };
}
