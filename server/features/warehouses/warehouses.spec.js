import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as warehouseService from './service';

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

describe('Warehouse & Inventory Counting', () => {
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
    await db.collection('warehouses').deleteMany({});
    await db.collection('organizations').deleteMany({});
  });

  const mockUser = {
    userId: 'user1',
    organizationId: new ObjectId(),
    permissions: null
  };

  mockUser.permissions = {
    memberships: [{ organizationId: mockUser.organizationId, permissions: { warehouses: 'admin' } }]
  };

  async function insertOrganization() {
    await db.collection('organizations').insertOne({
      _id: mockUser.organizationId,
      identity: { uid: mockUser.organizationId, name: 'Org' },
      data: { type: 'Customer' }
    });
  }

  it('should maintain inventory counters correctly', async () => {
    await insertOrganization();

    const warehouse = await warehouseService.create({
      name: 'South Warehouse',
      organizationId: mockUser.organizationId.toString()
    }, mockUser.userId, mockUser.organizationId, null, mockUser.permissions);

    const warehouseId = warehouse._id.toString();

    await warehouseService.updateInventoryCounts(warehouseId, { totalBatches: 1 });
    let updated = await warehouseService.getById(warehouseId);
    expect(updated.data.stats.totalBatches).toBe(1);

    await warehouseService.updateInventoryCounts(warehouseId, { totalSheets: 5, totalRemnants: 2 });
    updated = await warehouseService.getById(warehouseId);
    expect(updated.data.stats.totalSheets).toBe(5);
    expect(updated.data.stats.totalRemnants).toBe(2);

    await warehouseService.updateInventoryCounts(warehouseId, { totalSheets: -2 });
    updated = await warehouseService.getById(warehouseId);
    expect(updated.data.stats.totalSheets).toBe(3);
  });

  it('should prevent deletion of warehouse with inventory', async () => {
    await insertOrganization();

    const warehouse = await warehouseService.create({
      name: 'Busy Warehouse',
      organizationId: mockUser.organizationId.toString()
    }, mockUser.userId, mockUser.organizationId, null, mockUser.permissions);
    
    await warehouseService.updateInventoryCounts(warehouse._id.toString(), { totalSheets: 1 });

    await expect(warehouseService.remove(warehouse._id.toString(), mockUser.userId, mockUser.organizationId, null, mockUser.permissions))
      .rejects.toThrow(/Cannot delete warehouse with inventory/);
  });
});
