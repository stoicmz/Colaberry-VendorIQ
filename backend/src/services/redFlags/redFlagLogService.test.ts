import { sequelize } from '../../config/database';
import { RedFlagLog } from '../../models/RedFlagLog';
import { logRedFlagIdentifications } from './redFlagLogService';
import { RED_FLAG_RULES_VERSION, RedFlag } from './redFlagRules';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await sequelize.close();
});

const feeFlag: RedFlag = {
  ruleId: 'money_or_personal_data',
  description: 'Notes mention a payment or personal/financial details',
  evidence: '"fee"',
};
const gmailFlag: RedFlag = {
  ruleId: 'personal_email_domain',
  description: 'Personal email domain used while representing a company',
  evidence: 'gmail.com, representing Acme',
};

describe('logRedFlagIdentifications', () => {
  it('writes one audit row per identified flag, with rule, version and evidence', async () => {
    await logRedFlagIdentifications(new Map([[1, [feeFlag, gmailFlag]], [2, []]]));

    const rows = await RedFlagLog.findAll({ order: [['id', 'ASC']] });
    expect(rows.map((row) => [row.interactionId, row.ruleId, row.rulesVersion, row.evidence])).toEqual([
      [1, 'money_or_personal_data', RED_FLAG_RULES_VERSION, '"fee"'],
      [1, 'personal_email_domain', RED_FLAG_RULES_VERSION, 'gmail.com, representing Acme'],
    ]);
    expect(rows.every((row) => row.identifiedAt instanceof Date)).toBe(true);
  });

  it('is idempotent: logging the same flags twice leaves one row each', async () => {
    const flags = new Map([[1, [feeFlag, gmailFlag]]]);
    await logRedFlagIdentifications(flags);
    await logRedFlagIdentifications(flags);

    expect(await RedFlagLog.count()).toBe(2);
  });

  it('records new evidence for the same rule as a new identification', async () => {
    await logRedFlagIdentifications(new Map([[1, [feeFlag]]]));
    await logRedFlagIdentifications(new Map([[1, [{ ...feeFlag, evidence: '"fee", "ssn"' }]]]));

    const rows = await RedFlagLog.findAll({ order: [['id', 'ASC']] });
    expect(rows.map((row) => row.evidence)).toEqual(['"fee"', '"fee", "ssn"']);
  });

  it('writes nothing when no flags were identified', async () => {
    await logRedFlagIdentifications(new Map([[1, []]]));
    await logRedFlagIdentifications(new Map());

    expect(await RedFlagLog.count()).toBe(0);
  });

  it('propagates a database failure instead of swallowing it', async () => {
    jest.spyOn(RedFlagLog, 'bulkCreate').mockRejectedValueOnce(new Error('disk full'));

    await expect(logRedFlagIdentifications(new Map([[1, [feeFlag]]]))).rejects.toThrow('disk full');
  });
});
