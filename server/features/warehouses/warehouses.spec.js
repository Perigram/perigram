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
  });

  const mockUser = {
    userId: 'user1',
    organizationId: new ObjectId(),
    role: 'ContractorAdmin',
    permissions: { warehouses: 'admin' }
  };

  it('should maintain inventory counters correctly', async () => {
    const warehouse = await warehouseService.create({
      name: 'South Warehouse',
      organizationId: mockUser.organizationId.toString()
    }, mockUser);

    const warehouseId = warehouse._id.toString();

    await warehouseService.updateInventoryCounts(warehouseId, { totalBatches: 1 });
    let updated = await warehouseService.getById(warehouseId, mockUser);
    expect(updated.totalBatches).toBe(1);

    await warehouseService.updateInventoryCounts(warehouseId, { totalSheets: 5, totalRemnants: 2 });
    updated = await warehouseService.getById(warehouseId, mockUser);
    expect(updated.totalSheets).toBe(5);
    expect(updated.totalRemnants).toBe(2);

    await warehouseService.updateInventoryCounts(warehouseId, { totalSheets: -2 });
    updated = await warehouseService.getById(warehouseId, mockUser);
    expect(updated.totalSheets).toBe(3);
  });

  it('should prevent deletion of warehouse with inventory', async () => {
    const warehouse = await warehouseService.create({
      name: 'Busy Warehouse',
      organizationId: mockUser.organizationId.toString()
    }, mockUser);
    
    await warehouseService.updateInventoryCounts(warehouse._id.toString(), { totalSheets: 1 });

    await expect(warehouseService.remove(warehouse._id.toString(), mockUser))
      .rejects.toThrow(/Cannot delete warehouse with inventory/);
  });
});