import { sequelize } from '../../config/database';
import { DataCleaningLog } from '../../models/DataCleaningLog';
import { CleaningActionRecord, logCleaningActions } from './dataCleaningService';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('logCleaningActions', () => {
  it('logs every action with the administrator ID and a timestamp', async () => {
    const actions: CleaningActionRecord[] = [
      { rowNumber: 1, action: 'corrected', field: 'recruiterName', detail: 'Trimmed whitespace.' },
      { rowNumber: 2, action: 'flagged_for_review', field: 'recruiterName', detail: 'Missing recruiterName.' },
    ];

    await logCleaningActions(actions, 'admin-jane', 'corr-1');

    const logs = await DataCleaningLog.findAll({ order: [['rowNumber', 'ASC']] });
    expect(logs).toHaveLength(2);
    expect(logs[0].administratorId).toBe('admin-jane');
    expect(logs[0].correlationId).toBe('corr-1');
    expect(logs[0].cleanedAt).toBeInstanceOf(Date);
    expect(logs[1].action).toBe('flagged_for_review');
  });

  it('writes nothing when a run takes no cleaning actions', async () => {
    await logCleaningActions([], 'admin-jane', 'corr-2');

    const logs = await DataCleaningLog.findAll();
    expect(logs).toHaveLength(0);
  });
});
