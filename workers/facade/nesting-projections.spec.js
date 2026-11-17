import { describe, expect, it } from 'vitest';
import {
  buildValueWorkerRequest,
  enrichNestingResult,
  groupNestingLayouts,
  nestingLayouts,
  nestingPartsProjection,
  normalizeNestingItems,
  summarizeNestingResult
} from './nesting-projections.js';

// The lbf worker's response shape (worker_service.py passes the solution
// file through): placements live under `solution.layouts`.
const workerResult = {
  items: [{ id: 0, shape: { type: 'simple_polygon', data: [[0, 0], [400, 0], [400, 300], [0, 300]] } }],
  bins: [{ id: 0, shape: { type: 'polygon', data: { outer: [[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]], inner: [] } } }],
  solution: {
    cost: 1,
    density: 0.2485,
    layouts: [{
      container_id: 0,
      density: 0.2485,
      placed_items: [
        { item_id: 0, transformation: { rotation: 0, translation: [0, 0] } },
        { item_id: 0, transformation: { rotation: 0, translation: [400, 0] } }
      ]
    }]
  }
};

const request = {
  items: [{ id: 0, design_id: 'c1', coords: [[0, 0], [400, 0], [400, 300], [0, 300]], handles: [], sourceLayers: [], count: 2 }],
  params: { width: 1000, height: 1000, space: 3, sheetCount: 1 }
};

describe('nesting input normalization', () => {
  it('defaults missing quantities and copies valid integer quantities', () => {
    const source = Object.freeze({ count: '3', designId: 'design-1' });
    const [normalized] = normalizeNestingItems([source]);
    expect(normalized).toEqual({ count: 3, designId: 'design-1' });
    expect(normalized).not.toBe(source);
    expect(normalizeNestingItems([{}])[0].count).toBe(1);
    expect(() => normalizeNestingItems([{ count: 0 }])).toThrow(/positive safe integer/);
  });

  it('normalizes the legacy quantity alias and validates aggregate helpers', () => {
    expect(normalizeNestingItems([{ quantity: '2' }])[0].count).toBe(2);
    expect(() => nestingSheetCount([{ count: 1.5 }])).toThrow(/positive safe integer/);
    expect(() => buildValueWorkerRequest([{
      count: 1.5,
      polygonParts: [{ coordinates: [[0, 0], [10, 0], [10, 10], [0, 10]] }]
    }], { width: 100, height: 100, space: 3, sheetCount: 1 }))
      .toThrow(/positive safe integer/);
  });

  it.each([0.5, 1.2, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, true])(
    'rejects invalid physical quantity %s',
    count => expect(() => normalizeNestingItems([{ count }])).toThrow(/positive safe integer/)
  );
});

describe('nesting projections', () => {
  it('exposes the worker solution layouts as the value boundary layouts', () => {
    const enriched = enrichNestingResult(workerResult, request);
    const layouts = nestingLayouts(enriched);
    expect(layouts).toHaveLength(1);
    expect(layouts[0].placed_items).toHaveLength(2);
    expect(summarizeNestingResult(enriched, request.params)).toMatchObject({ sheetCount: 1, placedCount: 2 });
  });

  it('ships each layout self-contained for sheet construction', () => {
    const layouts = nestingLayouts(enrichNestingResult(workerResult, request));
    expect(layouts[0].sourceItems).toHaveLength(1);
    expect(layouts[0].sourceItems[0]).toMatchObject({ id: 0, design_id: 'c1' });
    expect(layouts[0].sheetPolygon).toEqual(workerResult.bins[0].shape.data);
  });
});

