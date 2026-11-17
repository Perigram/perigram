import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create, ensureIndexes, findByHash, findLatest } from './repository.js';
import { connectDB } from '../../db/mongo.js';

vi.mock('../../db/mongo.js', () => ({
  connectDB: vi.fn()
}));

describe('entity revisions repository indexes', () => {
  let collection;

  beforeEach(() => {
    collection = {
      indexes: vi.fn(),
      dropIndex: vi.fn(),
      createIndex: vi.fn(),
      findOne: vi.fn(),
      find: vi.fn(),
      insertOne: vi.fn()
    };
    connectDB.mockResolvedValue({
      collection: vi.fn(() => collection)
    });
  });

  it('replaces old named content indexes that use pre-source revision keys', async () => {
    collection.indexes
      .mockResolvedValueOnce([
        {
          name: 'entity_revision_content_hash',
          key: {
            'data.typeId': 1,
            'data.instanceId': 1,
            'data.scope': 1,
            'data.contentHash': 1
          }
        }
      ])
      .mockResolvedValueOnce([]);

    await ensureIndexes();

    expect(collection.dropIndex).toHaveBeenCalledWith('entity_revision_content_hash');
    expect(collection.createIndex).toHaveBeenCalledWith({
      'data.source.type': 1,
      'data.source.id': 1,
      'data.scope': 1,
      'data.contentHash': 1
    }, { unique: true, name: 'entity_revision_content_hash' });
  });

  it('keeps current indexes with matching keys', async () => {
    collection.indexes
      .mockResolvedValueOnce([
        {
          name: 'entity_revision_content_hash',
          key: {
            'data.source.type': 1,
            'data.source.id': 1,
            'data.scope': 1,
            'data.contentHash': 1
          }
        }
      ])
      .mockResolvedValueOnce([
        {
          name: 'entity_revision_latest',
          key: {
            'data.source.type': 1,
            'data.source.id': 1,
            'data.scope': 1,
            'data.number': -1
          }
        }
      ]);

    await ensureIndexes();

    expect(collection.dropIndex).not.toHaveBeenCalled();
  });

  it('keeps revision lookup and creation inside a supplied transaction session', async () => {
    const session = { id: 'transaction-session' };
    collection.findOne.mockResolvedValue({ _id: 'revision-1' });
    collection.find.mockReturnValue({
      sort: () => ({ limit: () => ({ next: async () => ({ _id: 'revision-1' }) }) })
    });
    await findByHash('part', 'part-1', 'content', 'sha256:abc', { session });
    expect(collection.findOne).toHaveBeenCalledWith(expect.any(Object), { session });
    await findLatest('part', 'part-1', 'content', { session });
    expect(collection.find).toHaveBeenCalledWith(expect.any(Object), { session });
    await create({ _id: 'revision-2', identity: { uid: 'revision-2' } }, { session });
    expect(collection.insertOne).toHaveBeenCalledWith(expect.objectContaining({ _id: 'revision-2' }), { session });
  });

  it('looks up revisions by the stored source keys', async () => {
    collection.findOne.mockResolvedValueOnce({ _id: 'rev-1' });

    await findByHash('cassette', 'cassette-1', 'geometry', 'sha256:abc');

    expect(collection.findOne).toHaveBeenCalledWith({
      'data.source.type': 'cassette',
      'data.source.id': 'cassette-1',
      'data.scope': 'geometry',
      'data.contentHash': 'sha256:abc'
    });
  });
});
