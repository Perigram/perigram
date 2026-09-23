import { describe, expect, it } from 'vitest';
import { cncEntities } from './entities.js';
import { cncContainment, cncRelations } from './relationships.js';

const entityTypes = new Set(cncEntities.map(entity => entity.type));

function ancestorChainOf(childType) {
  const chain = [];
  let cyclic = false;
  const stack = cncContainment
    .filter(relation => relation.childType === childType)
    .map(relation => ({ relation, visited: new Set([childType]) }));
  while (stack.length) {
    const { relation, visited } = stack.pop();
    if (visited.has(relation.parentType)) {
      cyclic = true;
      continue;
    }
    chain.push(relation);
    const nextVisited = new Set(visited).add(relation.parentType);
    for (const parent of cncContainment.filter(entry => entry.childType === relation.parentType)) {
      stack.push({ relation: parent, visited: nextVisited });
    }
  }
  return { chain, cyclic };
}

describe('CNC containment relationships', () => {
  it('declares the full containment contract with lineage keys', () => {
    expect(cncContainment).toEqual([
      { parentType: 'cassette', childType: 'cassette_design', lineageKey: 'templateId' }
    ]);
  });

  it('references only declared entity types as containment parents and children', () => {
    for (const relation of cncContainment) {
      expect(entityTypes.has(relation.parentType), relation.parentType).toBe(true);
      expect(entityTypes.has(relation.childType), relation.childType).toBe(true);
      expect(relation.lineageKey, `${relation.parentType}->${relation.childType}`).toBeTruthy();
    }
  });

  it('resolves every lineage key to an ancestor in the containment chain', () => {
    const childTypes = new Set(cncContainment.map(relation => relation.childType));
    for (const childType of childTypes) {
      const { chain, cyclic } = ancestorChainOf(childType);
      expect(cyclic, `${childType} containment chain must be acyclic`).toBe(false);
      const keys = chain.map(relation => relation.lineageKey);
      expect(new Set(keys).size, `${childType} lineage keys must be unique`).toBe(keys.length);
      for (const relation of cncContainment.filter(entry => entry.childType === childType)) {
        expect(
          chain.some(entry => entry.parentType === relation.parentType && entry.lineageKey === relation.lineageKey),
          `${relation.parentType}->${childType} must be reachable as an ancestor`
        ).toBe(true);
      }
    }
  });

  it('keeps declared relations referentially intact', () => {
    for (const relation of cncRelations) {
      expect(entityTypes.has(relation.ownerType), relation.ownerType).toBe(true);
      expect(entityTypes.has(relation.targetType), relation.targetType).toBe(true);
      expect(['one', 'many']).toContain(relation.cardinality);
      expect(relation.key, `${relation.ownerType}.${relation.key}`).toBeTruthy();
    }
  });
});
