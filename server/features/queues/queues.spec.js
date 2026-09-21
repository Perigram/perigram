import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as queueService from './service';
import * as nestingRunsService from '../nesting-runs/service';
import * as cassetteInstancesService from '../cassette-instances/service';
import { createTransitionAuth, statusService } from '../../core/machines/service.js';
import { normalizeStatusState } from '../../core/blocks/index.js';

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

function statusFixture(state, extra = {}) {
  return { state: normalizeStatusState(state), ...extra };
}

async function insertRunSheetTwins(db, { organizationId, queueId, runId, count, sheetDesignId = null }) {
  const sheets = Array.from({ length: count }, (_, index) => ({
    _id: `${runId}-sheet-${index + 1}`,
    identity: { uid: `${runId}-sheet-${index + 1}`, name: `Sheet ${index + 1}` },
    lineage: {
      organizationId,
      queueId,
      runId,
      ...(sheetDesignId ? { sheetDesignId } : {})
    },
    status: statusFixture('AVAILABLE'),
    specs: { width: 3000, length: 1500 },
    data: { sheetIndex: index }
  }));
  if (sheets.length) await db.collection('sheets').insertMany(sheets);
}

describe('Production Queues & Nesting Status', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('queues').deleteMany({});
    await db.collection('projects').deleteMany({});
    await db.collection('nesting_runs').deleteMany({});
    await db.collection('material_piles').deleteMany({});
    await db.collection('warehouses').deleteMany({});
    await db.collection('sheets').deleteMany({});
    await db.collection('remnants').deleteMany({});
    await db.collection('cassette_instances').deleteMany({});
    await db.collection('sheet_designs').deleteMany({});
    await db.collection('status_events').deleteMany({});
  });

  const mockUser = {
    userId: 'user1',
    organizationId: new ObjectId(),
    permissions: null
  };

  mockUser.permissions = {
    memberships: [{ organizationId: mockUser.organizationId, permissions: { queues: 'admin', projects: 'admin' } }]
  };

  it('should create a queue and update project queue count', async () => {
    const projectId = 'test-project';
    await db.collection('projects').insertOne({ 
      _id: projectId,
      identity: { uid: projectId, name: 'Test Project' },
      lineage: { organizationId: mockUser.organizationId },
      summary: { queueCount: 0 }
    });

    const data = { 
      name: 'Morning Shift Run',
      projectId,
      job: { items: [{ entryId: 'E1', id: new ObjectId().toString(), typeId: 'cassette_design', quantity: 10 }] }
    };
    const result = await queueService.create(data, mockUser.userId, mockUser.organizationId, null, mockUser.permissions);

    expect(result.identity.name).toBe('Morning Shift Run');
    expect(result).not.toHaveProperty('name');
    expect(result.status.state.primary).toBe('DRAFT');
    expect(result.lineage.projectId).toBe(projectId);
  });

  it('creates an organization-root queue when project id is not provided', async () => {
    const result = await queueService.create({
      name: 'Root production run',
      job: { items: [] }
    }, mockUser.userId, mockUser.organizationId, null, mockUser.permissions);

    expect(result.identity.name).toBe('Root production run');
    expect(result.status.state.primary).toBe('DRAFT');
    expect(result.lineage.organizationId).toBe(mockUser.organizationId);
    expect(result.lineage.projectId).toBeUndefined();
    expect(result.data.queueNumber).toBe(1);
  });

  it('reads queue cassette designs from canonical relations', () => {
    expect(queueService.queueCassetteDesignRefs({
      relations: { cassettes: [{ type: 'cassette_design', id: 'design-1' }] }
    })).toEqual([{ type: 'cassette_design', id: 'design-1', quantity: 1 }]);
    expect(queueService.queueCassetteDesignRefs({
      relations: { cassettes: [{ type: 'cassette_design', id: 'design-1' }] },
      data: { job: { items: [{ type: 'cassette_design', id: 'design-1', quantity: 7 }] } }
    })).toEqual([{ type: 'cassette_design', id: 'design-1', quantity: 7 }]);
    expect(queueService.queueCassetteDesignRefs({ data: { job: { items: [{ id: 'old' }] } } })).toEqual([]);
  });

  it('stores only canonical nesting settings without mutating related designs', async () => {
    const queueId = new ObjectId();
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId.toString(), name: 'Settings queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('DRAFT', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      relations: { cassettes: [{ type: 'cassette_design', id: 'design-1' }] },
      data: {
        job: { materialPool: [] },
        nestingParams: {
          materialMode: 'VIRTUAL',
          virtualWidth: 1000,
          virtualLength: 500
        }
      }
    });

    const result = await queueService.update(queueId.toString(), {
      nestingSettings: {
        materialMode: 'VIRTUAL',
        machineId: 'machine-1',
        virtualWidth: 2500,
        virtualLength: 1250,
        virtualThickness: 2,
        toolProfileId: 'tool-1',
        requestedArtifacts: ['LAYOUT_DXF']
      }
    }, mockUser.userId, mockUser.organizationId, null, mockUser.permissions);
    const raw = await db.collection('queues').findOne({ _id: queueId });

    expect(result.data.nestingSettings).toMatchObject({
      materialMode: 'VIRTUAL',
      machineId: 'machine-1',
      virtualWidth: 2500,
      virtualLength: 1250,
      virtualThickness: 2,
      toolProfileId: 'tool-1',
      requestedArtifacts: ['LAYOUT_DXF']
    });
    expect(result.relations.cassettes).toEqual([{ type: 'cassette_design', id: 'design-1' }]);
    expect(result.data.nestingParams).toBeUndefined();
    expect(raw.data.nestingSettings).toBeDefined();
    expect(raw.data.nestingParams).toBeUndefined();
  });

  it('builds nesting command parameters from queue-local settings and material pool', () => {
    const materialPool = [{ type: 'PILE', id: 'pile-1', dimensions: { width: 3000, length: 1500 }, available: 2 }];
    const parameters = queueService.buildNestingCommandParameters({
      data: {
        job: { materialPool },
        nestingSettings: {
          materialMode: 'WAREHOUSE',
          machineId: 'machine-1',
          virtualWidth: 2400,
          virtualLength: 1200,
          virtualThickness: 2,
          inventoryItems: ['pile_1'],
          toolProfileId: 'tool-1'
        }
      }
    });

    expect(parameters).toEqual({
      materialMode: 'WAREHOUSE',
      machineId: 'machine-1',
      virtualWidth: 2400,
      virtualLength: 1200,
      virtualThickness: 2,
      inventoryItems: ['pile_1'],
      materialPool,
      toolProfileId: 'tool-1'
    });
  });

  it('should require material assignment before choosing a production run', async () => {
    const queueId = new ObjectId();
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Ready queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('NESTING', { userId: mockUser.userId, timestamp: new Date(), metadata: {} })
    });

    await db.collection('nesting_runs').insertOne({
      _id: 'run-no-material',
      lineage: { organizationId: mockUser.organizationId, queueId: queueId.toString() },
      status: statusFixture('COMPLETE'),
      data: { results: { sheetCount: 1 } }
    });

    await expect(nestingRunsService.chooseRun(queueId.toString(), 'run-no-material', mockUser.userId, mockUser.organizationId, null, mockUser.permissions))
      .rejects.toThrow(/Material assignment is required/);
  });

  it('should consume selected pile stock when choosing a production run', async () => {
    const queueId = new ObjectId();
    const pileId = 'pile-cut-1';
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Warehouse queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('NESTING', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: {
        job: {
          materialPool: [{
            type: 'PILE',
            id: pileId,
            warehouseId: 'warehouse-cut-1',
            available: 5,
            dimensions: { width: 3000, length: 1500 }
          }]
        }
      }
    });
    await db.collection('nesting_runs').insertOne({
      _id: 'run-cut-1',
      lineage: { organizationId: mockUser.organizationId, queueId: queueId.toString() },
      status: statusFixture('COMPLETE'),
      data: {
        results: { sheetCount: 3 },
        materialPool: [{
          type: 'PILE',
          id: pileId,
          warehouseId: 'warehouse-cut-1',
          available: 5,
          dimensions: { width: 3000, length: 1500 }
        }]
      }
    });
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Cut Pile' },
      data: { stock: { total: 5, used: 0 } }
    });
    await insertRunSheetTwins(db, {
      organizationId: mockUser.organizationId,
      queueId,
      runId: 'run-cut-1',
      count: 3
    });

    const result = await nestingRunsService.chooseRun(queueId.toString(), 'run-cut-1', mockUser.userId, mockUser.organizationId, null, mockUser.permissions);
    const pile = await db.collection('material_piles').findOne({ _id: pileId });

    expect(result.run.status.state.primary).toBe('CHOSEN');
    expect(result.queue.status.state.primary).toBe('READY');
    expect(result.queue.data.materialConsumption.sources).toMatchObject([{ type: 'PILE', id: pileId, count: 3 }]);
    expect(result.queue.data.physicalOutputs.sheetIds).toEqual([
      'run-cut-1-sheet-1',
      'run-cut-1-sheet-2',
      'run-cut-1-sheet-3'
    ]);
    expect(result.queue.data.physicalOutputs.sourceSheets).toHaveLength(3);
    expect(pile.data.stock.used).toBe(3);
    expect(pile.data.stockMovements[0]).toMatchObject({
      type: 'ALLOCATION',
      quantity: -3,
      queueId: queueId.toString(),
      runId: 'run-cut-1'
    });
  });

  it('should choose a production run through the generic status transition', async () => {
    const queueId = new ObjectId();
    const pileId = 'pile-status-choice';
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Status choice queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('NESTING', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: {
        job: {
          materialPool: [{
            type: 'PILE',
            id: pileId,
            available: 4,
            dimensions: { width: 3000, length: 1500 }
          }]
        }
      }
    });
    await db.collection('nesting_runs').insertMany([
      {
        _id: 'run-status-previous',
        lineage: { organizationId: mockUser.organizationId, queueId: queueId.toString() },
        status: statusFixture('CHOSEN'),
        data: { results: { sheetCount: 1 }, materialPool: [{ type: 'PILE', id: pileId }] }
      },
      {
        _id: 'run-status-choice',
        lineage: { organizationId: mockUser.organizationId, queueId: queueId.toString() },
        status: statusFixture('COMPLETE'),
        data: {
          results: { sheetCount: 2 },
          materialPool: [{
            type: 'PILE',
            id: pileId,
            available: 4,
            dimensions: { width: 3000, length: 1500 }
          }]
        }
      }
    ]);
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Status Choice Pile' },
      data: { stock: { total: 4, used: 0 } }
    });
    await insertRunSheetTwins(db, {
      organizationId: mockUser.organizationId,
      queueId,
      runId: 'run-status-choice',
      count: 2
    });

    const result = await statusService.transitionWithResult({
      typeId: 'nesting_run',
      targetId: 'run-status-choice',
      targetState: 'CHOSEN',
      auth: createTransitionAuth(mockUser.userId, null, mockUser.permissions),
      context: { metadata: { note: 'Chosen from status control' } }
    });

    const pile = await db.collection('material_piles').findOne({ _id: pileId });
    const queue = await db.collection('queues').findOne({ _id: queueId });
    const previousRun = await db.collection('nesting_runs').findOne({ _id: 'run-status-previous' });

    expect(result.entity.status.state.primary).toBe('CHOSEN');
    expect(result.effects.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'queue', id: queueId.toString() })
    ]));
    expect(previousRun.status.state.primary).toBe('COMPLETE');
    expect(queue.status.state.primary).toBe('READY');
    expect(queue.data.materialConsumption.sources).toMatchObject([{ type: 'PILE', id: pileId, count: 2 }]);
    expect(pile.data.stock.used).toBe(2);
  });

  it('does not gate organization-authored run transitions on a hardcoded queue status', async () => {
    const queueId = new ObjectId();
    const pileId = 'pile-status-action-preflight';
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Draft action queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('DRAFT', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: {
        job: {
          materialPool: [{
            type: 'PILE',
            id: pileId,
            available: 2,
            dimensions: { width: 3000, length: 1500 }
          }]
        }
      }
    });
    await db.collection('nesting_runs').insertOne({
      _id: 'run-action-preflight',
      identity: { uid: 'run-action-preflight', name: 'Preflight run' },
      lineage: { organizationId: mockUser.organizationId, queueId: queueId.toString() },
      status: statusFixture('COMPLETE', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: {
        results: { sheetCount: 1 },
        materialPool: [{
          type: 'PILE',
          id: pileId,
          available: 2,
          dimensions: { width: 3000, length: 1500 }
        }]
      }
    });
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Preflight Pile' },
      data: { stock: { total: 2, used: 0 } }
    });
    await insertRunSheetTwins(db, {
      organizationId: mockUser.organizationId,
      queueId,
      runId: 'run-action-preflight',
      count: 1
    });

    const result = await statusService.getActions(
      'nesting_run',
      'run-action-preflight',
      createTransitionAuth(mockUser.userId, null, mockUser.permissions)
    );
    const statusEvents = await db.collection('status_events').countDocuments({ targetId: 'run-action-preflight' });
    const pile = await db.collection('material_piles').findOne({ _id: pileId });

    expect(result.actions.map(action => action.to)).toContain('CHOSEN');
    expect(result.actions.map(action => action.to)).toContain('REJECTED');
    expect(statusEvents).toBe(0);
    expect(pile.data.stock.used).toBe(0);
  });

  it('should choose a production run when pile allocation depletes the selected stock', async () => {
    const queueId = new ObjectId();
    const pileId = 'pile-cut-depleted';
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Depleting queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('NESTING', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: {
        job: {
          materialPool: [{
            type: 'PILE',
            id: pileId,
            warehouseId: 'warehouse-cut-1',
            available: 1,
            dimensions: { width: 3000, length: 1500 }
          }]
        }
      }
    });
    await db.collection('nesting_runs').insertOne({
      _id: 'run-cut-depleted',
      lineage: { organizationId: mockUser.organizationId, queueId: queueId.toString() },
      status: statusFixture('COMPLETE'),
      data: {
        results: { sheetCount: 1 },
        materialPool: [{
          type: 'PILE',
          id: pileId,
          warehouseId: 'warehouse-cut-1',
          available: 1,
          dimensions: { width: 3000, length: 1500 }
        }]
      }
    });
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Depleted Pile' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('STOCKED', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: { stock: { total: 1, used: 0 } }
    });
    await insertRunSheetTwins(db, {
      organizationId: mockUser.organizationId,
      queueId,
      runId: 'run-cut-depleted',
      count: 1
    });

    const result = await nestingRunsService.chooseRun(queueId.toString(), 'run-cut-depleted', mockUser.userId, mockUser.organizationId, null, mockUser.permissions);
    const pile = await db.collection('material_piles').findOne({ _id: pileId });

    expect(result.run.status.state.primary).toBe('CHOSEN');
    expect(result.queue.data.materialConsumption.sources).toMatchObject([{ type: 'PILE', id: pileId, count: 1 }]);
    expect(pile.data.stock.used).toBe(1);
    expect(pile.status.state.primary).toBe('DEPLETED');
  });

  it('should bind sheet twins and create remnant geometry and cassette instances from a chosen warehouse run', async () => {
    const queueId = new ObjectId();
    const warehouseId = new ObjectId();
    const pileId = 'pile-cut-physical';
    await db.collection('warehouses').insertOne({
      _id: warehouseId,
      identity: { uid: 'warehouse-physical', name: 'Physical Warehouse' },
      lineage: { organizationId: mockUser.organizationId },
      data: { stats: { totalSheets: 5, totalRemnants: 0 } }
    });
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Physical queue' },
      lineage: { organizationId: mockUser.organizationId, projectId: 'project-1' },
      status: statusFixture('NESTING', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: {
        job: {
          materialPool: [{
            type: 'PILE',
            id: pileId,
            warehouseId: warehouseId.toString(),
            available: 5,
            dimensions: { width: 3000, length: 1500 }
          }]
        }
      }
    });
    await db.collection('nesting_runs').insertOne({
      _id: 'run-cut-physical',
      lineage: { organizationId: mockUser.organizationId, projectId: 'project-1', queueId: queueId.toString() },
      status: statusFixture('COMPLETE'),
      data: {
        results: { sheetCount: 1, remnantArea: 0.25 },
        sheetDesignIds: ['sheet-design-physical'],
        materialPool: [{
          type: 'PILE',
          id: pileId,
          warehouseId: warehouseId.toString(),
          available: 5,
          dimensions: { width: 3000, length: 1500 }
        }]
      }
    });
    await db.collection('sheet_designs').insertOne({
      _id: 'sheet-design-physical',
      identity: { uid: 'sheet-design-physical', name: 'Sheet Design 1', serial: 'S1' },
      lineage: { organizationId: mockUser.organizationId, projectId: 'project-1', queueId, runId: 'run-cut-physical' },
      specs: { width: 3000, length: 1500 },
      data: {
        geometry: {
          data: {
            items: [{
              id: 0,
              cassette_id: 'cassette-design-a',
              shape: { type: 'simple_polygon', data: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]] }
            }],
            bins: [{
              shape: {
                data: {
                  outer: [[0, 0], [3000, 0], [3000, 1500], [0, 1500], [0, 0]],
                  inner: []
                }
              }
            }],
            solution: {
              layouts: [{
                placed_items: [{ item_id: 0, transformation: { translation: [10, 20], rotation: 0 } }]
              }]
            }
          }
        },
        cassetteDesigns: [{ cassetteDesignId: 'cassette-design-a', count: 2 }]
      }
    });
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Physical Pile' },
      lineage: {
        organizationId: mockUser.organizationId,
        warehouseId
      },
      specs: { width: 3000, length: 1500, sheetThickness: 4 },
      data: { stock: { total: 5, used: 0 }, specs: { width: 3000, length: 1500, sheetThickness: 4 } }
    });
    await insertRunSheetTwins(db, {
      organizationId: mockUser.organizationId,
      queueId,
      runId: 'run-cut-physical',
      count: 1,
      sheetDesignId: 'sheet-design-physical'
    });

    const result = await nestingRunsService.chooseRun(queueId.toString(), 'run-cut-physical', mockUser.userId, mockUser.organizationId, null, mockUser.permissions);
    const sheets = await db.collection('sheets').find({}).toArray();
    const remnants = await db.collection('remnants').find({}).toArray();
    const instances = await db.collection('cassette_instances').find({}).toArray();
    const warehouseInstances = await cassetteInstancesService.list(
      mockUser.userId,
      mockUser.organizationId,
      null,
      mockUser.permissions,
      { 'lineage.warehouseId': warehouseId.toString() }
    );
    const warehouse = await db.collection('warehouses').findOne({ _id: warehouseId });

    expect(result.run.status.state.primary).toBe('CHOSEN');
    expect(result.queue.status.state.primary).toBe('READY');
    expect(result.queue.data.physicalOutputs.sheetIds).toEqual(['run-cut-physical-sheet-1']);
    expect(result.queue.data.physicalOutputs.sourceSheets).toHaveLength(1);
    expect(result.queue.data.physicalOutputs.remnantIds).toHaveLength(1);
    expect(result.queue.data.physicalOutputs.cassetteInstanceIds).toHaveLength(2);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].data.materialSource).toMatchObject({ type: 'PILE', id: pileId });
    expect(remnants).toHaveLength(1);
    expect(remnants[0].lineage.sheetId).toBe('run-cut-physical-sheet-1');
    expect(remnants[0].lineage.warehouseId.toString()).toBe(warehouseId.toString());
    expect(remnants[0].data.geometry.data.polygon.inner).toHaveLength(1);
    expect(remnants[0].data.geometry.data.layers.find(layer => layer.standardCode === 'remnant.usable')).toBeTruthy();
    expect(instances).toHaveLength(2);
    expect(warehouseInstances).toHaveLength(2);
    expect(instances[0].status.state.primary).toBe('CUT');
    expect(instances[0].lineage.sheetId).toBe('run-cut-physical-sheet-1');
    expect(instances[0].lineage.warehouseId.toString()).toBe(warehouseId.toString());
    expect(instances[0].lineage.queueId.toString()).toBe(queueId.toString());
    expect(warehouse.data.stats.totalSheets).toBe(4);
    expect(warehouse.data.stats.totalRemnants).toBe(1);
  });

  it('does not rewrite legacy cassette-instance statuses at read time', async () => {
    const queueId = new ObjectId();
    const warehouseId = new ObjectId();
    await db.collection('cassette_instances').insertOne({
      _id: new ObjectId(),
      identity: { uid: 'ci-legacy-cut', name: 'Legacy Cut Cassette', serial: 'LC-1' },
      lineage: {
        organizationId: mockUser.organizationId,
        queueId,
        warehouseId,
        designId: 'cassette-design-a'
      },
      status: statusFixture('NESTED', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: { source: 'QUEUE_CUT', cassetteDesignId: 'cassette-design-a' }
    });

    const warehouseInstances = await cassetteInstancesService.list(
      mockUser.userId,
      mockUser.organizationId,
      null,
      mockUser.permissions,
      { 'lineage.warehouseId': warehouseId.toString() }
    );

    expect(warehouseInstances).toHaveLength(1);
    expect(warehouseInstances[0].status.state.primary).toBe('NESTED');
  });

  it('should not partially consume pile stock when selected piles are insufficient', async () => {
    const queueId = new ObjectId();
    const pileId = 'pile-cut-short';
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Short stock queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('NESTING', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: {
        job: {
          materialPool: [{
            type: 'PILE',
            id: pileId,
            available: 5,
            dimensions: { width: 3000, length: 1500 }
          }]
        }
      }
    });
    await db.collection('nesting_runs').insertOne({
      _id: 'run-cut-short',
      lineage: { organizationId: mockUser.organizationId, queueId: queueId.toString() },
      status: statusFixture('COMPLETE'),
      data: {
        results: { sheetCount: 3 },
        materialPool: [{
          type: 'PILE',
          id: pileId,
          available: 5,
          dimensions: { width: 3000, length: 1500 }
        }]
      }
    });
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Short Pile' },
      data: { stock: { total: 2, used: 0 } }
    });

    await expect(nestingRunsService.chooseRun(queueId.toString(), 'run-cut-short', mockUser.userId, mockUser.organizationId, null, mockUser.permissions))
      .rejects.toThrow(/Insufficient selected pile stock/);

    const pile = await db.collection('material_piles').findOne({ _id: pileId });
    const run = await db.collection('nesting_runs').findOne({ _id: 'run-cut-short' });
    expect(pile.data.stock.used).toBe(0);
    expect(run.status.state.primary).toBe('COMPLETE');
  });

  it('rejects missing run-owned sheet twins before status or stock changes', async () => {
    const queueId = new ObjectId();
    const pileId = 'pile-cut-without-twin';
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Missing twin queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('NESTING', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: { job: { materialPool: [{ type: 'PILE', id: pileId }] } }
    });
    await db.collection('nesting_runs').insertOne({
      _id: 'run-cut-without-twin',
      lineage: { organizationId: mockUser.organizationId, queueId: queueId.toString() },
      status: statusFixture('COMPLETE'),
      data: {
        results: { sheetCount: 1 },
        materialPool: [{ type: 'PILE', id: pileId }]
      }
    });
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Unchanged Pile' },
      data: { stock: { total: 3, used: 0 } }
    });

    await expect(nestingRunsService.chooseRun(
      queueId.toString(),
      'run-cut-without-twin',
      mockUser.userId,
      mockUser.organizationId,
      null,
      mockUser.permissions
    )).rejects.toThrow(/sheet twins do not match/);

    const pile = await db.collection('material_piles').findOne({ _id: pileId });
    const run = await db.collection('nesting_runs').findOne({ _id: 'run-cut-without-twin' });
    const queue = await db.collection('queues').findOne({ _id: queueId });
    expect(pile.data.stock.used).toBe(0);
    expect(run.status.state.primary).toBe('COMPLETE');
    expect(queue.data.materialConsumption).toBeUndefined();
  });

  it('should not consume pile stock again when production output already exists for the same run', async () => {
    const queueId = new ObjectId();
    const pileId = 'pile-cut-done';
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Already cut queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('NESTING', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: {
        materialConsumption: { runId: 'run-cut-done', requiredSheets: 1, sources: [{ type: 'PILE', id: pileId, count: 1 }] },
        physicalOutputs: { runId: 'run-cut-done', sheetIds: ['sheet-1'], remnantIds: [], cassetteInstanceIds: [] },
        job: {
          materialPool: [{ type: 'PILE', id: pileId }]
        }
      }
    });
    await db.collection('nesting_runs').insertOne({
      _id: 'run-cut-done',
      lineage: { organizationId: mockUser.organizationId, queueId: queueId.toString() },
      status: statusFixture('COMPLETE'),
      data: {
        results: { sheetCount: 1 },
        materialPool: [{ type: 'PILE', id: pileId }]
      }
    });
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Done Pile' },
      data: { stock: { total: 2, used: 0 } }
    });

    const result = await nestingRunsService.chooseRun(queueId.toString(), 'run-cut-done', mockUser.userId, mockUser.organizationId, null, mockUser.permissions);

    const pile = await db.collection('material_piles').findOne({ _id: pileId });
    expect(pile.data.stock.used).toBe(0);
    expect(result.queue.data.materialConsumption.runId).toBe('run-cut-done');
  });

  it('does not gate run selection on a hardcoded queue status', async () => {
    const queueId = new ObjectId();
    const pileId = 'pile-cut-draft';
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Draft queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('DRAFT', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: {
        job: {
          materialPool: [{ type: 'PILE', id: pileId }]
        }
      }
    });
    await db.collection('nesting_runs').insertOne({
      _id: 'run-cut-draft',
      lineage: { organizationId: mockUser.organizationId, queueId: queueId.toString() },
      status: statusFixture('COMPLETE'),
      data: {
        results: { sheetCount: 1 },
        materialPool: [{ type: 'PILE', id: pileId }]
      }
    });
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Draft Pile' },
      data: { stock: { total: 2, used: 0 } }
    });
    await insertRunSheetTwins(db, {
      organizationId: mockUser.organizationId,
      queueId,
      runId: 'run-cut-draft',
      count: 1
    });

    const result = await nestingRunsService.chooseRun(
      queueId.toString(),
      'run-cut-draft',
      mockUser.userId,
      mockUser.organizationId,
      null,
      mockUser.permissions
    );

    const pile = await db.collection('material_piles').findOne({ _id: pileId });
    const run = await db.collection('nesting_runs').findOne({ _id: 'run-cut-draft' });
    expect(result.queue.status.state.primary).toBe('READY');
    expect(pile.data.stock.used).toBe(1);
    expect(run.status.state.primary).toBe('CHOSEN');
  });

  it('should not consume pile stock when choosing an unfinished run', async () => {
    const queueId = new ObjectId();
    const pileId = 'pile-cut-nesting';
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Draft queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: statusFixture('DRAFT', { userId: mockUser.userId, timestamp: new Date(), metadata: {} }),
      data: {
        job: {
          materialPool: [{ type: 'PILE', id: pileId }]
        }
      }
    });
    await db.collection('nesting_runs').insertOne({
      _id: 'run-cut-nesting',
      lineage: { organizationId: mockUser.organizationId, queueId: queueId.toString() },
      status: statusFixture('NESTING'),
      data: {
        results: { sheetCount: 1 },
        materialPool: [{ type: 'PILE', id: pileId }]
      }
    });
    await db.collection('material_piles').insertOne({
      _id: pileId,
      identity: { uid: pileId, name: 'Draft Pile' },
      data: { stock: { total: 2, used: 0 } }
    });

    await expect(nestingRunsService.chooseRun(queueId.toString(), 'run-cut-nesting', mockUser.userId, mockUser.organizationId, null, mockUser.permissions))
      .rejects.toThrow(/No transition intent "acceptNestingRun"/);

    const pile = await db.collection('material_piles').findOne({ _id: pileId });
    const run = await db.collection('nesting_runs').findOne({ _id: 'run-cut-nesting' });
    expect(pile.data.stock.used).toBe(0);
    expect(run.status.state.primary).toBe('NESTING');
  });
});
