import { describe, expect, it } from 'vitest';
import {
  OCCS_LAYER_STANDARDS, OCCS_DEFAULT_PEN, applyOccsLayerPens, occsLayerStandard, penForLayer
} from './layerStandards.js';
import { OCCS_LAYER_CODES } from './layers.js';

// The layer standards the plugin ships (owner direction 2026-10-11): the
// runtime table mirrors the spec registry and the historical system pen
// set. These pins refuse drift of the vocabulary and the pens the editor
// and previews render with; the registry sync itself is pinned repo-side
// (shared/facade-layer-standards.spec.js) because reading the platform's
// spec docs from the plugin tree would break its self-containedness.
describe('occs layer standards', () => {
  it('covers every layer code the engine declares', () => {
    for (const code of Object.values(OCCS_LAYER_CODES)) {
      expect(occsLayerStandard(code), code).toBeTruthy();
    }
  });

  it('carries the historical system pens', () => {
    expect(penForLayer('cut.outer')).toEqual({ color: '#DC2626', weight: 0.6, pattern: 'SOLID' });
    expect(penForLayer('cut.inner')).toEqual({ color: '#F97316', weight: 0.45, pattern: 'SOLID' });
    expect(penForLayer('fold.route')).toEqual({ color: '#D97706', weight: 0.35, pattern: 'DASHED' });
    expect(penForLayer('contour.cassette_face')).toEqual({ color: '#2563EB', weight: 0.35, pattern: 'SOLID' });
    expect(penForLayer('code.cassette_mark')).toEqual({ color: '#16A34A', weight: 0.35, pattern: 'SOLID' });
    expect(penForLayer('dimension.cassette')).toEqual({ color: '#7C3AED', weight: 0.25, pattern: 'DOTTED' });
    expect(penForLayer('unknown.layer')).toEqual(OCCS_DEFAULT_PEN);
  });

  it('bakes standard pens into drawings and leaves unknown layers alone', () => {
    const styled = applyOccsLayerPens({
      viewBox: '0 0 10 10',
      layers: [
        { name: 'cut.outer', standardCode: 'cut.outer', color: 'currentColor', weight: 1, dasharray: 'none', paths: [] },
        { name: 'construction.nodi', color: 'currentColor', weight: 0.5, dasharray: '5,5', paths: [] }
      ]
    });
    expect(styled.layers[0]).toMatchObject({ color: '#DC2626', weight: 0.6, dasharray: 'none' });
    expect(styled.layers[1]).toMatchObject({ color: 'currentColor', weight: 0.5, dasharray: '5,5' });
  });
});
