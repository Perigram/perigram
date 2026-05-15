import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as catalogService from './service';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

describe('Catalog Management', () => {
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
    await db.collection('catalogs').deleteMany({});
  });

  const mockUser = {
    userId: 'user1',
    organizationId: new ObjectId(),
    organizationData: { type: 'Manufacturer' },
    role: 'ManufacturerAdmin',
    permissions: null
  };

  mockUser.permissions = {
    memberships: [{ organizationId: mockUser.organizationId, permissions: { catalogs: 'admin' } }]
  };

  it('should create a catalog with material constraints', async () => {
    const catalog = await catalogService.create({
      name: 'Standard Aluminum Composite',
      manufacturerId: mockUser.organizationId.toString(),
      material: 'Aluminum Composite',
      options: {
        foilThicknesses: [0.3, 0.5],
        sheetThicknesses: [3, 4],
        widths: [1220, 1500]
      }
    }, mockUser.userId, mockUser.organizationId, mockUser.role, mockUser.permissions);

    expect(catalog.name).toBe('Standard Aluminum Composite');
    expect(catalog.data.options.foilThicknesses).toContain(0.3);
    expect(catalog.data.options.sheetThicknesses).toContain(4);
  });

  it('should enforce manufacturer ownership when removing catalog', async () => {
    const otherManufacturerId = new ObjectId();
    const catalogId = new ObjectId();
    await db.collection('catalogs').insertOne({
      _id: catalogId,
      identity: { uid: catalogId, name: 'Other Brand' },
      lineage: { organizationId: otherManufacturerId }
    });

    await expect(catalogService.remove(catalogId.toString(), mockUser.userId, mockUser.organizationId, mockUser.role, mockUser.permissions))
      .rejects.toThrow(/Permission denied/);
  });
});
