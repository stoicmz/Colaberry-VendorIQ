import { cleanRow, cleanRows } from './dataCleaningService';
import { RawRow } from '../vendorIngestion/vendorIngestionRowValidator';

function row(rowNumber: number, data: Record<string, string | undefined>): RawRow {
  return { rowNumber, data };
}

describe('cleanRow', () => {
  it('passes a fully valid row through unchanged with no actions logged', () => {
    const result = cleanRow(
      row(1, {
        recruiterName: 'Jane Doe',
        interactionDate: '2026-08-01',
        recruiterEmail: 'jane.doe@example.com',
      })
    );

    expect(result.outcome).toBe('clean');
    expect(result.row?.data).toEqual({
      recruiterName: 'Jane Doe',
      interactionDate: '2026-08-01',
      recruiterEmail: 'jane.doe@example.com',
    });
    expect(result.actions).toEqual([]);
  });

  it('corrects whitespace and email casing instead of dropping the row', () => {
    const result = cleanRow(
      row(2, {
        recruiterName: '  Jane Doe  ',
        interactionDate: '2026-08-01',
        recruiterEmail: '  Jane.Doe@Example.com  ',
      })
    );

    expect(result.outcome).toBe('corrected');
    expect(result.row).not.toBeNull();
    expect(result.row?.data.recruiterName).toBe('Jane Doe');
    expect(result.row?.data.recruiterEmail).toBe('jane.doe@example.com');
    expect(result.actions).toHaveLength(2);
    expect(result.actions.every((a) => a.action === 'corrected')).toBe(true);
  });

  it('clears an unusably malformed optional email rather than removing the row', () => {
    const result = cleanRow(
      row(3, {
        recruiterName: 'Jane Doe',
        interactionDate: '2026-08-01',
        recruiterEmail: 'not-an-email',
      })
    );

    expect(result.outcome).toBe('corrected');
    expect(result.row?.data.recruiterEmail).toBeUndefined();
    expect(result.actions).toEqual([
      expect.objectContaining({ rowNumber: 3, action: 'corrected', field: 'recruiterEmail' }),
    ]);
  });

  it('flags a row missing a required field for review instead of dropping it', () => {
    const result = cleanRow(row(4, { interactionDate: '2026-08-01' }));

    expect(result.outcome).toBe('flagged_for_review');
    expect(result.row).not.toBeNull();
    expect(result.actions).toEqual([
      expect.objectContaining({
        rowNumber: 4,
        action: 'flagged_for_review',
        field: 'recruiterName',
      }),
    ]);
  });

  it('removes a row whose required interactionDate is present but unparseable', () => {
    const result = cleanRow(row(5, { recruiterName: 'Jane Doe', interactionDate: 'not-a-date' }));

    expect(result.outcome).toBe('removed');
    expect(result.row).toBeNull();
    expect(result.actions).toEqual([
      expect.objectContaining({ rowNumber: 5, action: 'removed', field: 'interactionDate' }),
    ]);
  });
});

describe('cleanRows', () => {
  it('buckets a mixed dataset and returns every action taken', () => {
    const result = cleanRows([
      row(1, { recruiterName: 'Jane Doe', interactionDate: '2026-08-01' }),
      row(2, { recruiterName: '  Trimmed  ', interactionDate: '2026-08-02' }),
      row(3, { interactionDate: '2026-08-03' }),
      row(4, { recruiterName: 'Jane Doe', interactionDate: 'garbage' }),
    ]);

    expect(result.clean).toHaveLength(2);
    expect(result.flagged).toHaveLength(1);
    expect(result.removedCount).toBe(1);
    expect(result.actions.filter((a) => a.action === 'corrected')).toHaveLength(1);
    expect(result.actions.filter((a) => a.action === 'flagged_for_review')).toHaveLength(1);
    expect(result.actions.filter((a) => a.action === 'removed')).toHaveLength(1);
  });
});
