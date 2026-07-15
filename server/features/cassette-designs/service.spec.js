import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));
vi.mock('../../db/mongo.js', () => ({ connectDB: mockedConnectDB }));
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as cassetteDesignsService from './service.js';

describe('cassette design DXF export', () => {
  let connection;
  let mongoServer;
  let db;
  let organizationId;
  let auth;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    connection = await MongoClient.connect(mongoServer.getUri());
    db = connection.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (connection) await connection.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('cassette_designs').deleteMany({});
    organizationId = new ObjectId();
    auth = {
      memberships: [{ organizationId, permissions: { cassette_designs: 'read' } }]
    };
  });

  it('regenerates a layered DXF from design layerData before falling back to stored DXF', async () => {
    await db.collection('cassette_designs').insertOne(cassetteDesign({
      _id: 'design-1',
      organizationId,
      layerData: [
        {
          layer: 'cut.outer',
          coordinates: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]
        },
        {
          layer: 'fold.route',
          coordinates: [[0, 25], [100, 25]]
        }
      ],
      dxfId: new ObjectId()
    }));

    const dxf = await cassetteDesignsService.exportDxf('design-1', 'user-1', null, auth);

    expect(dxf).toContain('cut.outer');
    expect(dxf).toContain('fold.route');
    expect(dxf).toContain('LWPOLYLINE');
  });

  it('resolves a template id to its base design for export', async () => {
    const templateId = new ObjectId();
    await db.collection('cassette_designs').insertOne(cassetteDesign({
      _id: 'design-for-template',
      organizationId,
      templateId,
      layerData: [
        {
          layer: 'code.cassette_mark',
          geometry: {
            type: 'text',
            point: [10, 12],
            text: 'Base design'
          }
        }
      ]
    }));

    const dxf = await cassetteDesignsService.exportDxf(templateId.toString(), 'user-1', null, auth);

    expect(dxf).toContain('code.cassette_mark');
    expect(dxf).toContain('Base design');
  });

  it('can export older records that only have stored preview layers', async () => {
    await db.collection('cassette_designs').insertOne(cassetteDesign({
      _id: 'preview-only-design',
      organizationId,
      layerData: []
    }, {
      preview: {
        layers: [
          {
            name: 'folds',
            standardCode: 'fold.route',
            paths: ['M 0 25 L 100 25']
          }
        ]
      }
    }));

    const dxf = await cassetteDesignsService.exportDxf('preview-only-design', 'user-1', null, auth);

    expect(dxf).toContain('fold.route');
    expect(dxf).toContain('LWPOLYLINE');
  });

  it('lists and reads designs through status-scoped process grants', async () => {
    const processOrgId = 'org-process';
    await db.collection('cassette_designs').insertMany([
      cassetteDesign({ _id: 'received-design', organizationId: processOrgId, status: 'RECEIVED' }),
      cassetteDesign({ _id: 'draft-design', organizationId: processOrgId, status: 'DRAFT' })
    ]);
    const processAuth = {
      userId: 'installer',
      organizationId: processOrgId,
      memberships: [{ organizationId: processOrgId, permissions: {} }],
      effectivePermissions: {
        cassette_designs: [{
          level: 'write',
          rule: { fact: 'primaryStatus', equals: 'RECEIVED' }
        }]
      }
    };
    await expect(db.collection('cassette_designs').find({
      'lineage.organizationId': processOrgId,
      'status.state.primary': { $in: ['RECEIVED', 'DRAFT'] }
    }).toArray()).resolves.toHaveLength(2);

    const listed = await cassetteDesignsService.list(
      'installer',
      organizationId,
      null,
      processAuth,
      { primaryStatuses: 'RECEIVED,DRAFT' }
    );

    expect(listed.map(item => item._id)).toEqual(['received-design']);
    await expect(cassetteDesignsService.getById('received-design', 'installer', null, processAuth))
      .resolves.toMatchObject({ _id: 'received-design' });
    await expect(cassetteDesignsService.getById('draft-design', 'installer', null, processAuth))
      .rejects.toThrow(/Permission denied/);
  });
});

function cassetteDesign({ _id, organizationId, templateId = new ObjectId(), layerData = [], dxfId = null, status = 'ACTIVE' }, geometryOverrides = {}) {
  return {
    _id,
    identity: { uid: _id, name: _id, slug: _id },
    lineage: { organizationId },
    provenance: {
      derivedFrom: {
        source: { type: 'cassette', id: templateId.toString(), revisionId: 'revision-1' }
      }
    },
    status: {
      state: {
        schemaVersion: 2,
        primary: status,
        active: { main: status },
        regions: { main: { state: status, path: [status] } }
      }
    },
    data: {
      layerData,
      polygonParts: [],
      geometry: {
        data: {
          layerData,
          polygonParts: []
        },
        dxfId,
        ...geometryOverrides
      },
      parameters: {}
    }
  };
}
