import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../cassette-designs/service.js', () => ({
  getById: vi.fn()
}));

vi.mock('../parametric-cassettes/service.js', () => ({
  evaluateTemplate: vi.fn()
}));

vi.mock('../machines/service.js', () => ({
  SYSTEM_DEFAULT_MACHINE_ID: 'machine-system-default',
  getById: vi.fn()
}));

vi.mock('../tool-profiles/service.js', () => ({
  getById: vi.fn()
}));

vi.mock('./jobs.js', () => ({
  findActiveByQueue: vi.fn(),
  create: vi.fn()
}));

vi.mock('../nesting-runs/service.js', () => ({
  getNextRunNumber: vi.fn(),
  create: vi.fn()
}));

vi.mock('../../core/tasks/service.js', () => ({
  createTaskRun: vi.fn(),
  getTaskRunById: vi.fn()
}));

vi.mock('../../core/machines/service.js', () => ({
  statusService: {
    getActions: vi.fn()
  }
}));

import * as cassetteDesignService from '../cassette-designs/service.js';
import * as parametricCassettesService from '../parametric-cassettes/service.js';
import * as nestingJobs from './jobs.js';
import * as nestingRunsService from '../nesting-runs/service.js';
import * as machinesService from '../machines/service.js';
import * as toolProfilesService from '../tool-profiles/service.js';
import { createTaskRun } from '../../core/tasks/service.js';
import { statusService } from '../../core/machines/service.js';
import { cncCommands } from '../../../packages/domain-cnc/src/commands.js';
import { cncWorkflows } from '../../../packages/domain-cnc/src/workflows.js';
import { buildJobFiles, buildNestingWorkerRequest, enrichNestingResult, insetSheetPolygon, resolveNestingExecution, resolveNestingMaterialPool, solveNesting, summarizeNestingResult } from './operations.js';

