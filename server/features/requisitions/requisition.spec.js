import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as requisitionService from './service';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

describe('Requisition Lifecycle', () => {
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
    await db.collection('requisitions').deleteMany({});
    await db.collection('catalogs').deleteMany({});
    await db.collection('colors').deleteMany({});
  });

  const mockContractor = {
    userId: 'user1',
    organizationId: new ObjectId(),
    organizationData: { type: 'Contractor' },
    role: 'ContractorAdmin',
    permissions: null
  };

  mockContractor.permissions = {
    memberships: [{ organizationId: mockContractor.organizationId, permissions: { requisitions: 'admin', materials: 'admin' } }]
  };

  const mockManufacturerId = new ObjectId();

  it('should create a requisition in draft status', async () => {
    const catalogId = new ObjectId();
    const colorId = new ObjectId();
    
    await db.collection('catalogs').insertOne({
      _id: catalogId,
      identity: { uid: catalogId, name: 'Test Catalog' },
      data: { material: 'Aluminum' }
    });

    await db.collection('colors').insertOne({
      _id: colorId,
      identity: { uid: colorId, name: 'Silver' },
      lineage: { catalogId },
      data: { pricing: { pricePerSqm: 100 } },
      pricing: { pricePerSqm: 100 }
    });

    const data = {
      manufacturerId: mockManufacturerId.toString(),
      items: [{
        catalogId: catalogId.toString(),
        colorId: colorId.toString(),
        sheetThickness: 3,
        width: 1000,
        length: 1000,
        quantity: 5
      }]
    };

    const result = await requisitionService.create(data, mockContractor.userId, mockContractor.organizationId, mockContractor.role, mockContractor.permissions);
    
    expect(result).toBeDefined();
    expect(result.status.state).toBe('DRAFT');
    expect(result.items[0].priceSnapshot).toBe(100);
  });

  it('should fail if non-contractor tries to create requisition', async () => {
    await expect(requisitionService.create({}, mockContractor.userId, mockContractor.organizationId, 'ManufacturerAdmin', mockContractor.permissions))
      .rejects.toThrow('Only contractors can create requisitions');
  });

  it('should progress status from draft to sent', async () => {
    const reqId = new ObjectId();
    await db.collection('requisitions').insertOne({
      _id: reqId,
      identity: { uid: reqId, name: 'REQ' },
      lineage: { organizationId: mockContractor.organizationId },
      status: { state: 'DRAFT', userId: mockContractor.userId, timestamp: new Date(), metadata: {} },
      data: { items: [] }
    });

    const result = await requisitionService.send(reqId.toString(), mockContractor.userId, mockContractor.organizationId, mockContractor.role, mockContractor.permissions);
    expect(result.state).toBe('SENT');
  });
});