describe('quantity join over solved layouts', () => {
  const layoutOver = (containerId, placements) => ({
    container_id: containerId,
    density: 0.25,
    placed_items: placements
  });

  it('joins layouts with the same design composition on the same sheet', () => {
    const enriched = enrichNestingResult({
      ...workerResult,
      solution: {
        ...workerResult.solution,
        layouts: [
          layoutOver(0, [
            { item_id: 0, transformation: { rotation: 0, translation: [0, 0] } },
            { item_id: 0, transformation: { rotation: 0, translation: [400, 0] } }
          ]),
          layoutOver(0, [
            { item_id: 0, transformation: { rotation: 90, translation: [20, 5] } },
            { item_id: 0, transformation: { rotation: 90, translation: [420, 5] } }
          ])
        ]
      }
    }, request);
    const grouped = groupNestingLayouts(enriched);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(2);
    expect(grouped[0].placed_items).toHaveLength(2);
    expect(grouped[0].compositionKey).toBeTruthy();
  });

  it('keeps the same design composition on a different sheet apart', () => {
    const enriched = enrichNestingResult({
      ...workerResult,
      bins: [
        workerResult.bins[0],
        { id: 1, shape: { type: 'polygon', data: { outer: [[0, 0], [500, 0], [500, 500], [0, 500], [0, 0]], inner: [] } } }
      ],
      solution: {
        ...workerResult.solution,
        layouts: [
          layoutOver(0, [{ item_id: 0, transformation: { rotation: 0, translation: [0, 0] } }]),
          layoutOver(1, [{ item_id: 0, transformation: { rotation: 0, translation: [0, 0] } }])
        ]
      }
    }, request);
    const grouped = groupNestingLayouts(enriched);
    expect(grouped).toHaveLength(2);
    expect(grouped.every(layout => layout.count === 1)).toBe(true);
  });

  it('groups equivalent design compositions by their design key', () => {
    const enriched = enrichNestingResult({
      items: [
        { id: 0, design_id: 'design-a', design_key: 'tray|600|450', shape: { type: 'simple_polygon', data: [[0, 0], [400, 0], [400, 300], [0, 300]] } },
        { id: 1, design_id: 'design-b', design_key: 'tray|600|450', shape: { type: 'simple_polygon', data: [[0, 0], [400, 0], [400, 300], [0, 300]] } }
      ],
      bins: workerResult.bins,
      solution: {
        cost: 2,
        density: 0.25,
        layouts: [
          layoutOver(0, [{ item_id: 0, transformation: { rotation: 0, translation: [0, 0] } }]),
          layoutOver(0, [{ item_id: 1, transformation: { rotation: 0, translation: [0, 0] } }])
        ]
      }
    }, request);
    const grouped = groupNestingLayouts(enriched);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(2);
  });

  it('keeps layouts cutting different design multisets apart', () => {
    const enriched = enrichNestingResult({
      items: [
        ...workerResult.items,
        { id: 1, design_id: 'c2', shape: { type: 'simple_polygon', data: [[0, 0], [100, 0], [100, 100], [0, 100]] } }
      ],
      bins: workerResult.bins,
      solution: {
        cost: 2,
        density: 0.25,
        layouts: [
          layoutOver(0, [{ item_id: 0, transformation: { rotation: 0, translation: [0, 0] } }]),
          layoutOver(0, [{ item_id: 1, transformation: { rotation: 0, translation: [0, 0] } }])
        ]
      }
    }, request);
    const grouped = groupNestingLayouts(enriched);
    expect(grouped).toHaveLength(2);
    expect(grouped.every(layout => layout.count === 1)).toBe(true);
  });
});

