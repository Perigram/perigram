import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { OCCS_LAYER_STANDARDS, occsLayerExportName } from '../workers/facade/occs/layerStandards.js';

// Repo-side sync pin: the facade plugin's runtime layer-standard table
// mirrors the spec registry (docs/specs/Cassette spec/layers.json). The
// plugin tree cannot read the platform's spec docs (self-containedness),
// so the drift guard lives here with the other static-boundary specs.
describe('facade plugin layer standards vs the spec registry', () => {
  it('covers every registry layer exactly', () => {
    const registry = JSON.parse(readFileSync(new URL('../docs/specs/Cassette spec/layers.json', import.meta.url), 'utf8'));
    const registryCodes = registry.layers.map(layer => layer.id).sort();
    const tableCodes = OCCS_LAYER_STANDARDS.map(standard => standard.code).sort();
    expect(tableCodes).toEqual(registryCodes);
  });

  it('carries every registry production name, with defaults matching the registry', () => {
    const registry = JSON.parse(readFileSync(new URL('../docs/specs/Cassette spec/layers.json', import.meta.url), 'utf8'));
    for (const layer of registry.layers) {
      const standard = OCCS_LAYER_STANDARDS.find(item => item.code === layer.id);
      expect(standard?.exportName, layer.id).toBe(layer.defaultExport?.dxfLayer ?? '');
      expect(occsLayerExportName(layer.id), layer.id).toBe(layer.defaultExport?.dxfLayer ?? '');
    }
  });

  it('interpolates parametric suffixes over the pinned defaults', () => {
    expect(occsLayerExportName('cut.outer')).toBe('2_1_Обрезь_3,15');
    expect(occsLayerExportName('cut.outer', { diameter: '6' })).toBe('2_1_Обрезь_6');
    expect(occsLayerExportName('cut.hole', { diameter: '8' })).toBe('2_2_Отверстие_8');
    expect(occsLayerExportName('fold.route', { angle: '45' })).toBe('3_1_Фрезеровка_45');
    expect(occsLayerExportName('not.a.layer')).toBe('not.a.layer');
  });
});
