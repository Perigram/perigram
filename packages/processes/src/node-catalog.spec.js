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

  it('derives entity create/modify sockets from selected domain fields', () => {
    const context = {
      fieldSchemas: [
        { path: 'identity.name', type: { base: 'string', shape: 'item' } },
        { path: 'status.state.primary', type: { base: 'status', shape: 'item' } }
      ]
    };
    const create = resolveCatalogNodePorts({
      kind: 'effect.createEntity',
      entityType: 'project',
      fields: ['identity.name']
    }, context);
    const modify = resolveCatalogNodePorts({
      kind: 'effect.updateEntity',
      entityType: 'project',
      fields: ['identity.name']
    }, context);

    expect(create.inputs.map(input => input.id)).toEqual(['identity.name', 'parent']);
    expect(modify.inputs.map(input => input.id)).toEqual(['entity', 'identity.name', 'status.state.primary']);
    const automaticModify = resolveCatalogNodePorts({
      kind: 'effect.updateEntity',
      entityType: 'project',
      trigger: { mode: 'event' },
      fields: ['identity.name']
    }, context);
    expect(automaticModify.inputs.map(input => input.id)).toEqual(['in', 'entity', 'identity.name', 'status.state.primary']);
  });

  it('exposes typed construction inputs directly on create nodes', () => {
    const create = resolveCatalogNodePorts({
      kind: 'effect.createEntity',
      entityType: 'cassette_design',
      fields: [],
      construction: {
        mode: 'bakeCassetteDesignFromTemplate',
        inputs: [
          { id: 'name', label: 'Design name', path: 'name', type: 'string', required: true },
          { id: 'templateId', label: 'Cassette template', path: 'templateId', type: 'entity', entityType: 'cassette', required: true }
        ]
      }
    });

    expect(create.inputs.find(input => input.id === 'name')).toMatchObject({
      required: true,
      type: { base: 'string' }
    });
    expect(create.inputs.find(input => input.id === 'templateId')).toMatchObject({
      required: true,
      type: { base: 'entityRef', entityType: 'cassette' }
    });
  });

  it('changes unified logic and date sockets with the selected operation', () => {
    expect(resolveCatalogNodePorts({ kind: 'value.logic', operation: 'not' }).inputs.map(input => input.id)).toEqual(['left']);
    expect(resolveCatalogNodePorts({ kind: 'value.logic', operation: 'gte', type: { base: 'dateTime' } }).inputs.map(input => input.type.base))
      .toEqual(['dateTime', 'dateTime']);
    expect(resolveCatalogNodePorts({ kind: 'value.dateTime', operation: 'addDays' }).inputs.map(input => [input.id, input.type.base]))
      .toEqual([['date', 'dateTime'], ['amount', 'number']]);
    expect(resolveCatalogNodePorts({ kind: 'value.dateTime', operation: 'differenceDays' }).outputs[0].type.base).toBe('number');
  });

  it('changes math and text sockets with the selected operation', () => {
    expect(resolveCatalogNodePorts({ kind: 'value.math', operation: 'sqrt' }).inputs.map(port => port.id)).toEqual(['value']);
    expect(resolveCatalogNodePorts({ kind: 'value.math', operation: 'clamp' }).inputs.map(port => port.id)).toEqual(['value', 'min', 'max']);
    expect(resolveCatalogNodePorts({ kind: 'value.string', operation: 'substring' }).inputs.map(port => port.id)).toEqual(['text', 'start', 'end']);
    expect(resolveCatalogNodePorts({ kind: 'value.string', operation: 'split' }).outputs[0].type.shape).toBe('list');
  });

  it('propagates entity list shape through field reads and deconstruction', () => {
    const context = {
      fieldSchema: { path: 'identity.name', type: { base: 'string', shape: 'item' } },
      fieldSchemas: [{ path: 'identity.name', type: { base: 'string', shape: 'item' } }]
    };
    expect(resolveCatalogNodePorts({
      kind: 'record.getField',
      entityType: 'project',
      shape: 'list',
      path: 'identity.name'
    }, context).outputs[0].type).toMatchObject({ base: 'string', shape: 'list' });
    expect(resolveCatalogNodePorts({
      kind: 'record.deconstruct',
      entityType: 'project',
      shape: 'list',
      fields: ['identity.name']
    }, context).outputs[0].type).toMatchObject({ base: 'string', shape: 'list' });
  });
});
