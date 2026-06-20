import mongoose, { ClientSession } from 'mongoose';

/**
 * Runs `fn` inside a MongoDB transaction, committing on success and aborting on
 * error. Used where several documents must change atomically — sale
 * finalization (design doc rule #5) and goods receipt.
 *
 * NOTE: transactions require MongoDB to run as a replica set (even a
 * single-node one). A standalone `mongod` will throw "Transaction numbers are
 * only allowed on a replica set member or mongos".
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
