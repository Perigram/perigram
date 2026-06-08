import { describe, expect, it } from 'vitest';
import { createDefaultOccsCassetteTemplateDefinition } from './templates.js';
import { evaluateOccsCassetteTemplate } from './evaluate.js';

describe('OCCS cassette evaluation', () => {
  it('evaluates a graph-tree OCCS template into cut polygons for nesting', async () => {
    const result = await evaluateOccsCassetteTemplate(createDefaultOccsCassetteTemplateDefinition(), {
      A: 700,
      B: 300,
      R: 40
    });

    expect(result.dimensions).toMatchObject({ A: 700, B: 300, R: 40 });
    expect(result.annotations.dimensions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        layer: 'dimension.cassette',
        value: expect.objectContaining({ mode: 'measured', value: 700 })
      }),
      expect.objectContaining({
        layer: 'dimension.cassette',
        value: expect.objectContaining({ mode: 'measured', value: 300 })
      })
    ]));
    expect(result.layerData.some(item => item.layer === 'dimension.cassette')).toBe(true);
    expect(result.nestingPolygons).toHaveLength(1);
    const xs = result.nestingPolygons[0].coordinates.map(point => point[0]);
    const ys = result.nestingPolygons[0].coordinates.map(point => point[1]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 700]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, 300]);
  });
});
