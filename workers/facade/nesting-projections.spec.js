import { describe, expect, it } from 'vitest';
import {
  buildValueWorkerRequest,
  enrichNestingResult,
  nestingLayouts,
  nestingPartsProjection,
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
  items: [{ id: 0, cassette_id: 'c1', coords: [[0, 0], [400, 0], [400, 300], [0, 300]], handles: [], sourceLayers: [], count: 2 }],
  params: { width: 1000, height: 1000, space: 3, sheetCount: 1 }
};

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
    expect(layouts[0].sourceItems[0]).toMatchObject({ id: 0, cassette_id: 'c1' });
    expect(layouts[0].sheetPolygon).toEqual(workerResult.bins[0].shape.data);
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
});
