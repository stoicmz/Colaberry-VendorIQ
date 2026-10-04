import { sequelize } from '../../config/database';
import { UncertainDataFlag as UncertainDataFlagRow } from '../../models/UncertainDataFlag';
import { recordUncertainDataFlags } from './uncertainDataFlagService';
import { UNCERTAIN_DATA_RULES_VERSION, UncertainDataFlag } from './uncertainDataRules';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await sequelize.close();
});

const unidentified: UncertainDataFlag = {
  ruleId: 'unidentified_recruiter',
  description: 'Recruiter cannot be identified: no email or company recorded',
  evidence: 'Only a name is recorded: Jane Doe',
};
const duplicate: UncertainDataFlag = {
  ruleId: 'possible_duplicate',
  description: 'Possible duplicate: same recruiter, day and type in another submission',
  evidence: 'Matches interaction #2 (email on 2026-09-01)',
};

describe('recordUncertainDataFlags', () => {
  it('writes one row per flag, with rule, version, description and evidence', async () => {
    await recordUncertainDataFlags(new Map([[1, [unidentified, duplicate]], [2, []]]));

    const rows = await UncertainDataFlagRow.findAll({ order: [['id', 'ASC']] });
    expect(rows.map((row) => [row.interactionId, row.ruleId, row.rulesVersion, row.description, row.evidence])).toEqual([
      [1, 'unidentified_recruiter', UNCERTAIN_DATA_RULES_VERSION, unidentified.description, unidentified.evidence],
      [1, 'possible_duplicate', UNCERTAIN_DATA_RULES_VERSION, duplicate.description, duplicate.evidence],
    ]);
    expect(rows.every((row) => row.flaggedAt instanceof Date)).toBe(true);
  });

  it('is idempotent: recording the same flags twice leaves one row each', async () => {
    const flags = new Map([[1, [unidentified, duplicate]]]);
    await recordUncertainDataFlags(flags);
    await recordUncertainDataFlags(flags);

    expect(await UncertainDataFlagRow.count()).toBe(2);
  });

  it('records new evidence for the same rule as a new flag', async () => {
    await recordUncertainDataFlags(new Map([[1, [duplicate]]]));
    await recordUncertainDataFlags(new Map([[1, [{ ...duplicate, evidence: 'Matches interaction #2, #3 (email on 2026-09-01)' }]]]));

    const rows = await UncertainDataFlagRow.findAll({ order: [['id', 'ASC']] });
    expect(rows.map((row) => row.evidence)).toEqual([
      'Matches interaction #2 (email on 2026-09-01)',
      'Matches interaction #2, #3 (email on 2026-09-01)',
    ]);
  });

  it('writes nothing when no data was flagged', async () => {
    await recordUncertainDataFlags(new Map([[1, []]]));
    await recordUncertainDataFlags(new Map());

    expect(await UncertainDataFlagRow.count()).toBe(0);
  });

  it('propagates a database failure instead of swallowing it', async () => {
    jest.spyOn(UncertainDataFlagRow, 'bulkCreate').mockRejectedValueOnce(new Error('disk full'));

    await expect(recordUncertainDataFlags(new Map([[1, [unidentified]]]))).rejects.toThrow('disk full');
  });
});
