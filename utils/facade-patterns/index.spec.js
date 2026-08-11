import { describe, expect, it } from 'vitest';
import { evaluateFacadeGrid, validateFacadePatternGraph } from './index.js';

describe('facade patterns', () => {
  it('rejects invalid and cyclic graph documents', () => {
    expect(validateFacadePatternGraph({ schemaVersion: 1, nodes: [{ id: 'a', type: 'grid' }], edges: [{ source: 'a', target: 'missing' }] })).toContain('Facade pattern graph edges must connect existing nodes');
    expect(validateFacadePatternGraph({ schemaVersion: 1, nodes: [{ id: 'a', type: 'grid' }, { id: 'b', type: 'placements' }], edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }] })).toContain('Facade pattern graph must be acyclic');
  });
  it('generates stable rectangular and staggered placements', () => {
    expect(evaluateFacadeGrid({ width: 20, height: 10, cellWidth: 10, cellHeight: 10 })).toHaveLength(2);
    expect(evaluateFacadeGrid({ width: 20, height: 20, cellWidth: 10, cellHeight: 10, stagger: true }).map(item => item.id)).toEqual(['r0c0', 'r0c1', 'r1c0']);
  });
});
