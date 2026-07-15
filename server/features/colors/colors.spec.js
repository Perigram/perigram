import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as colorService from './service.js';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

describe('Color Management', () => {
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
    await db.collection('colors').deleteMany({});
  });

  const organizationId = new ObjectId();
  const permissions = {
    memberships: [{ organizationId, permissions: { catalogs: 'admin' } }]
  };

  it('lists only colors from permitted organization lineage', async () => {
    const otherOrganizationId = new ObjectId();
    await db.collection('colors').insertMany([
      {
        _id: new ObjectId(),
        identity: { uid: 'own-color', name: 'Own Color' },
        lineage: {
          organization: { entityType: 'organization', entityId: organizationId.toString() },
          catalog: { entityType: 'catalog', entityId: new ObjectId().toString() }
        }
      },
      {
        _id: new ObjectId(),
        identity: { uid: 'other-color', name: 'Other Color' },
        lineage: {
          organization: { entityType: 'organization', entityId: otherOrganizationId.toString() },
          catalog: { entityType: 'catalog', entityId: new ObjectId().toString() }
        }
      }
    ]);

    const result = await colorService.list('user1', organizationId, null, permissions);

    expect(result.map(item => item.identity.name)).toEqual(['Own Color']);
  });

  it('allows warehouse stock fallback color creation with materials write permission', async () => {
    const catalogId = new ObjectId();
    await db.collection('catalogs').insertOne({
      _id: catalogId,
      identity: { uid: 'manual-catalog', name: 'Manual Catalog' },
      lineage: { organization: { entityType: 'organization', entityId: organizationId.toString() } }
    });

    const result = await colorService.create({
      source: 'WAREHOUSE_STOCK',
      catalogId: catalogId.toString(),
      name: 'Manual RAL',
      code: 'Manual RAL'
    }, 'user1', organizationId, null, {
      memberships: [{ organizationId, permissions: { materials: 'write', catalogs: 'none' } }]
    });

    expect(result.identity.name).toBe('Manual RAL');
  });
});