describe('nesting operation worker payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    machinesService.getById.mockResolvedValue(makeMachine());
    toolProfilesService.getById.mockResolvedValue(makeTool());
  });

  it('builds FastAPI nesting input from cassette polygon parts', () => {
    const request = buildNestingWorkerRequest([
      {
        cassetteId: 'cassette-1',
        count: 2,
        polygonParts: [{
          coordinates: [[0, 0, 0], [100, 0, 0], [100, 50, 0], [0, 50, 0], [0, 0, 0]],
          handles: ['100']
        }]
      }
    ], makeExecutionSettings({ width: 1220, length: 2440, kerf: 7 }));

    expect(request).toMatchObject({
      params: { width: 1220, height: 2440, space: 7, sheetCount: 1000 },
      items: [{
        id: 0,
        cassette_id: 'cassette-1',
        count: 2,
        handles: ['100']
      }]
    });
    expect(request.items[0].coords).toEqual([[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]);
  });

  it('resolves selected machine, tool, and warehouse material before creating worker params', async () => {
    const execution = await resolveNestingExecution({
      machineId: 'machine-1',
      toolProfileId: 'tool-1',
      materialMode: 'WAREHOUSE',
      materialPool: [
        {
          type: 'PILE',
          id: 'pile-1',
          dimensions: { width: 3000, length: 1500, thickness: 2 },
          available: 4
        },
        {
          type: 'SHEET',
          id: 'sheet-1',
          dimensions: { width: 3000, length: 1500, thickness: 2 },
          available: 1
        }
      ]
    }, makeAuth());

    expect(execution).toMatchObject({
      machineSnapshot: { source: { type: 'machine', id: 'machine-1' } },
      toolSnapshot: { source: { type: 'tool_profile', id: 'tool-1' }, kerf: 7 },
      materialSnapshot: { mode: 'WAREHOUSE', width: 3000, length: 1500, thickness: 2, sheetCount: 5 }
    });
    expect(execution.params).toEqual({
      width: 3000,
      height: 1500,
      space: 7,
      sheetCount: 5,
      sheet_polygon: {
        outer: [[0, 0], [3000, 0], [3000, 1500], [0, 1500], [0, 0]],
        inner: []
      }
    });
  });

  it('uses selected remnant geometry as the nesting sheet polygon with holes', async () => {
    const polygon = [[0, 0], [1200, 0], [1200, 800], [700, 800], [700, 1200], [0, 1200]];
    const hole = [[200, 200], [400, 200], [400, 400], [200, 400]];
    const execution = await resolveNestingExecution({
      machineId: 'machine-1',
      toolProfileId: 'tool-1',
      materialMode: 'WAREHOUSE',
      materialPool: [{
        type: 'REMNANT',
        id: 'remnant-1',
        dimensions: { width: 1200, length: 1200, thickness: 1 },
        available: 1,
        geometryData: {
          polygon: { outer: polygon, inner: [hole] }
        }
      }]
    }, makeAuth());

    const expected = {
      outer: [...polygon, [0, 0]],
      inner: [[...hole, [200, 200]]]
    };
    expect(execution.materialSnapshot.physicalSheetPolygon).toEqual(expected);
    expect(execution.params.sheet_polygon).toEqual(expected);
  });

  it('applies the machine boundary offset to both the outside edge and holes', async () => {
    const result = await insetSheetPolygon({
      outer: [[100, 100], [0, 100], [0, 0], [100, 0], [100, 100]],
      inner: [[[40, 40], [40, 60], [60, 60], [60, 40], [40, 40]]]
    }, 10);

    expect(result.outer).toEqual([[10, 10], [90, 10], [90, 90], [10, 90], [10, 10]]);
    expect(result.inner).toEqual([[[30, 30], [30, 70], [70, 70], [70, 30], [30, 30]]]);
  });

  it('declares warehouse material pool as a solveNesting command input', () => {
    const fields = cncCommands.solveNesting.input.parameters;
    const materialMode = fields.find(field => field.name === 'materialMode');

    expect(materialMode.options).toContain('WAREHOUSE');
    expect(fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'materialPool', type: 'array' }),
      expect.objectContaining({ name: 'machineId', type: 'entityId' }),
      expect.objectContaining({ name: 'toolProfileId', type: 'entityId' }),
      expect.objectContaining({ name: 'virtualWidth', type: 'number' }),
      expect.objectContaining({ name: 'virtualLength', type: 'number' }),
      expect.objectContaining({ name: 'virtualThickness', type: 'number' })
    ]));
    expect(fields.some(field => field.name === 'spacing')).toBe(false);
  });

  it('uses saved queue material pool when command payload omits normalized stock', () => {
    const savedPool = [{ type: 'PILE', id: 'pile-1', dimensions: { width: 3000, length: 1500 }, available: 30 }];
    const queue = { data: { job: { materialPool: savedPool } } };

    expect(resolveNestingMaterialPool({ materialMode: 'WAREHOUSE', materialPool: [] }, queue)).toBe(savedPool);
    expect(resolveNestingMaterialPool({ materialMode: 'WAREHOUSE' }, queue)).toBe(savedPool);
  });

  it('allows queue managers to choose nesting runs', () => {
    const chosenTransition = cncWorkflows.nesting_run.regions.main.transitions.find(transition => transition.from === 'COMPLETE' && transition.to === 'CHOSEN');

    expect(chosenTransition.access.permissions).toEqual([
      { feature: 'queues', level: 'write' }
    ]);
  });

  it('declares queue lifecycle transitions used by nesting solve and run selection', () => {
    const transitions = cncWorkflows.queue.regions.main.transitions;
    const startTransition = transitions.find(transition => transition.from === 'DRAFT' && transition.to === 'NESTING');
    const finishTransition = transitions.find(transition => transition.from === 'NESTING' && transition.to === 'READY');
    const failTransition = transitions.find(transition => transition.from === 'NESTING' && transition.to === 'DRAFT');

    expect(startTransition.access.permissions).toEqual([{ feature: 'queues', level: 'write' }]);
    expect(finishTransition.access.system).toBe(true);
    expect(failTransition.access.system).toBe(true);
  });

  it('does not emit queue requestNesting events when the active workflow cannot accept them', async () => {
    const queue = makeQueue();
    cassetteDesignService.getById.mockResolvedValue(makeCassetteDesign());
    nestingJobs.findActiveByQueue.mockResolvedValue(null);
    nestingJobs.create.mockResolvedValue({ _id: 'job-1' });
    nestingRunsService.getNextRunNumber.mockResolvedValue(1);
    nestingRunsService.create.mockResolvedValue({ _id: 'run-1' });
    createTaskRun.mockResolvedValue({ _id: 'task-1' });
    statusService.getActions.mockResolvedValue({ actions: [] });

    const result = await solveNesting({
      entities: { queue },
      parameters: { materialMode: 'VIRTUAL' },
      auth: makeAuth()
    });

    expect(result.entities).toEqual([{ type: 'nesting_run', id: 'run-1' }]);
    expect(result.events).toEqual([]);
    expect(statusService.getActions).toHaveBeenCalledWith('queue', queue._id, makeAuth());
  });

  it('keeps the queue requestNesting event for workflows that expose the intent', async () => {
    const queue = makeQueue();
    cassetteDesignService.getById.mockResolvedValue(makeCassetteDesign());
    nestingJobs.findActiveByQueue.mockResolvedValue(null);
    nestingJobs.create.mockResolvedValue({ _id: 'job-1' });
    nestingRunsService.getNextRunNumber.mockResolvedValue(1);
    nestingRunsService.create.mockResolvedValue({ _id: 'run-1' });
    createTaskRun.mockResolvedValue({ _id: 'task-1' });
    statusService.getActions.mockResolvedValue({ actions: [{ intent: 'requestNesting' }] });

    const result = await solveNesting({
      entities: { queue },
      parameters: { materialMode: 'VIRTUAL' },
      auth: makeAuth()
    });

    expect(result.events).toEqual([
      expect.objectContaining({
        type: 'queue.nestingRequested',
        source: { type: 'queue', id: queue._id },
        entities: [{ type: 'nesting_run', id: 'run-1' }]
      })
    ]);
  });

  it('rejects mixed-size or mixed-thickness warehouse stock for a single nesting run', async () => {
    await expect(resolveNestingExecution({
      machineId: 'machine-1',
      toolProfileId: 'tool-1',
      materialMode: 'WAREHOUSE',
      materialPool: [
        { type: 'PILE', id: 'pile-1', dimensions: { width: 3000, length: 1500, thickness: 1 }, available: 4 },
        { type: 'PILE', id: 'pile-2', dimensions: { width: 3000, length: 1500, thickness: 2 }, available: 2 }
      ]
    }, makeAuth())).rejects.toThrow(/one sheet size and thickness/);
  });

  it('rejects warehouse mode when selected stock has no sheet dimensions', async () => {
    await expect(resolveNestingExecution({
      machineId: 'machine-1',
      toolProfileId: 'tool-1',
      materialMode: 'WAREHOUSE',
      materialPool: [
        { type: 'REMNANT', id: 'remnant-1', label: 'Unknown remnant', available: 1 }
      ]
    }, makeAuth())).rejects.toThrow(/width, length, and thickness/);
  });

  it('skips degenerate polygon parts before worker payload creation', () => {
    const request = buildNestingWorkerRequest([
      {
        cassetteId: 'cassette-1',
        count: 1,
        polygonParts: [
          {
            coordinates: [[0, 0], [100, 0], [0, 0]],
            handles: ['bad']
          },
          {
            coordinates: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]],
            handles: ['ok']
          }
        ]
      }
    ], makeExecutionSettings());

    expect(request.items).toHaveLength(1);
    expect(request.items[0]).toMatchObject({ id: 0, handles: ['ok'] });
  });

  it('falls back to a rectangle when polygon parts are absent', () => {
    const request = buildNestingWorkerRequest([
      { cassetteId: 'cassette-2', count: 1, dimensions: { width: 300, height: 200 } }
    ], makeExecutionSettings());

    expect(request.items[0].coords).toEqual([[0, 0], [300, 0], [300, 200], [0, 200], [0, 0]]);
  });

  it('keeps sheet workpieces as separate nesting items for one baked template', () => {
    const request = buildNestingWorkerRequest([
      {
        cassetteId: 'baked-template-1',
        count: 1,
        polygonParts: [
          {
            workpieceId: 'wp_1',
            coordinates: [[0, 0, 0], [700, 0, 0], [700, 300, 0], [0, 300, 0], [0, 0, 0]],
            handles: ['wp_1:C1']
          },
          {
            workpieceId: 'wp_2',
            coordinates: [[0, 0, 0], [700, 0, 0], [700, 300, 0], [0, 300, 0], [0, 0, 0]],
            handles: ['wp_2:C1']
          }
        ]
      }
    ], makeExecutionSettings());

    expect(request.items).toHaveLength(2);
    expect(request.items.map(item => item.id)).toEqual([0, 1]);
    expect(request.items.map(item => item.cassette_id)).toEqual(['baked-template-1', 'baked-template-1']);
    expect(request.items.map(item => item.handles)).toEqual([['wp_1:C1'], ['wp_2:C1']]);
  });

  it('rejects legacy template queue rows instead of baking through a runtime fallback', async () => {
    const queue = {
      data: {
        job: {
          items: [{
            type: 'PARAMETRIC',
            entityType: 'cassette',
            id: 'template-1',
            quantity: 3,
            parameters: { A: 420, B: 260 }
          }]
        }
      }
    };

    await expect(buildJobFiles(queue, makeAuth()))
      .rejects.toThrow(/must reference a cassette_design/);
    expect(cassetteDesignService.getById).not.toHaveBeenCalled();
  });

  it('uses uploaded static cassette design geometry directly', async () => {
    cassetteDesignService.getById.mockResolvedValue({
      _id: 'design-1',
      data: {
        geometry: {
          data: {
            polygonParts: [{
              coordinates: [[0, 0], [120, 0], [120, 80], [0, 80], [0, 0]],
              handles: ['OUTER']
            }],
            layerData: [{
              layer: 'fold.route',
              coordinates: [[0, 40], [120, 40]],
              handles: ['FOLD']
            }]
          }
        }
      }
    });

    const queue = {
      data: {
        job: {
          items: [{
            type: 'STATIC',
            entityType: 'cassette_design',
            id: 'design-1',
            quantity: 2,
            parameters: {}
          }]
        }
      }
    };
    const auth = { userId: 'user-1', organizationId: 'org-1', role: 'USER', memberships: [] };

    const jobFiles = await buildJobFiles(queue, auth);
    const request = buildNestingWorkerRequest(jobFiles, makeExecutionSettings());

    expect(cassetteDesignService.getById).toHaveBeenCalledWith('design-1', 'user-1', 'USER', auth);
    expect(request.items).toHaveLength(1);
    expect(request.items[0]).toMatchObject({
      cassette_id: 'design-1',
      count: 2,
      handles: ['OUTER'],
      sourceLayers: [{
        layer: 'fold.route',
        coordinates: [[0, 40], [120, 40]],
        handles: ['FOLD']
      }]
    });
    expect(request.items[0].coords).toEqual([[0, 0], [120, 0], [120, 80], [0, 80], [0, 0]]);
  });

  it('summarizes worker layouts for nesting run result data', () => {
    expect(summarizeNestingResult({
      solution: {
        layouts: [
          { placed_items: [{}, {}] },
          { placed_items: [{}] }
        ]
      }
    })).toMatchObject({ sheetCount: 2, placedCount: 3 });
  });

  it('enriches stripped worker output with request source geometry', () => {
    const request = buildNestingWorkerRequest([
      {
        cassetteId: 'cassette-1',
        count: 2,
        polygonParts: [{
          coordinates: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]
        }],
        layerData: [
          { layer: 'fold.route', coordinates: [[0, 0], [100, 0]] }
        ]
      }
    ], makeExecutionSettings({ width: 300, length: 200 }));
    const result = enrichNestingResult({
      name: 'nesting_job',
      solution: {
        layouts: [
          { placed_items: [{ item_id: 0, transformation: { rotation: 0, translation: [10, 20] } }] }
        ]
      }
    }, request);

    expect(result.items[0]).toMatchObject({
      id: 0,
      cassette_id: 'cassette-1',
      shape: { type: 'simple_polygon', data: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]] },
      sourceLayers: [{ layer: 'fold.route', coordinates: [[0, 0], [100, 0]] }]
    });
    expect(result.bins[0].shape.data.outer).toEqual([[0, 0], [300, 0], [300, 200], [0, 200], [0, 0]]);
    expect(summarizeNestingResult(result, request.params)).toMatchObject({
      efficiency: 8.33,
      remnantArea: 0.06,
      placedCount: 1
    });
  });

  it('uses sheet polygon holes for fallback bins and summary area', () => {
    const sheetPolygon = {
      outer: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]],
      inner: [[[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]]]
    };
    const request = buildNestingWorkerRequest([
      {
        cassetteId: 'cassette-1',
        count: 1,
        polygonParts: [{
          coordinates: [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]
        }]
      }
    ], makeExecutionSettings({ width: 100, length: 100, usableSheetPolygon: sheetPolygon }));
    const result = enrichNestingResult({
      solution: {
        layouts: [
          { placed_items: [{ item_id: 0, transformation: { rotation: 0, translation: [10, 10] } }] }
        ]
      }
    }, request);

    expect(result.bins[0].shape.data).toEqual(sheetPolygon);
    expect(summarizeNestingResult(result, request.params)).toMatchObject({
      remnantArea: 0.01,
      placedCount: 1
    });
  });

  it('merges request source layers into worker items that were echoed without metadata', () => {
    const request = buildNestingWorkerRequest([
      {
        cassetteId: 'cassette-1',
        count: 1,
        polygonParts: [{
          coordinates: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]
        }],
        layerData: [
          { layer: 'cut.outer', coordinates: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]] },
          { layer: 'fold.route', coordinates: [[0, 25], [100, 25]] }
        ]
      }
    ], makeExecutionSettings());
    const result = enrichNestingResult({
      items: [{ id: 0, handles: [], sourceLayers: [], shape: { type: 'simple_polygon', data: [] } }],
      solution: {
        layouts: [
          { placed_items: [{ item_id: 0, transformation: { rotation: 0, translation: [10, 20] } }] }
        ]
      }
    }, request);

    expect(result.items[0]).toMatchObject({
      id: 0,
      cassette_id: 'cassette-1',
      shape: { type: 'simple_polygon', data: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]] },
      sourceLayers: [
        { layer: 'cut.outer', coordinates: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]] },
        { layer: 'fold.route', coordinates: [[0, 25], [100, 25]] }
      ]
    });
  });

  it('keeps request items that are missing from partial worker item output', () => {
    const request = {
      items: [
        { id: 0, cassette_id: 'design-a', coords: [[0, 0], [10, 0], [10, 10]], count: 1 },
        { id: 1, cassette_id: 'design-b', coords: [[0, 0], [20, 0], [20, 20]], count: 1 },
        { id: 2, cassette_id: 'design-b', coords: [[0, 0], [30, 0], [30, 30]], count: 1 }
      ],
      params: { width: 100, height: 100 }
    };

    const result = enrichNestingResult({
      items: [
        { id: 0, shape: { type: 'simple_polygon', data: [[1, 1], [2, 1], [2, 2]] } }
      ],
      solution: {
        layouts: [
          { placed_items: [{ item_id: 2 }] }
        ]
      }
    }, request);

    expect(result.items.map(item => item.id)).toEqual([0, 1, 2]);
    expect(result.items[2]).toMatchObject({
      id: 2,
      cassette_id: 'design-b',
      shape: {
        type: 'simple_polygon',
        data: [[0, 0], [30, 0], [30, 30]]
      }
    });
  });

  it('derives utilization and remnant area from worker density when metrics are absent', () => {
    expect(summarizeNestingResult({
      solution: {
        density: 0.6406586,
        layouts: [
          {
            placed_items: [{ item_id: 0 }],
            density: 0.6406586
          }
        ]
      },
      bins: [
        {
          shape: {
            data: {
              outer: [[0, 0], [1220, 0], [1220, 2440], [0, 2440], [0, 0]]
            }
          }
        }
      ]
    }, { width: 1220, height: 2440 })).toMatchObject({
      efficiency: 64.07,
      remnantArea: 1.07,
      placedCount: 1
    });
  });

  it('evaluates cassette geometry from source parameters when material thickness changes queue parameters', async () => {
    cassetteDesignService.getById.mockResolvedValue({
      _id: 'design-source',
      identity: { name: 'Parametric design' },
      provenance: {
        derivedFrom: {
          source: { type: 'cassette', id: 'template-1' }
        }
      },
      data: {
        parameters: { A: 700, B: 300, T: 3 },
        geometry: {
          data: {
            polygonParts: [{
              coordinates: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]],
              handles: ['OLD']
            }]
          }
        }
      }
    });
    parametricCassettesService.evaluateTemplate.mockResolvedValue({
      dimensions: { A: 700, B: 300, T: 4 },
      nestingPolygons: [{
        coordinates: [[0, 0], [120, 0], [120, 60], [0, 60], [0, 0]],
        handles: ['NEW']
      }],
      layerData: [{
        layer: 'dimension.cassette',
        coordinates: [[0, 0], [120, 0]],
        handles: ['DIM']
      }]
    });

    const queue = {
      data: {
        job: {
          items: [{
            type: 'STATIC',
            entityType: 'cassette_design',
            id: 'design-source',
            quantity: 1,
            parameters: { A: 700, B: 300, T: 4 }
          }]
        }
      }
    };
    const auth = makeAuth();

    const jobFiles = await buildJobFiles(queue, auth);

    expect(parametricCassettesService.evaluateTemplate).toHaveBeenCalledWith(
      'template-1',
      { A: 700, B: 300, T: 4 }
    );
    expect(jobFiles[0]).toMatchObject({
      cassetteId: 'design-source',
      count: 1,
      dimensions: { A: 700, B: 300, T: 4 },
      polygonParts: [{
        handles: ['NEW']
      }],
      layerData: [{
        handles: ['DIM']
      }]
    });
  });

  it('derives utilization from placed source polygons when only placement data is available', () => {
    expect(summarizeNestingResult({
      items: [
        {
          id: 0,
          shape: { data: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]] }
        }
      ],
      solution: {
        layouts: [
          { placed_items: [{ item_id: 0 }, { item_id: 0 }] }
        ]
      }
    }, { width: 200, height: 100 })).toMatchObject({
      efficiency: 50,
      remnantArea: 0.01,
      placedCount: 2
    });
  });
});

