import { describe, expect, it } from 'vitest';
import { nestingPartsProjection, stableSheetName } from './nesting-projections.js';

describe('Facade geometry adapter for Nesting', () => {
  it('joins workpiece layers to the polygon parts that own them', () => {
    const result = nestingPartsProjection({
      nestingPolygons: [
        { workpieceId: 'face-a', coordinates: [[0, 0], [10, 0], [10, 10]] },
        { workpieceId: 'face-b', coordinates: [[20, 0], [30, 0], [30, 10]] }
      ],
      layerData: [
        { workpieceId: 'face-a', layer: 'cut.outer' },
        { workpieceId: 'face-b', layer: 'fold.route' },
        { layer: 'shared' }
      ]
    });
    expect(result.map(part => part.sourceLayers.map(layer => layer.layer))).toEqual([
      ['cut.outer', 'shared'],
      ['fold.route', 'shared']
    ]);
  });

  it('keeps sheet naming in the Facade domain', () => {
    expect(stableSheetName({ compositionKey: 'same-layout' })).toBe(stableSheetName({ compositionKey: 'same-layout' }));
    expect(stableSheetName(null, { data: { name: 'Authored sheet' } })).toBe('Authored sheet');
  });
});
