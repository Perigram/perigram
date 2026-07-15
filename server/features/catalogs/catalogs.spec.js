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
    }, mockUser.userId, mockUser.organizationId, null, mockUser.permissions);

    const dto = catalog.toJSON();
    expect(dto.identity.name).toBe('Standard Aluminum Composite');
    expect(dto).not.toHaveProperty('name');
    expect(catalog.data.options.foilThicknesses).toContain(0.3);
    expect(catalog.data.options.sheetThicknesses).toContain(4);
  });

  it('should enforce manufacturer ownership when removing catalog', async () => {
    const otherManufacturerId = new ObjectId();
    const catalogId = new ObjectId();
    await db.collection('catalogs').insertOne({
      _id: catalogId,
      identity: { uid: catalogId, name: 'Other Brand' },
      lineage: { organization: { entityType: 'organization', entityId: otherManufacturerId.toString() } }
    });

    await expect(catalogService.remove(catalogId.toString(), mockUser.userId, mockUser.organizationId, null, mockUser.permissions))
      .rejects.toThrow(/Permission denied/);
  });

  it('should require an explicit view_all action to list catalogs across organizations', async () => {
    const otherManufacturerId = new ObjectId();
    await db.collection('catalogs').insertMany([
      {
        _id: new ObjectId(),
        identity: { uid: 'own-catalog', name: 'Own Catalog' },
        lineage: { organization: { entityType: 'organization', entityId: mockUser.organizationId.toString() } }
      },
      {
        _id: new ObjectId(),
        identity: { uid: 'other-catalog', name: 'Other Catalog' },
        lineage: { organization: { entityType: 'organization', entityId: otherManufacturerId.toString() } }
      }
    ]);

    const ownOnly = await catalogService.list(mockUser.userId, mockUser.organizationId, null, {
      permissions: { catalogs: 'admin' },
      memberships: [{ organizationId: mockUser.organizationId, permissions: { catalogs: 'admin' } }]
    });
    expect(ownOnly.map(item => item.identity.name)).toEqual(['Own Catalog']);

    const viewAll = await catalogService.list(mockUser.userId, mockUser.organizationId, null, {
      permissions: { catalogs: { level: 'read', actions: { view_all: true } } },
      memberships: [{ organizationId: mockUser.organizationId, permissions: { catalogs: { level: 'read', actions: { view_all: true } } } }]
    });
    expect(viewAll.map(item => item.identity.name).sort()).toEqual(['Other Catalog', 'Own Catalog']);
  });

  it('should allow warehouse stock fallback catalog creation with materials write permission', async () => {
    const catalog = await catalogService.create({
      source: 'WAREHOUSE_STOCK',
      name: 'Manual ACM',
      manufacturerId: mockUser.organizationId.toString(),
      material: 'Manual ACM',
      options: { widths: [3000], lengths: [1500] }
    }, mockUser.userId, mockUser.organizationId, null, {
      memberships: [{ organizationId: mockUser.organizationId, permissions: { materials: 'write', catalogs: 'none' } }]
    });

    expect(catalog.identity.name).toBe('Manual ACM');
  });
});
