import { beforeEach, describe, expect, it, vi } from 'vitest';

const { connectDB, collection } = vi.hoisted(() => ({
  connectDB: vi.fn(),
  collection: {
    findOne: vi.fn(),
    insertOne: vi.fn()
  }
}));

vi.mock('../../db/mongo.js', () => ({ connectDB }));

import { findByKey, registerKey } from './repository.js';

describe('idempotency repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectDB.mockResolvedValue({ collection: vi.fn(() => collection) });
  });

  it('looks up a replay key in the idempotency collection', async () => {
    const record = { key: 'request-1', createdAt: new Date() };
    collection.findOne.mockResolvedValue(record);

    await expect(findByKey('request-1')).resolves.toBe(record);
    expect(collection.findOne).toHaveBeenCalledWith({ key: 'request-1' });
  });

  it('stores the request identity and registration timestamp', async () => {
    await registerKey({ key: 'request-2', userId: 'user-1', method: 'POST', url: '/api/items' });

    expect(collection.insertOne).toHaveBeenCalledWith({
      key: 'request-2',
      userId: 'user-1',
      method: 'POST',
      url: '/api/items',
      createdAt: expect.any(Date)
    });
  });

  it('treats the unique-key race as an already-registered success', async () => {
    collection.insertOne.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));

    await expect(registerKey({ key: 'request-3', method: 'POST', url: '/api/items' })).resolves.toBeUndefined();
  });

  it('does not hide non-duplicate persistence failures', async () => {
    const failure = new Error('database unavailable');
    collection.insertOne.mockRejectedValue(failure);

    await expect(registerKey({ key: 'request-4', method: 'POST', url: '/api/items' })).rejects.toBe(failure);
  });
});
