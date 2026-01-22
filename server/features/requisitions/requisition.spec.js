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

vi.mock('~/server/utils/auth-helpers', () => ({
  hasPermission: vi.fn(() => true)
}));

vi.mock('~/server/utils/permissions', () => ({
  checkEntityAccess: vi.fn((user, entity, ownerId) => user.organizationId.toString() === ownerId.toString())
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
    permissions: { requisitions: 'admin', materials: 'admin' }
  };

  const mockManufacturerId = new ObjectId();

  it('should create a requisition in draft status', async () => {
    const catalogId = new ObjectId();
    const colorId = new ObjectId();
    
    await db.collection('catalogs').insertOne({
      _id: catalogId,
      name: 'Test Catalog',
      material: 'Aluminum',
      sheetThicknessOptions: [3, 4],
      widthOptions: [1000, 1200]
    });

    await db.collection('colors').insertOne({
      _id: colorId,
      catalogId: catalogId,
      color: 'Silver',
      pricePerSqm: 100
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

    const result = await requisitionService.create(data, mockContractor);
    
    expect(result).toBeDefined();
    expect(result.status).toBe('draft');
    expect(result.items[0].totalPrice).toBe(500); // 1m2 * $100 * 5
  });

  it('should fail if non-contractor tries to create requisition', async () => {
    const manufacturer = { ...mockContractor, organizationData: { type: 'Manufacturer' } };
    await expect(requisitionService.create({}, manufacturer)).rejects.toThrow('Only contractors can create requisitions');
  });

  it('should progress status from draft to sent', async () => {
    const reqId = new ObjectId();
    await db.collection('requisitions').insertOne({
      _id: reqId,
      contractorId: mockContractor.organizationId,
      status: 'draft'
    });

    const result = await requisitionService.send(reqId.toString(), mockContractor);
    expect(result.status).toBe('sent');
    expect(result.statusHistory).toContainEqual(expect.objectContaining({ status: 'sent' }));
  });
});