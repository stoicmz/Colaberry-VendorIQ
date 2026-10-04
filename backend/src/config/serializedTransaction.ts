import { Transaction } from 'sequelize';
import { sequelize } from './database';

// Review writes run one at a time: each waits for the previous one to finish, so a
// double-click or retry sees the first submission's row and does not write a duplicate.
// SQLite locking cannot do this here -- Sequelize's sqlite driver errors on overlapping
// transactions instead of queueing them. One queue is shared by every service that uses it,
// so a reviewer's decision and a job seeker's answer on the same interaction never overlap.
// This holds for the single Node process VendorIQ runs as; several processes sharing one
// database would need a database-level guard.
let writeQueue: Promise<unknown> = Promise.resolve();

export function serializedTransaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
  const run = writeQueue.then(() => sequelize.transaction(work));
  // The caller still receives the error through `run`; the queue only needs to move on, so a
  // failed write must not block the ones behind it.
  writeQueue = run.catch(() => undefined);
  return run;
}
