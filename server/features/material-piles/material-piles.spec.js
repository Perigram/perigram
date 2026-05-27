import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
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
    mongoServer = await MongoMemoryServer.create({ 
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
    expect(result.status.state).toBe('STOCKED');
    expect(result.data.stock.total).toBe(10);
  });

  it('should allocate sheets and update pile usedCount', async () => {
    const batchId = new ObjectId();
    const pileId = new ObjectId();
    await db.collection('material_piles').insertOne({
      _id: batchId,
      identity: { uid: batchId, name: 'Pile' },
      data: { stock: { total: 10, used: 0 } }
    });

    const allocation = await batchService.allocateSheets(batchId.toString(), pileId.toString(), 3, 'user1');
    
    expect(allocation.success).toBe(true);
    expect(allocation.sheets).toHaveLength(3);
    
    const updatedBatch = await db.collection('material_piles').findOne({ _id: batchId });
    expect(updatedBatch.data.stock.used).toBe(3);
  });

  it('should fail allocation if insufficient sheets in pile', async () => {
    const batchId = new ObjectId();
    const pileId = new ObjectId();
    await db.collection('material_piles').insertOne({
      _id: batchId,
      identity: { uid: batchId, name: 'Pile' },
      data: { stock: { total: 5, used: 5 } }
    });

    await expect(batchService.allocateSheets(batchId.toString(), pileId.toString(), 1, 'user1'))
      .rejects.toThrow(/Insufficient sheets/);
  });
});
