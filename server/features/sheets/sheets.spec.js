import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as sheetService from './service';

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

describe('Sheet Lifecycle & Milling', () => {
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
    await db.collection('sheets').deleteMany({});
    await db.collection('warehouses').deleteMany({});
  });

  const mockUser = {
    userId: 'user1',
    organizationId: new ObjectId()
  };

  it('should complete milling and update warehouse stock', async () => {
    const warehouseId = new ObjectId();
    await db.collection('warehouses').insertOne({
      _id: warehouseId,
      identity: { uid: warehouseId, name: 'Warehouse' },
      data: { stats: { totalSheets: 1, totalRemnants: 0 } }
    });

    const sheetId = new ObjectId();
    await db.collection('sheets').insertOne({
      _id: sheetId,
      identity: { uid: sheetId, name: 'Sheet' },
      status: { state: 'IN-CUTTING' },
      lineage: { warehouseId }
    });

    const cassetteIds = [new ObjectId(), new ObjectId()];
    const remnantIds = [new ObjectId()];

    const result = await sheetService.finishMilling(
      sheetId.toString(),
      cassetteIds.map(id => id.toString()),
      remnantIds.map(id => id.toString()),
      mockUser
    );

    expect(result.status.state.primary).toBe('MILLED');
    expect(result.data.cassetteInstanceIds).toHaveLength(2);
    expect(result.data.remnantIds).toHaveLength(1);

    const wh = await db.collection('warehouses').findOne({ _id: warehouseId });
    expect(wh.data.stats.totalSheets).toBe(0);
    expect(wh.data.stats.totalRemnants).toBe(1);
  });

  it('should prevent milling a sheet that is not in cutting status', async () => {
    const sheetId = new ObjectId();
    await db.collection('sheets').insertOne({
      _id: sheetId,
      identity: { uid: sheetId, name: 'Sheet' },
      status: { state: 'AVAILABLE' }
    });

    await expect(sheetService.finishMilling(sheetId.toString(), [], [], mockUser))
      .rejects.toThrow(/Sheet must be in cutting status/);
  });
});
