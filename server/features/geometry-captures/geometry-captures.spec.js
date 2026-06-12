import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as geometryCaptureService from './service.js';
import { listTaskRuns } from '../../core/tasks/service.js';

describe('Geometry captures service', () => {
  let con;
  let mongoServer;
  let db;
  let auth;
  let organizationId;
  let warehouseId;

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
    await Promise.all([
      db.collection('geometry_captures').deleteMany({}),
      db.collection('remnants').deleteMany({}),
      db.collection('warehouses').deleteMany({}),
      db.collection('status_events').deleteMany({})
    ]);

    organizationId = new ObjectId();
    warehouseId = new ObjectId();
    auth = {
      userId: 'user-capture',
      organizationId,
      role: 'member',
      memberships: [{
        organizationId,
        permissions: {
          materials: 'admin',
          warehouses: 'admin',
          projects: 'admin'
        }
      }]
    };

    await db.collection('warehouses').insertOne({
      _id: warehouseId,
      identity: { uid: warehouseId.toString(), name: 'Capture Warehouse' },
      lineage: { organizationId },
      status: { state: 'ACTIVE' },
      data: { stats: { totalRemnants: 0 } }
    });
  });

  it('queues extraction, applies worker geometry, and confirms a remnant', async () => {
    const capture = await geometryCaptureService.create({
      mode: 'REMNANT',
      warehouseId: warehouseId.toString(),
      fileId: new ObjectId().toString(),
      fileName: 'remnant.jpg',
      calibration: { mode: 'knownDimension', knownWidth: 1000 }
    }, auth.userId, auth.organizationId, auth.role, auth);

    expect(capture.status.state).toBe('PROCESSING');
    expect(capture.data.extraction.taskRunId).toBeTruthy();
    const taskRuns = await listTaskRuns({ taskId: 'vision.extractGeometry' });
    expect(taskRuns).toHaveLength(1);

    const ready = await geometryCaptureService.applyExtractionResult(capture._id, {
      ok: true,
      geometry: {
        polygon: {
          outer: [[0, 0], [1000, 0], [1000, 500], [0, 500]],
          inner: [[[200, 100], [400, 100], [400, 250], [200, 250]]]
        }
      },
      calibration: { mode: 'knownDimension', knownWidth: 1000 },
      confidence: 0.86,
      diagnostics: ['outer_vertices:4', 'holes:1']
    });

    expect(ready.status.state).toBe('READY');
    expect(ready.data.geometry.polygon.outer.at(-1)).toEqual([0, 0]);
    expect(ready.data.geometry.polygon.inner[0].at(-1)).toEqual([200, 100]);
    expect(ready.specs.area).toBe(0.47);

    const confirmed = await geometryCaptureService.confirm(capture._id, auth.userId, auth.organizationId, auth.role, auth);

    expect(confirmed.status.state).toBe('COMPLETE');
    expect(confirmed.data.output.entityType).toBe('remnant');
    const remnant = await db.collection('remnants').findOne({});
    expect(remnant.data.source.geometryCaptureId).toBe(capture._id.toString());
    expect(remnant.data.geometry.data.polygon.inner).toHaveLength(1);
    const warehouse = await db.collection('warehouses').findOne({ _id: warehouseId });
    expect(warehouse.data.stats.totalRemnants).toBe(1);
  });
});
