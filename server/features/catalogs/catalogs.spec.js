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

vi.mock('~/server/utils/auth-helpers', () => ({
  hasPermission: vi.fn(() => true)
}));

describe('Catalog & Sheet Type Management', () => {
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
    role: 'ManufacturerAdmin'
  };

  it('should create a catalog and add sheet types', async () => {
    const catalog = await catalogService.create({
      name: 'Standard Aluminum',
      manufacturerId: mockUser.organizationId.toString()
    }, mockUser);

    expect(catalog.name).toBe('Standard Aluminum');

    const sheetTypeData = {
      material: 'Aluminum',
      color: 'RAL 9006',
      thickness: 4,
      sizes: [{ width: 1500, height: 4000, pricePerSqm: 50 }]
    };

    const updated = await catalogService.addSheetType(catalog._id.toString(), sheetTypeData, mockUser);
    expect(updated.sheetTypes).toHaveLength(1);
    expect(updated.sheetTypes[0].material).toBe('Aluminum');
  });

  it('should enforce manufacturer ownership when modifying catalog', async () => {
    const otherManufacturerId = new ObjectId();
    const catalogId = new ObjectId();
    await db.collection('catalogs').insertOne({
      _id: catalogId,
      name: 'Other Brand',
      manufacturerId: otherManufacturerId
    });

    await expect(catalogService.addSheetType(catalogId.toString(), {}, mockUser))
      .rejects.toThrow(/Cannot modify catalog from other manufacturer/);
  });
});