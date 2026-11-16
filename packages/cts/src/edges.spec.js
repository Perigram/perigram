import { describe, expect, it } from 'vitest';
import { normalizeEdges } from './edges.js';

describe('CTS relation edge cardinality', () => {
  it('normalizes omitted explicit relation cardinality to many', () => {
    expect(normalizeEdges({
      relations: { parts: { types: ['part'] } }
    }, 'assembly').relations.parts.cardinality).toBe('many');
  });

  it('preserves the one and many cardinalities', () => {
    const edges = normalizeEdges({
      relations: {
        owner: { types: ['user'], cardinality: 'one' },
        parts: { types: ['part'], cardinality: 'many' }
      }
    }, 'assembly');
    expect(edges.relations.owner.cardinality).toBe('one');
    expect(edges.relations.parts.cardinality).toBe('many');
  });

  it('rejects unsupported relation cardinality', () => {
    expect(() => normalizeEdges({
      relations: { parts: { types: ['part'], cardinality: 'some' } }
    }, 'assembly')).toThrow(/cardinality must be one or many/);
  });

  it('does not add relation cardinality to other edge kinds', () => {
    const edges = normalizeEdges({
      children: { parts: { types: ['part'] } }
    }, 'assembly');
    expect(edges.children.parts.cardinality).toBeUndefined();
  });
});
