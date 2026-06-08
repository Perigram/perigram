import { describe, expect, it } from 'vitest';
import { buildLayerPenMap } from './dxfParser.js';

describe('DXF layer pen mapping', () => {
  it('resolves canonical layer standard DTO fields', () => {
    const result = buildLayerPenMap(
      { SOURCE: 'fold.route' },
      [{ _id: 'std-fold', data: { code: 'fold.route', defaultPenId: 'pen-blue' } }],
      [{ _id: 'pen-blue', data: { stroke: { color: '#0000ff', weight: 0.25, pattern: 'DASHED' } } }]
    );

    expect(result.SOURCE?._id).toBe('pen-blue');
  });
});
