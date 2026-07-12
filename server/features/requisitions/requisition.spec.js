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
      data: { pricing: { pricePerSqm: 100 } }
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

    const result = await requisitionService.create(data, mockContractor.userId, mockContractor.organizationId, null, mockContractor.permissions);
    
    expect(result).toBeDefined();
    expect(result.status.state.primary).toBe('DRAFT');
    expect(result.data.items[0].priceSnapshot).toBe(100);
    expect(result).not.toHaveProperty('items');
  });

  it('should fail if requisition creation action is denied', async () => {
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
      data: { pricing: { pricePerSqm: 100 } }
    });

    const deniedPermissions = {
      memberships: [{
        organizationId: mockContractor.organizationId,
        permissions: {
          requisitions: { level: 'admin', actions: { create: false } },
          materials: 'admin'
        }
      }]
    };

    await expect(requisitionService.create({
      manufacturerId: mockManufacturerId.toString(),
      items: [{
        catalogId: catalogId.toString(),
        colorId: colorId.toString(),
        sheetThickness: 3,
        width: 1000,
        length: 1000,
        quantity: 5
      }]
    }, mockContractor.userId, mockContractor.organizationId, null, deniedPermissions))
      .rejects.toThrow('Permission denied');
  });

  it('should list requisitions for string organization ids without ObjectId conversion errors', async () => {
    await db.collection('requisitions').insertMany([
      {
        identity: { uid: 'req-a', name: 'REQ-A' },
        lineage: { organizationId: 'org-alpha', manufacturerId: 'org-beta' },
        status: { state: { primary: 'DRAFT' } },
        data: {}
      },
      {
        identity: { uid: 'req-b', name: 'REQ-B' },
        lineage: { organizationId: new ObjectId(), manufacturerId: 'org-alpha' },
        status: { state: { primary: 'SENT' } },
        data: {}
      }
    ]);

    const results = await requisitionService.list('user-alpha', 'org-alpha', null, {
      memberships: [{ organizationId: 'org-alpha', permissions: { requisitions: 'admin' } }]
    });

    expect(results).toHaveLength(2);
    expect(results.map(item => item.identity.name)).toEqual(['REQ-A', 'REQ-B']);
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

    const result = await requisitionService.send(reqId.toString(), mockContractor.userId, mockContractor.organizationId, null, mockContractor.permissions);
    expect(result.state.primary).toBe('SENT');
  });
});
