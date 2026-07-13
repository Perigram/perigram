import { describe, expect, it } from 'vitest';
import {
  cassetteDesignSheetItem,
  clampSheetPlacement,
  rotateSheetPlacement90,
  sheetItemBounds,
  sheetLayoutState,
  sheetPlacementTransform,
  snapSheetPlacementToNeighbors,
  snapSheetCoordinate
} from './sheetLayoutEditor.js';

describe('sheet layout editor helpers', () => {
  it('reads the first physical layout and snaps coordinates', () => {
    const state = sheetLayoutState({
      data: { geometry: { data: {
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

  it('keeps the complete rotated cassette inside the sheet boundary', () => {
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
      snap: 5
    })).toEqual({ x: 20, y: 60 });
  });

  it('snaps cassette edges to neighboring cassettes with the tool gap', () => {
    const item = { shape: { data: [[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]] } };
    const snapped = snapSheetPlacementToNeighbors({
      x: 26,
      y: 0,
      item,
      placements: [
        { item_id: 'moving', transformation: { translation: [26, 0], rotation: 0 } },
        { item_id: 'fixed', transformation: { translation: [0, 0], rotation: 0 } }
      ],
      items: [{ ...item, id: 'moving' }, { ...item, id: 'fixed' }],
      currentIndex: 0,
      gap: 5
    });
    expect(snapped).toMatchObject({ x: 25, y: 0, snappedX: true });
  });

  it('rotates placements by exactly 90 degrees', () => {
    expect(sheetPlacementTransform(rotateSheetPlacement90({
      transformation: { translation: [10, 20], rotation: 0 }
    }))).toEqual({ x: 10, y: 20, rotation: 90 });
  });

  it('creates a nesting source item from uploaded cassette geometry', () => {
    const item = cassetteDesignSheetItem({
      _id: 'design-1',
      identity: { name: 'Panel' },
      data: {
        polygonParts: [{ layer: 'cut.outer', coordinates: [[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]] }],
        layerData: [{ layer: 'fold.route', coordinates: [[0, 5], [20, 5]] }]
      }
    }, 'manual-1');
    expect(item).toMatchObject({ id: 'manual-1', cassette_id: 'design-1', name: 'Panel' });
    expect(item.sourceLayers[0].layer).toBe('fold.route');
  });
});
