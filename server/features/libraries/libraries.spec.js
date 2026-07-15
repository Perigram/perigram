import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as libraryService from './service';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

describe('Library Management', () => {
  let con;
  let mongoServer;
  let db;
  const organizationId = new ObjectId();

  const auth = {
    userId: 'user-library-admin',
    organizationId,
    permissions: {
      memberships: [{ organizationId, permissions: { libraries: 'admin' } }]
    }
  };

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
    await db.collection('libraries').deleteMany({});
  });

  it('creates a material-scoped cassette library', async () => {
    const library = await libraryService.create({
      name: 'ACP library',
      material: { code: 'ACP', name: 'Aluminum Composite Panel' },
      description: 'Reusable ACP cassette templates'
    }, auth.userId, auth.organizationId, null, auth.permissions);

    expect(library.identity.name).toBe('ACP library');
    expect(library.data.material).toEqual({ code: 'ACP', name: 'Aluminum Composite Panel' });
    expect(library.data.description).toBe('Reusable ACP cassette templates');
    expect(library.summary.cassetteCount).toBe(0);
    expect(library.lineage.organizationId.toString()).toBe(organizationId.toString());
  });

  it('filters libraries by organization access', async () => {
    const own = await libraryService.create({ name: 'Own library' }, auth.userId, auth.organizationId, null, auth.permissions);
    await db.collection('libraries').insertOne({
      _id: new ObjectId(),
      identity: { name: 'Other library' },
      lineage: { organizationId: new ObjectId() },
      status: { state: { primary: 'ACTIVE' } },
      data: {},
      summary: {}
    });

    const libraries = await libraryService.list(auth.userId, auth.organizationId, null, auth.permissions);

    expect(libraries.map(item => item._id.toString())).toEqual([own._id.toString()]);
  });
});
