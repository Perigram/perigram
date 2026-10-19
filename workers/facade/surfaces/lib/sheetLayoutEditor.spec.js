import { describe, expect, it } from 'vitest';
import {
  cassetteSheetItem,
  clampSheetPlacement,
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

  it('creates a sheet item from a cassette record with extracted geometry', () => {
    const item = cassetteSheetItem({
      _id: 'cassette-1',
      name: 'Panel',
      fields: {
        polygonParts: [{ layer: 'cut.outer', coordinates: [[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]] }],
        layerData: [{ layer: 'fold.route', coordinates: [[0, 5], [20, 5]] }]
      }
    }, 'manual-1');
    expect(item).toMatchObject({ id: 'manual-1', cassette_id: 'cassette-1', name: 'Panel' });
    expect(item.sourceLayers[0].layer).toBe('fold.route');
  });

  it('refuses a cassette record without extracted polygon geometry', () => {
    expect(cassetteSheetItem({ _id: 'cassette-2', name: 'Authored', fields: {} }, 'manual-2')).toBe(null);
  });
});
