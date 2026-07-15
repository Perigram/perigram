import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as remnantService from './service';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

vi.mock('~/server/utils/auth-helpers', () => ({
  hasPermission: vi.fn(() => true)
}));

describe('Remnants & Reusability Logic', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('remnants').deleteMany({});
    await db.collection('warehouses').deleteMany({});
  });

  const mockUser = {
    userId: 'user1',
    organizationId: new ObjectId(),
    memberships: null,
    permissions: null
  };

  mockUser.memberships = [{ organizationId: mockUser.organizationId, permissions: { materials: 'admin', warehouses: 'admin' } }];
  mockUser.permissions = { memberships: mockUser.memberships };

  it('should mark remnant as reusable if area >= 0.1 m2', async () => {
    const warehouseId = new ObjectId();
    await db.collection('warehouses').insertOne({ _id: warehouseId, organizationId: mockUser.organizationId });

    const sheetId = new ObjectId();
    await db.collection('sheets').insertOne({
      _id: sheetId,
      identity: { uid: sheetId, name: 'Sheet' },
      lineage: { organizationId: mockUser.organizationId, warehouseId },
      data: { specs: { thickness: 4 } }
    });
    
    const large = await remnantService.create({
      sheetId: sheetId.toString(),
      warehouseId: warehouseId.toString(),
      geometryDxf: new ObjectId().toString(),
      area: 0.15 
    }, mockUser.userId, mockUser.organizationId, null, mockUser.permissions);
    expect(large.isReusable).toBe(true);

    const small = await remnantService.create({
      sheetId: sheetId.toString(),
      warehouseId: warehouseId.toString(),
      geometryDxf: new ObjectId().toString(),
      area: 0.05 
    }, mockUser.userId, mockUser.organizationId, null, mockUser.permissions);
    expect(small.isReusable).toBe(false);
  });

  it('should mark remnant as used and update warehouse', async () => {
    const warehouseId = new ObjectId();
    await db.collection('warehouses').insertOne({
      _id: warehouseId,
      identity: { uid: warehouseId, name: 'Warehouse' },
      data: { stats: { totalRemnants: 1 } },
      lineage: { organizationId: mockUser.organizationId }
    });

    const remnantId = new ObjectId();
    await db.collection('remnants').insertOne({
      _id: remnantId,
      identity: { uid: remnantId, name: 'Remnant' },
      lineage: { organizationId: mockUser.organizationId, warehouseId },
      status: { state: 'AVAILABLE' },
      data: { isReusable: true }
    });

    const queueId = new ObjectId();
    const result = await remnantService.markAsUsed(remnantId.toString(), queueId.toString(), mockUser);
    
    expect(result.status.state.primary).toBe('USED');
    expect(result.usedInQueueId.toString()).toBe(queueId.toString());

    const wh = await db.collection('warehouses').findOne({ _id: warehouseId });
    expect(wh.data.stats.totalRemnants).toBe(0);
  });
});
