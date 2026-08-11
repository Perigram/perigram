import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as batchService from './service';

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

describe('Material Batch & Sheet Allocation', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    // Explicit WiredTiger and ReplicaSet for transactions
    mongoServer = await MongoMemoryReplSet.create({
      replSet: {
        name: 'rs0',
        count: 1,
        storageEngine: 'wiredTiger'
      }
    });
    const uri = mongoServer.getUri();
    con = await MongoClient.connect(uri);
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('material_piles').deleteMany({});
    await db.collection('warehouses').deleteMany({});
  });

  const mockManufacturer = {
    userId: 'user1',
    organizationId: new ObjectId(),
    organizationData: { type: 'Manufacturer' },
    permissions: null
  };

  mockManufacturer.permissions = {
    memberships: [{ organizationId: mockManufacturer.organizationId, permissions: { materials: 'admin', catalogs: 'admin' } }]
  };

  it('should create a material batch with piles', async () => {
    const warehouseId = new ObjectId();
    await db.collection('warehouses').insertOne({ 
      _id: warehouseId, 
      name: 'Main Wh', 
      totalBatches: 0,
      organizationId: mockManufacturer.organizationId 
    });

    const data = {
      warehouseId: warehouseId.toString(),
      catalogId: new ObjectId().toString(),
      colorId: new ObjectId().toString(),
      serial: 'PILE-001',
      specs: { material: 'Aluminum', color: 'RAL 9006', thickness: 4, width: 1500, height: 4000 },
      quantity: 10
    };

    const result = await batchService.create(data, mockManufacturer.userId, mockManufacturer.organizationId, null, mockManufacturer.permissions);
    
    expect(result).toBeDefined();
    expect(result.status.state.primary).toBe('STOCKED');
    expect(result.data.stock.total).toBe(10);
    expect(result.data.stockMovements[0]).toMatchObject({ type: 'RECEIPT', quantity: 10, userId: mockManufacturer.userId });
    expect(result.specs.width).toBe(1500);

    const warehouse = await db.collection('warehouses').findOne({ _id: warehouseId });
    expect(warehouse.data.stats.totalBatches).toBe(1);
    expect(warehouse.data.stats.totalSheets).toBe(10);
  });

  it('should list only piles from the requested warehouse', async () => {
    const warehouseId = new ObjectId();
    const otherWarehouseId = new ObjectId();
    const catalogId = new ObjectId();
    const colorId = new ObjectId();

    await db.collection('material_piles').insertMany([
      {
        _id: 'pile-a',
        identity: { uid: 'pile-a', name: 'A' },
        lineage: {
          organizationId: mockManufacturer.organizationId,
          warehouseId,
          catalogId,
          colorId
        },
        data: { stock: { total: 10, used: 0 }, specs: { width: 1500, length: 3000 } }
      },
      {
        _id: 'pile-b',
        identity: { uid: 'pile-b', name: 'B' },
        lineage: {
          organizationId: mockManufacturer.organizationId,
          warehouseId: otherWarehouseId,
          catalogId,
          colorId
        },
        data: { stock: { total: 8, used: 0 }, specs: { width: 1200, length: 2500 } }
      }
    ]);

    const result = await batchService.list(
      mockManufacturer.userId,
      mockManufacturer.organizationId,
      null,
      mockManufacturer.permissions,
      { 'lineage.warehouseId': warehouseId.toString() }
    );

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('pile-a');
  });

  it('should allocate stock and update the pile used count', async () => {
    const batchId = new ObjectId();
    await db.collection('material_piles').insertOne({
      _id: batchId,
      identity: { uid: batchId, name: 'Pile' },
      data: { stock: { total: 10, used: 0 } }
    });

    const allocation = await batchService.allocate(batchId.toString(), 3, 'user1');
    
    expect(allocation.data.stock.used).toBe(3);
    
    const updatedBatch = await db.collection('material_piles').findOne({ _id: batchId });
    expect(updatedBatch.data.stock.used).toBe(3);
    expect(updatedBatch.data.stockMovements[0]).toMatchObject({ type: 'ALLOCATION', quantity: -3, userId: 'user1' });
  });

  it('should fail allocation if insufficient sheets in pile', async () => {
    const batchId = new ObjectId();
    await db.collection('material_piles').insertOne({
      _id: batchId,
      identity: { uid: batchId, name: 'Pile' },
      data: { stock: { total: 5, used: 5 } }
    });

    await expect(batchService.allocate(batchId.toString(), 1, 'user1'))
      .rejects.toThrow(/Insufficient stock/);
  });

  it('should reject non-positive allocation counts', async () => {
    const batchId = new ObjectId();
    await db.collection('material_piles').insertOne({
      _id: batchId,
      identity: { uid: batchId, name: 'Pile' },
      data: { stock: { total: 5, used: 0 } }
    });

    await expect(batchService.allocate(batchId.toString(), 0, 'user1'))
      .rejects.toThrow(/positive/);
    await expect(batchService.allocate(batchId.toString(), -1, 'user1'))
      .rejects.toThrow(/positive/);

    const unchanged = await db.collection('material_piles').findOne({ _id: batchId });
    expect(unchanged.data.stock.used).toBe(0);
  });

  it('should reject stock edits that put used sheets above total', async () => {
    const pileId = 'pile-stock-guard';
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Guarded Pile' },
      lineage: {
        organizationId: mockManufacturer.organizationId,
        warehouseId: new ObjectId(),
        catalogId: new ObjectId(),
        colorId: new ObjectId()
      },
      data: { stock: { total: 5, used: 3 } }
    });

    await expect(batchService.update(
      pileId,
      { stock: { total: 2, used: 3 } },
      mockManufacturer.userId,
      mockManufacturer.organizationId,
      null,
      mockManufacturer.permissions
    )).rejects.toThrow(/total must be at least used/);
  });

  it('should record manual stock adjustments', async () => {
    const pileId = 'pile-stock-adjustment';
    const warehouseId = new ObjectId();
    await db.collection('warehouses').insertOne({
      _id: warehouseId,
      identity: { uid: 'warehouse-adjustment', name: 'Adjustment Warehouse' },
      lineage: { organizationId: mockManufacturer.organizationId },
      data: { stats: { totalBatches: 1, totalSheets: 5 } }
    });
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Adjustable Pile' },
      lineage: {
        organizationId: mockManufacturer.organizationId,
        warehouseId,
        catalogId: new ObjectId(),
        colorId: new ObjectId()
      },
      data: { stock: { total: 5, used: 1 } }
    });

    const result = await batchService.update(
      pileId,
      { stock: { total: 7, used: 1 } },
      mockManufacturer.userId,
      mockManufacturer.organizationId,
      null,
      mockManufacturer.permissions
    );

    expect(result.data.stockMovements[0]).toMatchObject({
      type: 'ADJUSTMENT',
      quantity: 2,
      userId: mockManufacturer.userId
    });
  });
});
