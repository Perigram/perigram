import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../cassettes/service.js', () => ({
  getById: vi.fn()
}));

vi.mock('../cassette-designs/service.js', () => ({
  getById: vi.fn()
}));

vi.mock('../parametric-cassettes/service.js', () => ({
  bakeTemplateInstance: vi.fn()
}));

import * as cassetteService from '../cassettes/service.js';
import * as cassetteDesignService from '../cassette-designs/service.js';
import { bakeTemplateInstance } from '../parametric-cassettes/service.js';
import { cncCommands } from '../../../packages/domain-cnc/src/commands.js';
import { cncWorkflows } from '../../../packages/domain-cnc/src/workflows.js';
import { buildJobFiles, buildNestingWorkerRequest, enrichNestingResult, resolveNestingContext, resolveNestingMaterialPool, resolveNestingParams, summarizeNestingResult } from './operations.js';

describe('nesting operation worker payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    ], { width: 1220, height: 2440, spacing: 7 });

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

  it('uses selected warehouse material pool as nesting sheet size and count', () => {
    const context = resolveNestingContext({
      materialMode: 'WAREHOUSE',
      materialPool: [
        {
          type: 'PILE',
          id: 'pile-1',
          dimensions: { width: 3000, length: 1500 },
          available: 4
        },
        {
          type: 'SHEET',
          id: 'sheet-1',
          specs: '3000x1500',
          available: 1
        }
      ]
    });

    expect(context).toMatchObject({
      width: 3000,
      height: 1500,
      sheetCount: 5,
      materialMode: 'WAREHOUSE'
    });
    expect(resolveNestingParams(context)).toEqual({
      width: 3000,
      height: 1500,
      space: 5,
      sheetCount: 5,
      sheet_polygon: null
    });
  });

  it('uses selected remnant geometry as the nesting sheet polygon with holes', () => {
    const polygon = [[0, 0], [1200, 0], [1200, 800], [700, 800], [700, 1200], [0, 1200]];
    const hole = [[200, 200], [400, 200], [400, 400], [200, 400]];
    const context = resolveNestingContext({
      materialMode: 'WAREHOUSE',
      materialPool: [{
        type: 'REMNANT',
        id: 'remnant-1',
        dimensions: { width: 1200, length: 1200 },
        available: 1,
        geometryData: {
          polygon: { outer: polygon, inner: [hole] }
        }
      }]
    });

    const expected = {
      outer: [...polygon, [0, 0]],
      inner: [[...hole, [200, 200]]]
    };
    expect(context.sheet_polygon).toEqual(expected);
    expect(resolveNestingParams(context).sheet_polygon).toEqual(expected);
  });

  it('declares warehouse material pool as a solveNesting command input', () => {
    const fields = cncCommands.solveNesting.input.parameters;
    const materialMode = fields.find(field => field.name === 'materialMode');

    expect(materialMode.options).toContain('WAREHOUSE');
    expect(fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'materialPool', type: 'array' }),
      expect.objectContaining({ name: 'virtualWidth', type: 'number' }),
      expect.objectContaining({ name: 'virtualLength', type: 'number' })
    ]));
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

  it('rejects mixed-size warehouse stock for a single nesting run', () => {
    expect(() => resolveNestingParams({
      materialMode: 'WAREHOUSE',
      materialPool: [
        { type: 'PILE', id: 'pile-1', dimensions: { width: 3000, length: 1500 }, available: 4 },
        { type: 'PILE', id: 'pile-2', dimensions: { width: 2440, length: 1220 }, available: 2 }
      ]
    })).toThrow(/one sheet size/);
  });

  it('rejects warehouse mode when selected stock has no sheet dimensions', () => {
    expect(() => resolveNestingParams({
      materialMode: 'WAREHOUSE',
      materialPool: [
        { type: 'REMNANT', id: 'remnant-1', label: 'Unknown remnant', available: 1 }
      ]
    })).toThrow(/sheet dimensions/);
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
    ]);

    expect(request.items).toHaveLength(1);
    expect(request.items[0]).toMatchObject({ id: 0, handles: ['ok'] });
  });

  it('falls back to a rectangle when polygon parts are absent', () => {
    const request = buildNestingWorkerRequest([
      { cassetteId: 'cassette-2', count: 1, dimensions: { width: 300, height: 200 } }
    ]);

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
    ]);

    expect(request.items).toHaveLength(2);
    expect(request.items.map(item => item.id)).toEqual([0, 1]);
    expect(request.items.map(item => item.cassette_id)).toEqual(['baked-template-1', 'baked-template-1']);
    expect(request.items.map(item => item.handles)).toEqual([['wp_1:C1'], ['wp_2:C1']]);
  });

  it('bakes parametric cassette entries with queue parameters before worker payload creation', async () => {
    cassetteService.getById.mockResolvedValue({
      _id: 'template-1',
      data: { type: 'PARAMETRIC', parameters: ['A', 'B'] }
    });
    bakeTemplateInstance.mockResolvedValue({
      _id: 'baked-1',
      data: {
        dimensions: { A: 420, B: 260 },
        polygonParts: [{
          coordinates: [[0, 0, 0], [420, 0, 0], [420, 260, 0], [0, 260, 0], [0, 0, 0]],
          handles: ['FACE']
        }],
        layerData: [
          {
            layer: 'fold.route',
            coordinates: [[0, 0], [420, 0]],
            handles: ['F1']
          }
        ]
      }
    });

    const queue = {
      data: {
        job: {
          items: [{
            type: 'PARAMETRIC',
            id: 'template-1',
            quantity: 3,
            parameters: { A: 420, B: 260 }
          }]
        }
      }
    };
    const auth = { userId: 'user-1', organizationId: 'org-1', role: 'USER', memberships: [] };

    const jobFiles = await buildJobFiles(queue, auth);
    const request = buildNestingWorkerRequest(jobFiles, { width: 1220, height: 2440, spacing: 5 });

    expect(cassetteService.getById).toHaveBeenCalledWith('template-1', 'user-1', 'org-1', 'USER', auth);
    expect(bakeTemplateInstance).toHaveBeenCalledWith(expect.anything(), { A: 420, B: 260 }, 'user-1');
    expect(jobFiles).toEqual([{
      cassetteId: 'baked-1',
      count: 3,
      dimensions: { A: 420, B: 260 },
      polygonParts: [{
        coordinates: [[0, 0, 0], [420, 0, 0], [420, 260, 0], [0, 260, 0], [0, 0, 0]],
        handles: ['FACE']
      }],
      layerData: [
        {
          layer: 'fold.route',
          coordinates: [[0, 0], [420, 0]],
          handles: ['F1']
        }
      ]
    }]);
    expect(request.items[0]).toMatchObject({
      cassette_id: 'baked-1',
      count: 3,
      handles: ['FACE'],
      sourceLayers: [
        {
          layer: 'fold.route',
          coordinates: [[0, 0], [420, 0]],
          handles: ['F1']
        }
      ]
    });
    expect(request.items[0].coords).toEqual([[0, 0], [420, 0], [420, 260], [0, 260], [0, 0]]);
  });

  it('bakes fetched parametric templates even when queue item type is stale', async () => {
    cassetteDesignService.getById.mockRejectedValue(new Error('not a design'));
    cassetteService.getById.mockResolvedValue({
      _id: 'template-2',
      data: {
        type: 'PARAMETRIC',
        parameters: ['A', 'B'],
        definition: {
          occs: '0.4-draft',
          documentType: 'template'
        }
      }
    });
    bakeTemplateInstance.mockResolvedValue({
      _id: 'baked-2',
      data: {
        dimensions: { A: 700, B: 300 },
        polygonParts: [{
          coordinates: [[0, 0, 0], [700, 0, 0], [700, 300, 0], [0, 300, 0], [0, 0, 0]],
          handles: ['wp_1:C1'],
          workpieceId: 'wp_1'
        }],
        layerData: [
          {
            layer: 'fold.route',
            workpieceId: 'wp_1',
            coordinates: [[0, 0], [700, 0]],
            handles: ['wp_1:F1']
          },
          {
            layer: 'fold.route',
            workpieceId: 'wp_2',
            coordinates: [[0, 0], [300, 0]],
            handles: ['wp_2:F1']
          }
        ]
      }
    });

    const queue = {
      data: {
        job: {
          items: [{
            type: 'STATIC',
            id: 'template-2',
            quantity: 1,
            parameters: { A: 700, B: 300 }
          }]
        }
      }
    };
    const auth = { userId: 'user-1', organizationId: 'org-1', role: 'USER', memberships: [] };

    const jobFiles = await buildJobFiles(queue, auth);
    const request = buildNestingWorkerRequest(jobFiles);

    expect(bakeTemplateInstance).toHaveBeenCalledWith(expect.anything(), { A: 700, B: 300 }, 'user-1');
    expect(request.items).toHaveLength(1);
    expect(request.items[0]).toMatchObject({
      cassette_id: 'baked-2',
      handles: ['wp_1:C1'],
      sourceLayers: [
        {
          layer: 'fold.route',
          workpieceId: 'wp_1',
          coordinates: [[0, 0], [700, 0]],
          handles: ['wp_1:F1']
        }
      ]
    });
    expect(request.items[0].coords).toEqual([[0, 0], [700, 0], [700, 300], [0, 300], [0, 0]]);
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
            id: 'design-1',
            quantity: 2,
            parameters: {}
          }]
        }
      }
    };
    const auth = { userId: 'user-1', organizationId: 'org-1', role: 'USER', memberships: [] };

    const jobFiles = await buildJobFiles(queue, auth);
    const request = buildNestingWorkerRequest(jobFiles);

    expect(cassetteDesignService.getById).toHaveBeenCalledWith('design-1', 'user-1', 'USER', auth);
    expect(cassetteService.getById).not.toHaveBeenCalledWith('design-1', expect.anything(), expect.anything(), expect.anything(), expect.anything());
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
    ], { width: 300, height: 200 });
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
    ], { width: 100, height: 100, sheet_polygon: sheetPolygon });
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
    ]);
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
