import { describe, expect, it } from 'vitest';
import { composeSystemDeclarations, mountedPackDeclarations } from './declarations.js';

// Pack composition (SPEC §21 requirements): dependency order, uniqueness,
// loud failures. The mounted set is the documents pack alone (tech-drawing
// retired into its plugin, owner decision 2026-10-17); the laws stay
// exercised through synthesized mounts.
describe('pack composition', () => {
  it('composes the mounted packs in mount order', () => {
    const declarations = composeSystemDeclarations();
    const ids = declarations.map(type => type.id);
    expect(ids).toContain('text-document');
    expect(ids).toContain('csv-table');
  });

  it('fails loudly on a missing requirement', () => {
    // No mounted pack currently declares requirements (tech-drawing and
    // the facade both became plugins) — synthesize the graph to hold the
    // law.
    mountedPackDeclarations.push({
      id: 'requiring',
      requires: ['unmounted-pack'],
      types: [{ id: 'requiring-type', class: 'item', fields: {} }]
    });
    try {
      expect(() => composeSystemDeclarations()).toThrow(/requires unmounted pack unmounted-pack/);
    } finally {
      mountedPackDeclarations.pop();
    }
  });

  it('fails loudly on inter-pack id collisions', () => {
    mountedPackDeclarations.push({
      id: 'clone',
      requires: [],
      types: [{ ...composeSystemDeclarations()[0] }]
    });
    try {
      expect(() => composeSystemDeclarations()).toThrow(/duplicate system type id/);
    } finally {
      mountedPackDeclarations.pop();
    }
  });
});
