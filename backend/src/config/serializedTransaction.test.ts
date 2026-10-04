import { sequelize } from './database';
import { serializedTransaction } from './serializedTransaction';

afterAll(async () => {
  await sequelize.close();
});

describe('serializedTransaction', () => {
  it('runs overlapping writes one after another, in the order they arrived', async () => {
    const events: string[] = [];
    const slow = serializedTransaction(async () => {
      events.push('first start');
      await new Promise((resolve) => setTimeout(resolve, 30));
      events.push('first end');
    });
    const fast = serializedTransaction(async () => {
      events.push('second start');
    });

    await Promise.all([slow, fast]);

    expect(events).toEqual(['first start', 'first end', 'second start']);
  });

  it('passes a failed write’s error to its caller and still runs the writes behind it', async () => {
    const failing = serializedTransaction(async () => {
      throw new Error('write failed');
    });
    const next = serializedTransaction(async () => 'ran');

    await expect(failing).rejects.toThrow('write failed');
    await expect(next).resolves.toBe('ran');
  });
});
