import { beforeEach, describe, expect, it, vi } from 'vitest';

const { collection, connectDB } = vi.hoisted(() => ({
  collection: { insertOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
  connectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB }));

import * as repository from './repository.js';

describe('CTS instance repository revisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectDB.mockResolvedValue({ collection: vi.fn(() => collection) });
    collection.insertOne.mockResolvedValue({ insertedId: 'instance-1' });
    collection.findOneAndUpdate.mockResolvedValue({ value: { _id: 'instance-1', revision: 2 } });
    collection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  it('starts new instance revisions at one', async () => {
    const stored = await repository.insertInstance('items', { _id: 'instance-1', type: 'part', fields: {} });
    expect(stored.revision).toBe(1);
    expect(collection.insertOne).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
  });

  it('increments revisions with compare-and-set field updates', async () => {
    await repository.updateInstanceFields('items', 'instance-1', { 'fields.code': 'A' }, {
      expectedUpdatedAt: '2026-11-16T10:00:00.000Z'
    });
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'instance-1', updatedAt: '2026-11-16T10:00:00.000Z' }),
      expect.objectContaining({
        $set: expect.objectContaining({ 'fields.code': 'A' }),
        $inc: { revision: 1 }
      }),
      { returnDocument: 'after' }
    );
  });

  it('increments revisions for type migration and lineage detachment writes', async () => {
    await repository.updateMigratedInstance('items', 'instance-1', 'part', 'org-1', { typeVersion: 2 });
    expect(collection.updateOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ _id: 'instance-1', type: 'part', organizationId: 'org-1' }),
      { $set: { typeVersion: 2 }, $inc: { revision: 1 } }
    );
    await repository.detachMigratedLineageKey('items', 'instance-1', 'part', 'org-1', 'parent');
    expect(collection.updateOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ _id: 'instance-1', type: 'part', organizationId: 'org-1' }),
      expect.objectContaining({ $unset: { 'lineage.parent': '' }, $inc: { revision: 1 } })
    );
  });
});
