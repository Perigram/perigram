import { beforeEach, describe, expect, it, vi } from 'vitest';

const { collection, connectDB } = vi.hoisted(() => ({
  collection: {
    insertOne: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn()
  },
  connectDB: vi.fn()
}));

vi.mock('../../db/mongo.js', () => ({ connectDB }));
vi.mock('h3', () => ({
  createError: vi.fn(details => Object.assign(new Error(details.message), details))
}));

import * as repository from './repository.js';

describe('machine status persistence owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectDB.mockResolvedValue({ collection: vi.fn(() => collection) });
    collection.insertOne.mockResolvedValue({ insertedId: 'event-1' });
  });

  it('owns legacy status-event insertion and normalizes the target id', async () => {
    const result = await repository.createStatusEvent({
      targetId: '507f1f77bcf86cd799439011',
      targetType: 'invitation',
      status: { state: 'accepted' }
    });

    expect(collection.insertOne).toHaveBeenCalledWith(expect.objectContaining({
      targetType: 'invitation',
      targetId: expect.anything(),
      timestamp: expect.any(Date)
    }));
    expect(String(result._id)).toBe('event-1');
  });

  it('owns the shared status-event history reads', async () => {
    const cursor = {
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([])
    };
    collection.find.mockReturnValue(cursor);
    collection.findOne.mockResolvedValue(null);

    await repository.findStatusEventsByEntity('event-1', 'invitation');
    expect(collection.find).toHaveBeenCalledWith({
      targetId: expect.anything(),
      targetType: 'invitation'
    });
    expect(cursor.sort).toHaveBeenCalledWith({ timestamp: -1 });

    await repository.findStatusEventsAfter('event-0', 10);
    expect(cursor.sort).toHaveBeenCalledWith({ _id: 1 });
    expect(cursor.limit).toHaveBeenCalledWith(10);
    expect(cursor.project).toHaveBeenCalled();

    await repository.findLatestStatusEventByEntity('event-1', 'invitation');
    expect(collection.findOne).toHaveBeenCalledWith(
      { targetId: expect.anything(), targetType: 'invitation' },
      { sort: { timestamp: -1 } }
    );
  });
});
