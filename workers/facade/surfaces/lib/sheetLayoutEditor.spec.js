import { describe, expect, it } from 'vitest';
import {
  cassetteSheetItems,
  clampSheetPlacement,
  freeSheetPlacement,
  magneticSheetPlacement,
  placementHasClearance,
  rotateSheetPlacementQuarterTurn,
  sheetItemBounds,
  sheetLayoutState,
  sheetPlacementTransform,
  snapSheetCoordinate
} from './sheetLayoutEditor.js';

describe('sheet layout editor helpers', () => {
  it('reads the first physical layout', () => {
    const state = sheetLayoutState({
      fields: { geometry: { data: {
        items: [{ id: 1 }],
        solution: { layouts: [{ placed_items: [{ item_id: 1 }] }] }
      } } }
    });
    expect(state).toEqual({ items: [{ id: 1 }], placedItems: [{ item_id: 1 }] });
    expect(snapSheetCoordinate(13, 5)).toBe(15);
  });

  it('converts radians to SVG degrees', () => {
    expect(sheetPlacementTransform({ transformation: { translation: [10, 20], rotation: Math.PI / 2 } }))
      .toEqual({ x: 10, y: 20, rotation: 90 });
  });

  it('keeps the complete rotated cassette inside the usable sheet boundary', () => {
    const item = {
      shape: { data: [[0, 0], [40, 0], [40, 20], [0, 20], [0, 0]] }
    };
    const bounds = sheetItemBounds(item, 90);
    expect(bounds.minX).toBeCloseTo(-20);
    expect(bounds.minY).toBeCloseTo(0);
    expect(bounds.maxX).toBeCloseTo(0);
    expect(bounds.maxY).toBeCloseTo(40);
    expect(clampSheetPlacement({
      x: 3,
      y: 88,
      item,
      rotation: 90,
      sheetWidth: 100,
      sheetHeight: 100,
      boundaryOffset: 5
    })).toEqual({ x: 25, y: 55 });
  });

  it('snaps cassette bounds at exact kerf clearance without using a grid', () => {
    const items = [{ id: 1, shape: { data: [[0, 0], [20, 0], [20, 10], [0, 10]] } }];
    const placements = [
      { item_id: 1, transformation: { rotation: 0, translation: [10, 10] } },
      { item_id: 1, transformation: { rotation: 0, translation: [33, 10] } }
    ];
    const snapped = magneticSheetPlacement({ items, placements, index: 1, x: 31, y: 11, sheetWidth: 100, sheetHeight: 100, clearance: 3 });
    expect(snapped).toMatchObject({ x: 33, y: 11, snapped: true });
    expect(placementHasClearance({ items, placements, placement: { item_id: 1, transformation: { rotation: 0, translation: [33, 10] } }, index: 1, clearance: 3 })).toBe(true);
  });

  it('preserves the dragged axis when only one edge is near snapping distance', () => {
    const items = [{ id: 1, shape: { data: [[0, 0], [20, 0], [20, 10], [0, 10]] } }];
    const placements = [
      { item_id: 1, transformation: { rotation: 0, translation: [10, 10] } },
      { item_id: 1, transformation: { rotation: 0, translation: [31, 40] } }
    ];
    const snapped = magneticSheetPlacement({ items, placements, index: 1, x: 31, y: 40, sheetWidth: 100, sheetHeight: 100, clearance: 3 });
    expect(snapped).toMatchObject({ x: 33, y: 40, snapped: true });
  });

  it('snaps transformed polygon edges one kerf apart on angled contours', () => {
    const items = [{ id: 1, shape: { data: [[0, 0], [30, 30], [20, 40], [-10, 10]] } }];
    const placements = [
      { item_id: 1, transformation: { rotation: 0, translation: [40, 20] } },
      { item_id: 1, transformation: { rotation: 0, translation: [62, 20] } }
    ];
    const snapped = magneticSheetPlacement({
      items,
      placements,
      index: 1,
      x: 64,
      y: 18,
      sheetWidth: 200,
      sheetHeight: 120,
      clearance: 5,
      threshold: 20
    });
    expect(snapped.snapped).toBe(true);
    expect(placementHasClearance({
      items,
      placements,
      placement: { item_id: 1, transformation: { rotation: 0, translation: [snapped.x, snapped.y] } },
      index: 1,
      clearance: 5
    })).toBe(true);
  });

  it('clamps placements into a non-rectangular usable sheet polygon', () => {
    const item = { shape: { data: [[0, 0], [20, 0], [20, 20], [0, 20]] } };
    const sheetPolygon = [[0, 0], [100, 0], [100, 50], [50, 100], [0, 50]];
    const clamped = clampSheetPlacement({
      x: 80,
      y: 80,
      item,
      sheetWidth: 100,
      sheetHeight: 100,
      sheetPolygon
    });
    expect(clamped.x).toBeLessThan(80);
    expect(clamped.y).toBeLessThan(80);
    expect(placementHasClearance({
      items: [{ id: 1, ...item }],
      placements: [{ item_id: 1, transformation: { rotation: 0, translation: [clamped.x, clamped.y] } }],
      placement: { item_id: 1, transformation: { rotation: 0, translation: [clamped.x, clamped.y] } },
      index: 0
    })).toBe(true);
  });

  it('checks transformed polygon clearance instead of rejecting all overlapping bounds', () => {
    const items = [
      { id: 'l', shape: { data: [[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30]] } },
      { id: 'square', shape: { data: [[0, 0], [10, 0], [10, 10], [0, 10]] } }
    ];
    const placements = [
      { item_id: 'l', transformation: { rotation: 0, translation: [0, 0] } },
      { item_id: 'square', transformation: { rotation: 0, translation: [20, 20] } }
    ];
    expect(placementHasClearance({ items, placements, placement: placements[1], index: 1, clearance: 5 })).toBe(true);
    expect(placementHasClearance({ items, placements, placement: placements[1], index: 1, clearance: 12 })).toBe(false);
  });

  it('rejects polygon intersections even when zero clearance is allowed', () => {
    const items = [{ id: 1, shape: { data: [[0, 0], [20, 0], [20, 20], [0, 20]] } }];
    const placements = [
      { item_id: 1, transformation: { rotation: 0, translation: [0, 0] } },
      { item_id: 1, transformation: { rotation: 0, translation: [10, 10] } }
    ];
    expect(placementHasClearance({ items, placements, placement: placements[1], index: 1, clearance: 0 })).toBe(false);
  });

  it('rotates in worker radians and returns to the original rotation after four turns', () => {
    const items = [{ id: 1, shape: { data: [[0, 0], [20, 0], [20, 10], [0, 10]] } }];
    let placements = [{ item_id: 1, transformation: { rotation: 0, translation: [10, 10] } }];
    for (let turn = 0; turn < 4; turn += 1) {
      placements = [rotateSheetPlacementQuarterTurn({ items, placements, index: 0, sheetWidth: 100, sheetHeight: 100 })];
    }
    expect(placements[0].transformation.rotation).toBeCloseTo(0);
  });

  it('creates sheet items from a cassette record with extracted geometry', () => {
    const items = cassetteSheetItems({
      _id: 'cassette-1',
      name: 'Panel',
      fields: {
        polygonParts: [
          { layer: 'cut.outer', workpieceId: 'wp-a', coordinates: [[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]] },
          { layer: 'cut.outer', workpieceId: 'wp-b', coordinates: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] }
        ],
        layerData: [
          { layer: 'fold.route', workpieceId: 'wp-a', coordinates: [[0, 5], [20, 5]] },
          { layer: 'fold.route', workpieceId: 'wp-b', coordinates: [[0, 5], [10, 5]] }
        ]
      }
    }, 'manual-1');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'manual-1-0', cassette_id: 'cassette-1', name: 'Panel 1' });
    expect(items[0].sourceLayers).toHaveLength(1);
    expect(items[0].sourceLayers[0].layer).toBe('fold.route');
    expect(items[1].sourceLayers[0].coordinates).toEqual([[0, 5], [10, 5]]);
  });

  it('refuses a cassette record without extracted polygon geometry', () => {
    expect(cassetteSheetItems({ _id: 'cassette-2', name: 'Authored', fields: {} }, 'manual-2')).toEqual([]);
  });

  it('places a new item at the first free sweep position', () => {
    const existing = { id: 'a', shape: { data: [[0, 0], [100, 0], [100, 100], [0, 100]] } };
    const item = { id: 'b', shape: { data: [[0, 0], [40, 0], [40, 40], [0, 40]] } };
    const placements = [{ item_id: 'a', transformation: { rotation: 0, translation: [0, 0] } }];
    const placed = freeSheetPlacement({
      item,
      items: [existing],
      placements,
      sheetWidth: 200,
      sheetHeight: 200,
      clearance: 5,
      boundaryOffset: 5,
      step: 10
    });
    const candidate = { item_id: 'b', transformation: { rotation: 0, translation: [placed.x, placed.y] } };
    expect(placementHasClearance({ items: [existing, item], placements, placement: candidate, clearance: 5 })).toBe(true);
    expect(placed.x).toBeGreaterThanOrEqual(5);
    expect(placed.y).toBeGreaterThanOrEqual(5);
  });

  it('keeps an already-overlapping placement draggable so it can be pulled out', () => {
    const items = [{ id: 1, shape: { data: [[0, 0], [20, 0], [20, 10], [0, 10]] } }];
    const overlapping = [
      { item_id: 1, transformation: { rotation: 0, translation: [0, 0] } },
      { item_id: 1, transformation: { rotation: 0, translation: [5, 0] } }
    ];
    const escaped = magneticSheetPlacement({ items, placements: overlapping, index: 1, x: 60, y: 60, sheetWidth: 100, sheetHeight: 100 });
    expect(escaped).toMatchObject({ x: 60, y: 60, snapped: false });
  });

  it('refuses a clear placement dragged into overlap', () => {
    const items = [{ id: 1, shape: { data: [[0, 0], [20, 0], [20, 10], [0, 10]] } }];
    const placements = [
      { item_id: 1, transformation: { rotation: 0, translation: [0, 0] } },
      { item_id: 1, transformation: { rotation: 0, translation: [30, 0] } }
    ];
    const result = magneticSheetPlacement({ items, placements, index: 1, x: 14, y: 0, sheetWidth: 100, sheetHeight: 100, threshold: 0 });
    expect(result === null || result.x >= 20).toBe(true);
  });
});
