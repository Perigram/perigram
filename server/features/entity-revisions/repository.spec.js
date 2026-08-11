import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureIndexes, findByHash } from './repository.js';
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
      findOne: vi.fn()
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
            'data.entityType': 1,
            'data.entityId': 1,
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

  it('looks up revisions by current or legacy source keys', async () => {
    collection.findOne.mockResolvedValueOnce({ _id: 'rev-1' });

    await findByHash('cassette', 'cassette-1', 'geometry', 'sha256:abc');

    expect(collection.findOne).toHaveBeenCalledWith({
      $or: [
        { 'data.source.type': 'cassette', 'data.source.id': 'cassette-1' },
        { 'data.entityType': 'cassette', 'data.entityId': 'cassette-1' }
      ],
      'data.scope': 'geometry',
      'data.contentHash': 'sha256:abc'
    });
  });
});
