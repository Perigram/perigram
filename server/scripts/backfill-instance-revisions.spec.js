import { describe, expect, it, vi } from 'vitest';
import { CLASS_COLLECTIONS } from '#packages/cts';
import { runInstanceRevisionBackfill } from './backfill-instance-revisions.js';

function fakeDatabase(docs) {
  const calls = [];
  const collection = {
    find: vi.fn(() => ({
      project: vi.fn().mockReturnThis(),
      async *[Symbol.asyncIterator]() {
        for (const doc of docs) yield doc;
      }
    })),
    updateOne: vi.fn(async (...args) => {
      calls.push(args);
      return { modifiedCount: 1 };
    })
  };
  return { db: { collection: vi.fn(() => collection) }, collection, calls };
}

describe('instance revision backfill', () => {
  it('reports legacy rows in dry-run mode', async () => {
    const { db, collection } = fakeDatabase([{ _id: 'legacy-1' }, { _id: 'legacy-2' }]);
    const result = await runInstanceRevisionBackfill(db);
    expect(result).toEqual({
      mode: 'dry-run',
      scanned: Object.values(CLASS_COLLECTIONS).length * 2,
      updated: Object.values(CLASS_COLLECTIONS).length * 2,
      skipped: 0,
      failures: []
    });
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  it('backfills every per-class collection when apply is selected', async () => {
    const { db, calls } = fakeDatabase([{ _id: 'legacy-1' }]);
    const result = await runInstanceRevisionBackfill(db, { apply: true });
    expect(result).toEqual({
      mode: 'apply',
      scanned: Object.values(CLASS_COLLECTIONS).length,
      updated: Object.values(CLASS_COLLECTIONS).length,
      skipped: 0,
      failures: []
    });
    expect(calls).toHaveLength(Object.values(CLASS_COLLECTIONS).length);
    expect(calls[0][1]).toEqual({ $set: { revision: 1 } });
  });
});