describe('nesting parts projection', () => {
  const geometry = {
    nestingPolygons: [
      { coordinates: [[0, 0], [100, 0], [100, 50], [0, 50]], workpieceId: 'wp_1' },
      { coordinates: [[0, 0], [50, 0], [50, 20], [0, 20]], workpieceId: 'wp_2' }
    ],
    layerData: [
      { layer: 'cut.outer', workpieceId: 'wp_1', coordinates: [[0, 0], [100, 0]] },
      { layer: 'fold.route', workpieceId: 'wp_2', coordinates: [[0, 0], [50, 0]] },
      { layer: 'code.cassette_mark', coordinates: [[1, 1]] }
    ]
  };

  it('rides each part with its workpiece layers, workpiece-free layers included', () => {
    const parts = nestingPartsProjection(geometry);
    expect(parts[0].sourceLayers.map(layer => layer.layer)).toEqual(['cut.outer', 'code.cassette_mark']);
    expect(parts[1].sourceLayers.map(layer => layer.layer)).toEqual(['fold.route', 'code.cassette_mark']);
  });

  it('builds solve items from part-carried layers', () => {
    const request = buildValueWorkerRequest([
      { polygonParts: nestingPartsProjection(geometry), count: 1 }
    ], { width: 1000, height: 1000, space: 3, sheetCount: 1 });
    expect(request.items).toHaveLength(2);
    expect(request.items[0].sourceLayers.map(layer => layer.layer)).toEqual(['cut.outer', 'code.cassette_mark']);
    expect(request.items[1].sourceLayers.map(layer => layer.layer)).toEqual(['fold.route', 'code.cassette_mark']);
  });

  it('reads the design key and geometry off an element item', () => {
    const element = {
      _id: 'design-7',
      fields: { geometry: { nestingPolygons: geometry.nestingPolygons, layerData: geometry.layerData } }
    };
    const request = buildValueWorkerRequest([element], { width: 1000, height: 1000, space: 3, sheetCount: 1 });
    expect(request.items).toHaveLength(2);
    expect(request.items.map(item => item.design_id)).toEqual(['design-7', 'design-7']);
  });

  it('keys each part by the design id the projection stamped on it', () => {
    const request = buildValueWorkerRequest([{
      polygonParts: [
        { coordinates: [[0, 0], [100, 0], [100, 50], [0, 50]], designId: 'design-a' },
        { coordinates: [[0, 0], [50, 0], [50, 20], [0, 20]], designId: 'design-b' }
      ],
      count: 1
    }], { width: 1000, height: 1000, space: 3, sheetCount: 1 });
    expect(request.items.map(item => item.design_id)).toEqual(['design-a', 'design-b']);
  });

  it('nests id-less geometry under the anonymous design key', () => {
    const request = buildValueWorkerRequest([
      { polygonParts: [{ coordinates: [[0, 0], [100, 0], [100, 50], [0, 50]] }], count: 2 }
    ], { width: 1000, height: 1000, space: 3, sheetCount: 1 });
    expect(request.items).toHaveLength(1);
    expect(request.items[0].design_id).toBe('');
    expect(request.items[0].count).toBe(2);
  });

  it('nests a single part object — the shape a flatten over one part produces', () => {
    const request = buildValueWorkerRequest([
      { polygonParts: { coordinates: [[0, 0], [100, 0], [100, 50], [0, 50]], sourceLayers: [] }, count: 1 }
    ], { width: 1000, height: 1000, space: 3, sheetCount: 1 });
    expect(request.items).toHaveLength(1);
    expect(request.items[0].coords).toEqual([[0, 0], [100, 0], [100, 50], [0, 50]]);
  });
});

describe('quantity join keeps anonymous solves', () => {
  it('groups id-less layouts instead of dropping them', () => {
    const enriched = enrichNestingResult({
      items: [{ id: 0, design_id: '', shape: { type: 'simple_polygon', data: [[0, 0], [100, 0], [100, 100], [0, 100]] } }],
      bins: [{ id: 0, shape: { type: 'polygon', data: { outer: [[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]], inner: [] } } }],
      solution: {
        cost: 1,
        layouts: [{ container_id: 0, placed_items: [{ item_id: 0, transformation: { rotation: 0, translation: [0, 0] } }] }]
      }
    }, {
      items: [{ id: 0, design_id: '', coords: [[0, 0], [100, 0], [100, 100], [0, 100]], handles: [], sourceLayers: [], count: 1 }],
      params: { width: 1000, height: 1000, space: 3, sheetCount: 1 }
    });
    const grouped = groupNestingLayouts(enriched);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(1);
    expect(grouped[0].placed_items).toHaveLength(1);
  });
});
