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
    organizationId: new ObjectId(),
    role: 'ContractorAdmin'
  };

  it('should complete milling and update warehouse stock', async () => {
    const warehouseId = new ObjectId();
    await db.collection('warehouses').insertOne({ _id: warehouseId, totalSheets: 1, totalRemnants: 0 });

    const sheetId = new ObjectId();
    await db.collection('sheets').insertOne({
      _id: sheetId,
      status: 'in_cutting',
      warehouseId: warehouseId
    });

    const cassetteIds = [new ObjectId(), new ObjectId()];
    const remnantIds = [new ObjectId()];

    const result = await sheetService.finishMilling(
      sheetId.toString(),
      cassetteIds.map(id => id.toString()),
      remnantIds.map(id => id.toString()),
      mockUser
    );

    expect(result.status).toBe('milled');
    expect(result.cassetteInstanceIds).toHaveLength(2);
    expect(result.remnantIds).toHaveLength(1);

    const wh = await db.collection('warehouses').findOne({ _id: warehouseId });
    expect(wh.totalSheets).toBe(0);
    expect(wh.totalRemnants).toBe(1);
  });

  it('should prevent milling a sheet that is not in cutting status', async () => {
    const sheetId = new ObjectId();
    await db.collection('sheets').insertOne({
      _id: sheetId,
      status: 'in_stock'
    });

    await expect(sheetService.finishMilling(sheetId.toString(), [], [], mockUser))
      .rejects.toThrow(/Sheet must be in cutting status/);
  });
});