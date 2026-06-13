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
      calibration: { mode: 'knownDimension', knownWidth: 1000, materialId: 'mat-1', material: 'ACP' },
      prompt: { outer: [[0.1, 0.1], [0.9, 0.12], [0.88, 0.8], [0.12, 0.82]] }
    }, auth.userId, auth.organizationId, auth.role, auth);

    expect(capture.status.state).toBe('PROCESSING');
    expect(capture.data.extraction.taskRunId).toBeTruthy();
    expect(capture.data.revisions).toHaveLength(1);
    expect(capture.data.revisions[0].preset).toBe('remnant_auto');
    const taskRuns = await listTaskRuns({ taskId: 'vision.extractGeometry' });
    expect(taskRuns).toHaveLength(1);
    expect(taskRuns[0].input.parameters.revisionId).toBe(capture.data.revisions[0].id);
    expect(taskRuns[0].input.parameters.prompt.outer).toHaveLength(4);
    expect(capture.data.revisions[0].prompt.outer).toHaveLength(4);

    const ready = await geometryCaptureService.applyExtractionResult(capture._id, {
      ok: true,
      revisionId: capture.data.revisions[0].id,
      preset: 'remnant_auto',
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
    expect(ready.data.activeRevisionId).toBe(capture.data.revisions[0].id);
    expect(ready.data.revisions[0].status).toBe('READY');
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

  it('recalculates into revisions without deleting the active geometry', async () => {
    const capture = await geometryCaptureService.create({
      mode: 'REMNANT',
      warehouseId: warehouseId.toString(),
      fileId: new ObjectId().toString(),
      fileName: 'remnant.jpg',
      preset: 'remnant_dark_on_light',
      calibration: { mode: 'knownDimension', knownWidth: 1000 }
    }, auth.userId, auth.organizationId, auth.role, auth);
    const firstRevisionId = capture.data.revisions[0].id;

    const ready = await geometryCaptureService.applyExtractionResult(capture._id, {
      ok: true,
      revisionId: firstRevisionId,
      preset: 'remnant_dark_on_light',
      geometry: { polygon: { outer: [[0, 0], [1000, 0], [1000, 500], [0, 500]] } },
      calibration: { mode: 'knownDimension', knownWidth: 1000 },
      confidence: 0.8,
      diagnostics: ['candidate:initial']
    });
    expect(ready.data.activeRevisionId).toBe(firstRevisionId);

    const recalculating = await geometryCaptureService.recalculate(capture._id, {
      preset: 'remnant_light_on_dark'
    }, auth.userId, auth.organizationId, auth.role, auth);
    const secondRevision = recalculating.data.revisions.find(revision => revision.id !== firstRevisionId);
    expect(recalculating.status.state).toBe('PROCESSING');
    expect(recalculating.data.geometry.polygon.outer).toHaveLength(5);
    expect(secondRevision.status).toBe('QUEUED');
    expect(secondRevision.preset).toBe('remnant_light_on_dark');

    const failed = await geometryCaptureService.applyExtractionResult(capture._id, {
      ok: false,
      revisionId: secondRevision.id,
      preset: 'remnant_light_on_dark',
      error: 'No usable contour detected',
      diagnostics: ['candidate:none']
    });
    expect(failed.status.state).toBe('READY');
    expect(failed.data.activeRevisionId).toBe(firstRevisionId);
    expect(failed.data.geometry.polygon.outer).toHaveLength(5);
    expect(failed.data.revisions.find(revision => revision.id === secondRevision.id).status).toBe('FAILED');

    const third = await geometryCaptureService.recalculate(capture._id, {
      preset: 'remnant_sheet_remainder'
    }, auth.userId, auth.organizationId, auth.role, auth);
    const thirdRevision = third.data.revisions.find(revision => revision.status === 'QUEUED' && revision.id !== secondRevision.id);
    await geometryCaptureService.applyExtractionResult(capture._id, {
      ok: true,
      revisionId: thirdRevision.id,
      preset: 'remnant_sheet_remainder',
      geometry: { polygon: { outer: [[0, 0], [900, 0], [900, 400], [0, 400]] } },
      calibration: { mode: 'knownDimension', knownWidth: 900 },
      confidence: 0.9,
      diagnostics: ['candidate:third']
    });

    const activated = await geometryCaptureService.activateRevision(capture._id, firstRevisionId, auth.userId, auth.organizationId, auth.role, auth);
    expect(activated.data.activeRevisionId).toBe(firstRevisionId);
    expect(activated.specs.width).toBe(1000);
  });

  it('stores manual geometry edits as active ready revisions', async () => {
    const capture = await geometryCaptureService.create({
      mode: 'REMNANT',
      warehouseId: warehouseId.toString(),
      fileId: new ObjectId().toString(),
      fileName: 'remnant.jpg',
      calibration: { mode: 'knownDimension', knownWidth: 1000 }
    }, auth.userId, auth.organizationId, auth.role, auth);

    await geometryCaptureService.applyExtractionResult(capture._id, {
      ok: true,
      revisionId: capture.data.revisions[0].id,
      preset: 'remnant_auto',
      geometry: { polygon: { outer: [[0, 0], [1000, 0], [1000, 500], [0, 500]] } },
      calibration: {
        mode: 'knownDimension',
        knownWidth: 1000,
        scale: {
          pixelBounds: { min_x: 10, min_y: 20, width: 400, height: 200 },
          scaleX: 2.5,
          scaleY: 2.5
        }
      },
      confidence: 0.8,
      diagnostics: ['candidate:initial']
    });

    const edited = await geometryCaptureService.createManualRevision(capture._id, {
      geometry: { polygon: { outer: [[0, 0], [800, 0], [800, 400], [0, 400]], inner: [] } },
      calibration: { mode: 'knownDimension', knownWidth: 800 },
      reason: 'test'
    }, auth.userId, auth.organizationId, auth.role, auth);

    const manual = edited.data.revisions.find(revision => revision.preset === 'manual_edit');
    expect(edited.status.state).toBe('READY');
    expect(edited.data.activeRevisionId).toBe(manual.id);
    expect(manual.status).toBe('READY');
    expect(manual.geometry.preview.layers[0].paths[0]).toContain('800');
    expect(edited.specs.width).toBe(800);
    expect(edited.specs.area).toBe(0.32);
  });
});