function makeAuth() {
  return { userId: 'user-1', organizationId: 'org-1', role: 'USER', memberships: [] };
}

function makeQueue() {
  return {
    _id: 'queue-1',
    status: {
      state: {
        primary: 'Отправлено',
        active: { main: 'Отправлено' }
      }
    },
    lineage: { organizationId: 'org-1' },
    data: {
      queueNumber: 7,
      job: {
        items: [{
          type: 'STATIC',
          entityType: 'cassette_design',
          id: 'design-1',
          quantity: 2,
          parameters: {}
        }]
      },
      nestingSettings: {
        machineId: 'machine-1',
        toolProfileId: 'tool-1',
        materialMode: 'VIRTUAL',
        virtualWidth: 1220,
        virtualLength: 1000,
        virtualThickness: 1
      }
    }
  };
}

function makeMachine() {
  return {
    _id: 'machine-1',
    data: {
      workingArea: { width: 3000, length: 1500 },
      boundaryOffset: 0
    }
  };
}

function makeTool() {
  return {
    _id: 'tool-1',
    data: { diameter: 6, angle: 0, kerf: 7 }
  };
}

function makeExecutionSettings({
  width = 1220,
  length = 1000,
  thickness = 1,
  kerf = 5,
  sheetCount = 1000,
  usableSheetPolygon = null
} = {}) {
  return {
    machineSnapshot: {
      source: { type: 'machine', id: 'machine-1' },
      workingArea: { width: 3000, length: 1500 },
      boundaryOffset: 0
    },
    toolSnapshot: {
      source: { type: 'tool_profile', id: 'tool-1' },
      kerf
    },
    materialSnapshot: {
      mode: 'VIRTUAL',
      width,
      length,
      thickness,
      sheetCount,
      usableSheetPolygon: usableSheetPolygon || {
        outer: [[0, 0], [width, 0], [width, length], [0, length], [0, 0]],
        inner: []
      }
    }
  };
}

function makeCassetteDesign() {
  return {
    _id: 'design-1',
    data: {
      geometry: {
        data: {
          polygonParts: [{
            coordinates: [[0, 0], [120, 0], [120, 80], [0, 80], [0, 0]],
            handles: ['OUTER']
          }]
        }
      }
    }
  };
}
