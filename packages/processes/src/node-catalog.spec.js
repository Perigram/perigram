import { describe, expect, it } from 'vitest';
import {
  PROCESS_NODE_CATALOG,
  PROCESS_NODE_FAMILIES,
  getProcessNodeDefinition,
  resolveCatalogNodePorts
} from './node-catalog.js';

describe('process v3 node catalog', () => {
  it('uses unique namespaced kinds and one declared family/level per node', () => {
    const kinds = PROCESS_NODE_CATALOG.map(node => node.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(PROCESS_NODE_CATALOG.every(node => PROCESS_NODE_FAMILIES.includes(node.family))).toBe(true);
    expect(PROCESS_NODE_CATALOG.every(node => /^[a-z]+\.[A-Za-z]+$/.test(node.kind))).toBe(true);
  });

  it('separates value logic, predicates, reads, effects, and control', () => {
    expect(getProcessNodeDefinition('value.logic')).toMatchObject({ family: 'values', level: 'data', pure: true });
    expect(getProcessNodeDefinition('predicate.logic')).toMatchObject({ family: 'predicates', level: 'data', pure: true });
    expect(getProcessNodeDefinition('read.queryEntities')).toMatchObject({ family: 'reads', level: 'read', pure: false });
    expect(getProcessNodeDefinition('effect.updateEntity')).toMatchObject({ family: 'effects', level: 'effect', pure: false });
    expect(getProcessNodeDefinition('control.if')).toMatchObject({ family: 'control', level: 'control', pure: false });
  });

  it('contains the complete accepted family inventory', () => {
    expect(PROCESS_NODE_FAMILIES).toEqual([
      'sources',
      'values',
      'collections',
      'records',
      'predicates',
      'reads',
      'effects',
      'control'
    ]);
    for (const kind of [
      'source.literalTree',
      'tree.cross',
      'record.fieldChange',
      'predicate.field',
      'read.queryEntities',
      'effect.changeStatus',
      'control.forEach',
      'control.waitUntil'
    ]) {
      expect(getProcessNodeDefinition(kind), kind).not.toBeNull();
    }
  });

  it('provides an executable socket contract for every catalog node', () => {
    for (const node of PROCESS_NODE_CATALOG) {
      const ports = resolveCatalogNodePorts({
        kind: node.kind,
        entityType: 'project',
        type: { base: 'string', shape: 'item' },
        fields: ['identity.name'],
        cases: [{ id: 'ready' }]
      }, {
        fieldSchema: { path: 'identity.name', type: { base: 'string', shape: 'item' } },
        fieldSchemas: [{ path: 'identity.name', type: { base: 'string', shape: 'item' } }]
      });
      expect(Array.isArray(ports.inputs), node.kind).toBe(true);
      expect(Array.isArray(ports.outputs), node.kind).toBe(true);
      expect([...ports.inputs, ...ports.outputs].every(port => port.type?.base), node.kind).toBe(true);
    }
  });

  it('preserves both sides of an explicit conversion contract', () => {
    const ports = resolveCatalogNodePorts({
      kind: 'value.required',
      sourceType: { base: 'entity', shape: 'list', nullable: true, entityType: 'sheet' },
      outputType: { base: 'entity', shape: 'list', nullable: false, entityType: 'sheet' }
    });

    expect(ports.inputs[0].type).toMatchObject({
      base: 'entity',
      shape: 'list',
      nullable: true,
      entityType: 'sheet'
    });
    expect(ports.outputs[0].type).toMatchObject({
      base: 'entity',
      shape: 'list',
      nullable: false,
      entityType: 'sheet'
    });
  });
});
