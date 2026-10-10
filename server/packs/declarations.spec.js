import { describe, expect, it } from 'vitest';
import { composeSystemDeclarations, mountedPackDeclarations } from './declarations.js';
import { techDrawingPack } from '~/packages/tech-drawing/src/index.js';

// Pack composition (SPEC §21 requirements): dependency order, uniqueness,
// loud failures.
describe('pack composition', () => {
  it('composes the mounted packs in mount order', () => {
    const declarations = composeSystemDeclarations();
    const ids = declarations.map(type => type.id);
    expect(ids).toContain('pen-template');
    expect(ids).toContain('layer-standard');
    expect(ids).toContain('dxf-source');
  });

  it('fails loudly on a missing requirement', () => {
    // No mounted pack currently declares requirements (the facade, the
    // only one, became a plugin) — synthesize the graph to hold the law.
    mountedPackDeclarations.push({
      id: 'requiring',
      requires: ['tech-drawing'],
      types: [{ id: 'requiring-type', class: 'item', fields: {} }]
    });
    const index = mountedPackDeclarations.findIndex(pack => pack.id === 'tech-drawing');
    const removed = mountedPackDeclarations.splice(index, 1);
    try {
      expect(() => composeSystemDeclarations()).toThrow(/requires unmounted pack tech-drawing/);
    } finally {
      mountedPackDeclarations.splice(index, 0, ...removed);
      mountedPackDeclarations.pop();
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
