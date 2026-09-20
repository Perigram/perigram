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
    const original = mountedPackDeclarations.splice(0, 1);
    try {
      mountedPackDeclarations.push({ id: 'orphan', requires: ['tech-drawing'], types: [] });
      // tech-drawing removed, cnc now unsatisfied
      expect(() => composeSystemDeclarations()).toThrow(/requires unmounted pack tech-drawing/);
    } finally {
      mountedPackDeclarations.pop();
      mountedPackDeclarations.unshift(...original);
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
