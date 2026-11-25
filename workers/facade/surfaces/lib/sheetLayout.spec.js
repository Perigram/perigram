import { describe, expect, it } from 'vitest';
import { nestingResultToPreview, sheetDesignParts } from './sheetLayout.js';
import { occsLayerExportName } from '../../occs/layerStandards.js';

// The nesting redraw names standard layers through the registry (the
// production-naming law): name is the export name, standardCode the key.
describe('nesting redraw preview layers', () => {
  const result = {
    items: [{
      id: 0,
      design_id: 'c1',
      shape: { type: 'simple_polygon', data: [[0, 0], [300, 0], [300, 300], [0, 300]] },
      sourceLayers: [{ layer: 'cut.outer', coordinates: [[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]] }]
    }],
    bins: [{ id: 0, shape: { type: 'polygon', data: { outer: [[0, 0], [1220, 0], [1220, 2440], [0, 2440], [0, 0]], inner: [] } } }],
    solution: { layouts: [{ container_id: 0, placed_items: [{ item_id: 0, transformation: { rotation: 0, translation: [0, 0] } }] }] }
  };

  it('carries export names as display names, standardCode as the semantic key', () => {
    const preview = nestingResultToPreview(result, { width: 1220, height: 2440 }, { layoutIndex: 0 });
    const placed = preview.layers.find(layer => layer.standardCode === 'cut.outer');
    expect(placed?.name).toBe(occsLayerExportName('cut.outer'));
    const sheet = preview.layers.find(layer => layer.standardCode === 'contour.material_sheet');
    expect(sheet?.name).toBe(occsLayerExportName('contour.material_sheet'));
    expect(preview.layers.every(layer => layer.name !== layer.standardCode || !layer.name.includes('.'))).toBe(true);
  });

  it('lists each placed design once in the parts relation', () => {
    const placed = {
      items: [
        { id: 0, design_id: 'c1' },
        { id: 1, design_id: 'c1' },
        { id: 2, design_id: 'c2' }
      ],
      solution: { layouts: [{ placed_items: [{ item_id: 0 }, { item_id: 1 }, { item_id: 2 }] }] }
    };
    expect(sheetDesignParts(placed).map(part => part.id)).toEqual(['c1', 'c2']);
  });
});
