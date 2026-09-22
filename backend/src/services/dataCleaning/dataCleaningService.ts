import { RawRow } from '../vendorIngestion/vendorIngestionRowValidator';
import { DataCleaningLog } from '../../models/DataCleaningLog';
import { ensureModelsSynced } from '../../models/VendorIngestionRecord';

export const CLEANING_ACTIONS = ['corrected', 'flagged_for_review', 'removed'] as const;
export type CleaningActionType = (typeof CLEANING_ACTIONS)[number];

export interface CleaningActionRecord {
  rowNumber: number;
  action: CleaningActionType;
  field: string | null;
  detail: string;
}

export type CleaningOutcome = 'clean' | 'corrected' | 'flagged_for_review' | 'removed';

export interface CleanRowResult {
  outcome: CleaningOutcome;
  row: RawRow | null;
  actions: CleaningActionRecord[];
}

export interface CleanRowsResult {
  clean: RawRow[];
  flagged: RawRow[];
  removedCount: number;
  actions: CleaningActionRecord[];
}

const TRIMMABLE_FIELDS = ['recruiterName', 'recruiterCompany', 'channel', 'notes'] as const;
const REQUIRED_FIELDS = ['recruiterName', 'interactionDate'] as const;

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

function isParseableDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Applies deterministic, non-guessing corrections (whitespace/case normalization,
 * dropping an unusably malformed optional field) and flags rows missing a required
 * field for manual review rather than silently dropping them. A row is only removed
 * outright when a REQUIRED field is present but unparseable -- there is no safe way
 * to correct or flag-and-keep a row with no usable date.
 */
export function cleanRow(rawRow: RawRow): CleanRowResult {
  const actions: CleaningActionRecord[] = [];
  const data: Record<string, string | undefined> = { ...rawRow.data };

  for (const field of TRIMMABLE_FIELDS) {
    const original = data[field];
    if (original !== undefined) {
      const trimmed = original.trim();
      if (trimmed !== original) {
        data[field] = trimmed;
        actions.push({
          rowNumber: rawRow.rowNumber,
          action: 'corrected',
          field,
          detail: `Trimmed surrounding whitespace on ${field}.`,
        });
      }
    }
  }

  const email = data.recruiterEmail;
  if (email !== undefined && email.trim() !== '') {
    const normalized = email.trim().toLowerCase();
    if (!looksLikeEmail(normalized)) {
      data.recruiterEmail = undefined;
      actions.push({
        rowNumber: rawRow.rowNumber,
        action: 'corrected',
        field: 'recruiterEmail',
        detail: `Cleared unusable recruiterEmail value "${email}" (not a valid email address).`,
      });
    } else if (normalized !== email) {
      data.recruiterEmail = normalized;
      actions.push({
        rowNumber: rawRow.rowNumber,
        action: 'corrected',
        field: 'recruiterEmail',
        detail: 'Trimmed and lowercased recruiterEmail.',
      });
    }
  }

  const missingFields = REQUIRED_FIELDS.filter((field) => isBlank(data[field]));
  if (missingFields.length > 0) {
    const detail = `Missing required field(s): ${missingFields.join(', ')}.`;
    actions.push({
      rowNumber: rawRow.rowNumber,
      action: 'flagged_for_review',
      field: missingFields.join(', '),
      detail,
    });
    return { outcome: 'flagged_for_review', row: { ...rawRow, data }, actions };
  }

  const interactionDate = data.interactionDate;
  if (interactionDate !== undefined && !isParseableDate(interactionDate)) {
    actions.push({
      rowNumber: rawRow.rowNumber,
      action: 'removed',
      field: 'interactionDate',
      detail: `Removed row: interactionDate "${interactionDate}" is not a parseable date and cannot be safely corrected.`,
    });
    return { outcome: 'removed', row: null, actions };
  }

  return {
    outcome: actions.length > 0 ? 'corrected' : 'clean',
    row: { ...rawRow, data },
    actions,
  };
}

export function cleanRows(rawRows: RawRow[]): CleanRowsResult {
  const clean: RawRow[] = [];
  const flagged: RawRow[] = [];
  const actions: CleaningActionRecord[] = [];
  let removedCount = 0;

  for (const rawRow of rawRows) {
    const result = cleanRow(rawRow);
    actions.push(...result.actions);

    if (result.outcome === 'flagged_for_review' && result.row) {
      flagged.push(result.row);
    } else if (result.outcome === 'removed') {
      removedCount += 1;
    } else if (result.row) {
      clean.push(result.row);
    }
  }

  return { clean, flagged, removedCount, actions };
}

/**
 * Persists every cleaning action taken during one run, satisfying the Trust
 * criterion (administrator ID + timestamp on every action). A run that takes
 * no actions (an already-clean dataset) writes nothing -- there is nothing to
 * log, and an empty run is not itself a cleaning action.
 */
export async function logCleaningActions(
  actions: CleaningActionRecord[],
  administratorId: string,
  correlationId: string
): Promise<void> {
  if (actions.length === 0) {
    return;
  }

  await ensureModelsSynced();
  await DataCleaningLog.bulkCreate(
    actions.map((action) => ({
      correlationId,
      administratorId,
      rowNumber: action.rowNumber,
      action: action.action,
      field: action.field,
      detail: action.detail,
    }))
  );
}
