import { describe, expect, it } from 'vitest';
import { composeSystemDeclarations, mountedPackDeclarations } from './declarations.js';
import { techDrawingPack } from '~/packages/tech-drawing/src/index.js';
import { createTypeRegistry, compileClientBundle } from '~/packages/cts/src/index.js';
import { resolveListControls } from '#shared/ui-mapping/index.js';

// Pack composition (SPEC §21 requirements): dependency order, uniqueness,
// loud failures.
describe('pack composition', () => {
  it('composes every mounted pack after its requirements', () => {
    const declarations = composeSystemDeclarations();
    const ids = declarations.map(type => type.id);
    expect(ids).toContain('pen-template');
    expect(ids).toContain('layer-standard');
    expect(ids).toContain('cassette');
    // tech-drawing declarations precede the requiring cnc pack's
    expect(ids.indexOf('pen-template')).toBeLessThan(ids.indexOf('cassette'));
  });

  it('declares a filterable motif on the facade-pattern system catalog', () => {
    // The motif enum rides the designer's node vocabulary, so generated
    // facade-pattern list surfaces derive a real multi-select facet over
    // live data (the seed script cycles these values into the §3 system
    // rows).
    const pattern = composeSystemDeclarations().find(type => type.id === 'facade-pattern');
    const registry = createTypeRegistry({ id: 'facade-motif-spec' });
    registry.defineType(pattern);
    const record = compileClientBundle(registry).types.find(type => type.id === 'facade-pattern');
    expect(record.fields.motif).toMatchObject({
      base: 'enum',
      values: ['grid', 'stagger', 'mesh', 'placements']
    });
    const controls = resolveListControls(record, [
      { fields: { motif: 'grid' } },
      { fields: { motif: 'grid' } },
      { fields: { motif: 'stagger' } }
    ]);
    expect(controls.facets).toEqual([{ name: 'motif', label: 'Motif', values: ['grid', 'stagger'] }]);
  });

  it('fails loudly on a missing requirement', () => {
    // Remove the tech-drawing pack itself (by id, not position — the
    // mounted order changes as packs are added): the requiring cnc pack
    // is now unsatisfied.
    const index = mountedPackDeclarations.findIndex(pack => pack.id === 'tech-drawing');
    const removed = mountedPackDeclarations.splice(index, 1);
    try {
      expect(() => composeSystemDeclarations()).toThrow(/requires unmounted pack tech-drawing/);
    } finally {
      mountedPackDeclarations.splice(index, 0, ...removed);
    }
  });

  it('fails loudly on inter-pack id collisions', () => {
    mountedPackDeclarations.push({ id: 'clone', requires: [], types: [techDrawingPack.types[0]] });
    try {
      expect(() => composeSystemDeclarations()).toThrow(/duplicate system type id pen-template/);
    } finally {
      mountedPackDeclarations.pop();
    }
  });
});
