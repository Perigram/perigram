import { describe, expect, it } from 'vitest';
import { composeSystemDeclarations, mountedPackDeclarations } from './declarations.js';
import { techDrawingPack } from '~/packages/tech-drawing/src/index.js';

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
