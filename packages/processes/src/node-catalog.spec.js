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

  it('derives entity create/modify sockets from writable canonical blocks', () => {
    const context = {
      fieldSchemas: [
        { path: 'identity.name', block: 'identity', type: { base: 'string', shape: 'item' } },
        { path: 'data.note', block: 'data', type: { base: 'string', shape: 'item' } },
        { path: 'status.state.primary', block: 'status', type: { base: 'status', shape: 'item' } }
      ]
    };
    const create = resolveCatalogNodePorts({
      kind: 'effect.createEntity',
      entityType: 'project',
      blocks: ['identity', 'data']
    }, context);
    const modify = resolveCatalogNodePorts({
      kind: 'effect.updateEntity',
      entityType: 'project',
      blocks: ['identity', 'data']
    }, context);

    expect(create.inputs.map(input => input.id)).toEqual(['identity', 'data', 'status.state.primary']);
    expect(create.inputs.find(input => input.id === 'identity')?.required).toBe(true);
    expect(modify.inputs.map(input => input.id)).toEqual(['entity', 'identity', 'data', 'status.state.primary']);
    expect(create.outputs.map(output => output.id)).toEqual(['completed', 'result']);
    const automaticModify = resolveCatalogNodePorts({
      kind: 'effect.updateEntity',
      entityType: 'project',
      trigger: { mode: 'event' },
      blocks: ['identity']
    }, context);
    expect(automaticModify.inputs.map(input => input.id)).toEqual(['in', 'entity', 'identity', 'status.state.primary']);
  });

  it('composes and modifies one selected block from its own fields', () => {
    const context = {
      fieldSchemas: [
        { path: 'identity.name', block: 'identity', type: { base: 'string', shape: 'item' } },
        { path: 'data.note', block: 'data', type: { base: 'string', shape: 'item' } }
      ]
    };
    const compose = resolveCatalogNodePorts({
      kind: 'record.composeBlock',
      entityType: 'project',
      block: 'identity',
      fields: ['identity.name']
    }, context);
    const modify = resolveCatalogNodePorts({
      kind: 'record.modifyBlock',
      entityType: 'project',
      block: 'identity',
      fields: ['identity.name']
    }, context);

    expect(compose.inputs.map(input => input.id)).toEqual(['identity.name']);
    expect(compose.outputs[0]).toMatchObject({ id: 'block', type: { base: 'block', block: 'identity' } });
    expect(compose.outputs[0].type).not.toHaveProperty('entityType');
    expect(modify.inputs.map(input => input.id)).toEqual(['block', 'identity.name']);
    expect(modify.inputs[0].type).not.toHaveProperty('entityType');
  });

  it('uses authored stable sockets for open block entries', () => {
    const compose = resolveCatalogNodePorts({
      kind: 'record.composeBlock',
      block: 'lineage',
      compositionMode: 'ancestors',
      entries: [
        { id: 'org', key: 'organizationId', entityType: 'organization' },
        { id: 'run', key: 'runId', entityType: 'nesting_run' }
      ]
    });

    expect(compose.inputs).toMatchObject([
      { id: 'entry:org', label: 'organizationId', type: { base: 'entityRef', entityType: 'organization' } },
      { id: 'entry:run', label: 'runId', type: { base: 'entityRef', entityType: 'nesting_run' } }
    ]);
    expect(compose.outputs[0]).toMatchObject({ id: 'block', type: { base: 'block', block: 'lineage' } });
  });

  it('preserves relation cardinality as an intrinsic array value', () => {
    const compose = resolveCatalogNodePorts({
      kind: 'record.composeBlock',
      block: 'relations',
      compositionMode: 'relations',
      entries: [{ id: 'libraries', key: 'cassetteLibraries', entityType: 'library', cardinality: 'many' }]
    });
    expect(compose.inputs[0]).toMatchObject({
      id: 'entry:libraries',
      type: { base: 'array', itemType: { base: 'entityRef', entityType: 'library' } }
    });
  });

  it('keeps domain producer inputs on a fixed service effect', () => {
    const producer = resolveCatalogNodePorts({
      kind: 'effect.runProducer',
      producerId: 'bakeCassetteDesignFromTemplate',
      entityType: 'cassette_design',
      construction: {
        mode: 'bakeCassetteDesignFromTemplate',
        inputs: [
          { id: 'name', path: 'name', type: 'string', required: true },
          { id: 'templateId', path: 'templateId', type: 'entity', entityType: 'cassette', required: true }
        ]
      }
    });

    expect(producer.inputs.map(input => input.id)).toEqual(['name', 'templateId']);
    expect(producer.inputs[1].type).toMatchObject({ base: 'entityRef', entityType: 'cassette' });
    expect(producer.outputs.map(output => output.id)).toEqual(['completed', 'result']);
  });

  it('uses declared construction inputs inside Create Entity for typed creation modes', () => {
    const create = resolveCatalogNodePorts({
      kind: 'effect.createEntity',
      entityType: 'cassette_design',
      construction: {
        mode: 'bakeCassetteDesignFromTemplate',
        inputs: [
          { id: 'name', path: 'name', type: 'string', required: true },
          { id: 'templateId', path: 'templateId', type: 'entity', entityType: 'cassette', required: true }
        ]
      }
    });

    expect(create.inputs.map(input => input.id)).toEqual(['name', 'templateId']);
    expect(create.inputs[1].type).toMatchObject({ base: 'entityRef', entityType: 'cassette' });
  });

  it('projects Run Service sockets from the selected command contract', () => {
    const ports = resolveCatalogNodePorts({ kind: 'effect.runCommand', commandId: 'solve' }, {
      command: {
        input: {
          entities: [{ name: 'queue', type: 'queue', required: true }],
          parameters: [
            { name: 'machineId', type: 'entityId', entityType: 'machine', required: true },
            { name: 'materialMode', type: 'enum', options: ['VIRTUAL', 'WAREHOUSE'] }
          ]
        },
        output: { entities: ['nesting_run', 'sheet'] }
      }
    });

    expect(ports.inputs).toMatchObject([
      { id: 'queue', required: true, type: { base: 'entityRef', entityType: 'queue' } },
      { id: 'machineId', required: true, type: { base: 'entityRef', entityType: 'machine' } },
      { id: 'materialMode', type: { base: 'enum' } }
    ]);
    expect(ports.outputs.map(output => output.id)).toEqual(['completed', 'nesting_run', 'sheet']);
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

  it('makes packet-list and intrinsic-array conversion explicit', () => {
    const packed = resolveCatalogNodePorts({
      kind: 'collection.packArray',
      type: { base: 'entityRef', entityType: 'queue', shape: 'list' }
    });
    expect(packed.inputs[0].type).toMatchObject({ base: 'entityRef', entityType: 'queue', shape: 'list' });
    expect(packed.outputs[0].type).toMatchObject({
      base: 'array',
      shape: 'item',
      itemType: { base: 'entityRef', entityType: 'queue', shape: 'item' }
    });
    const unpacked = resolveCatalogNodePorts({ kind: 'collection.unpackArray', type: packed.outputs[0].type });
    expect(unpacked.outputs[0].type).toMatchObject({ base: 'entityRef', entityType: 'queue', shape: 'list' });
  });

  it('propagates entity list shape through field reads and deconstruction', () => {
    const context = {
      fieldSchema: { path: 'identity.name', type: { base: 'string', shape: 'item' } },
      fieldSchemas: [{ path: 'identity.name', type: { base: 'string', shape: 'item' } }]
    };
    expect(resolveCatalogNodePorts({
      kind: 'record.getField',
      shape: 'list',
      block: 'identity',
      path: 'identity.name'
    }, context)).toMatchObject({
      inputs: [{ id: 'block', type: { base: 'block', block: 'identity', shape: 'list' } }],
      outputs: [{ id: 'value', type: { base: 'string', shape: 'list' } }]
    });
    expect(resolveCatalogNodePorts({
      kind: 'record.deconstruct',
      entityType: 'project',
      shape: 'list',
      blocks: ['identity']
    }, context).outputs[0].type).toMatchObject({ base: 'block', block: 'identity', shape: 'list' });
  });
});
