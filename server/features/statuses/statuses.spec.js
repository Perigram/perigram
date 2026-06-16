import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));
vi.mock('../../db/mongo.js', () => ({ connectDB: mockedConnectDB }));

import * as statusService from './service.js';

describe('statuses service history', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('status_events').deleteMany({});
    await db.collection('users').deleteMany({});
  });

  it('enriches history events with actor display names', async () => {
    await db.collection('users').insertOne({
      _id: 'user-operator',
      identity: { uid: 'user-operator', name: 'Operator One' },
      data: { email: 'operator@example.com' }
    });
    await db.collection('status_events').insertOne({
      _id: 'event-1',
      targetId: 'queue-1',
      targetType: 'queue',
      fromState: 'DRAFT',
      toState: 'NESTING',
      status: {
        state: 'NESTING',
        userId: 'user-operator',
        timestamp: new Date('2026-06-16T08:00:00.000Z'),
        metadata: { note: 'Started nesting' }
      },
      timestamp: new Date('2026-06-16T08:00:00.000Z')
    });

    const history = await statusService.getHistoryByTarget('queue', 'queue-1');

    expect(history).toHaveLength(1);
    expect(history[0].actor).toMatchObject({
      userId: 'user-operator',
      name: 'Operator One'
    });
    expect(history[0].actor).not.toHaveProperty('email');
  });
});
