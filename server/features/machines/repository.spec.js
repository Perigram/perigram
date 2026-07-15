import { beforeEach, describe, expect, it, vi } from 'vitest';

const collection = vi.hoisted(() => ({
  updateOne: vi.fn(),
  findOne: vi.fn()
}));

vi.mock('../../db/mongo.js', () => ({
  connectDB: vi.fn(async () => ({
    collection: vi.fn(() => collection)
  }))
}));

import { upsertSystemDefault } from './repository.js';

describe('machine repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collection.findOne.mockResolvedValue({ _id: 'machine-system-default' });
  });

  it('upserts the system default by stable _id instead of non-unique systemKey', async () => {
    await upsertSystemDefault({
      _id: 'machine-system-default',
      identity: { uid: 'machine-system-default', name: 'Default' },
      lineage: { scope: 'system' },
      data: { systemKey: 'default-nesting-machine' }
    });

    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'machine-system-default' },
      expect.objectContaining({
        $set: expect.objectContaining({
          data: { systemKey: 'default-nesting-machine' }
        }),
        $setOnInsert: { _id: 'machine-system-default' }
      }),
      { upsert: true }
    );
  });
});
