import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { OCCS_LAYER_STANDARDS } from '../workers/facade/occs/layerStandards.js';

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
});
