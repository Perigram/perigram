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

vi.mock('~/server/utils/permissions', () => ({
  checkEntityAccess: vi.fn((user, entity, ownerId) => user.organizationId.toString() === ownerId.toString())
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
    role: 'ManufacturerAdmin'
  };

  it('should create a catalog with material constraints', async () => {
    const catalog = await catalogService.create({
      name: 'Standard Aluminum Composite',
      manufacturerId: mockUser.organizationId.toString(),
      foilThicknessOptions: [0.3, 0.5],
      sheetThicknessOptions: [3, 4],
      widthOptions: [1220, 1500]
    }, mockUser);

    expect(catalog.name).toBe('Standard Aluminum Composite');
    expect(catalog.foilThicknessOptions).toContain(0.3);
    expect(catalog.sheetThicknessOptions).toContain(4);
  });

  it('should enforce manufacturer ownership when removing catalog', async () => {
    const otherManufacturerId = new ObjectId();
    const catalogId = new ObjectId();
    await db.collection('catalogs').insertOne({
      _id: catalogId,
      name: 'Other Brand',
      manufacturerId: otherManufacturerId
    });

    await expect(catalogService.remove(catalogId.toString(), mockUser))
      .rejects.toThrow(/Cannot delete catalog from other manufacturer/);
  });
});
