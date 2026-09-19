import { describe, expect, it } from 'vitest';
import {
  PROCESS_NODE_CATALOG,
  PROCESS_NODE_FAMILIES,
  getProcessNodeDefinition,
  resolveCatalogNodePorts
} from './node-catalog.js';
import { processSocketsCompatible } from './types.js';

describe('process v4 node catalog', () => {
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
      'control.stopSuccess'
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

  it('preserves both element types and socket access of an explicit conversion contract', () => {
    const ports = resolveCatalogNodePorts({
      kind: 'value.required',
      sourceType: { base: 'entity', shape: 'list', nullable: true, entityType: 'sheet' },
      outputType: { base: 'entity', shape: 'list', nullable: false, entityType: 'sheet' }
    });

    expect(ports.inputs[0].type).toMatchObject({
      base: 'entity',
      nullable: true,
      entityType: 'sheet'
    });
    expect(ports.outputs[0].type).toMatchObject({
      base: 'entity',
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
    expect(create.inputs.find(input => input.id === 'identity')?.required).toBe(false);
    expect(modify.inputs.map(input => input.id)).toEqual(['entity', 'identity', 'data', 'status.state.primary']);
    expect(create.outputs.map(output => output.id)).toEqual(['completed', 'result']);
    const typedCreate = resolveCatalogNodePorts({
      kind: 'effect.createEntity',
      entityType: 'cassette_design',
      blocks: ['identity', 'relations'],
      construction: {
        mode: 'bakeCassetteDesignFromTemplate',
        inputs: [{ id: 'templateId', label: 'Cassette template', type: 'entity', entityType: 'cassette', required: true }]
      }
    }, context);
    expect(typedCreate.inputs.map(input => input.id)).toEqual([
      'templateId',
      'identity',
      'relations',
      'status.state.primary'
    ]);
    const automaticModify = resolveCatalogNodePorts({
      kind: 'effect.updateEntity',
      entityType: 'project',
      trigger: { mode: 'event' },
      blocks: ['identity']
    }, context);
    expect(automaticModify.inputs.map(input => input.id)).toEqual(['in', 'entity', 'identity', 'status.state.primary']);
  });

  it('exposes declared row fields as construction sockets on the composer-less construct', () => {
    const context = { domain: {} };
    const rowCreate = resolveCatalogNodePorts({
      kind: 'effect.createEntity',
      entityType: 'widget',
      blocks: ['identity', 'data', 'specs'],
      construction: {
        mode: 'genericCreate',
        inputs: [
          { id: 'name', label: 'Name', path: 'name', type: 'string', required: true, prompt: true },
          { id: 'specs.width', label: 'specs.width', path: 'specs.width', type: 'number', required: false, prompt: true },
          { id: 'data.owner', label: 'data.owner', path: 'data.owner', type: 'entity', entityType: 'project', required: true, prompt: true }
        ]
      }
    }, context);
    expect(rowCreate.inputs.map(input => input.id)).toEqual([
      'name',
      'specs.width',
      'data.owner',
      'identity',
      'data',
      'specs',
      'status.state.primary'
    ]);
    const owner = rowCreate.inputs.find(input => input.id === 'data.owner');
    expect(owner.type).toMatchObject({ base: 'entityRef', entityType: 'project' });
    expect(owner.required).toBe(true);
    const width = rowCreate.inputs.find(input => input.id === 'specs.width');
    expect(width.type).toMatchObject({ base: 'number' });
    expect(width.required).toBe(false);
    // v4 twin keeps the block substrate; the cts species record speaks
    // the declaration only — the persistent Type pin, row fields, and
    // status, no block sockets (the composer-less construct is the
    // construction path, SPEC §20).
    const speciesCreate = resolveCatalogNodePorts({
      kind: 'cts.construct',
      typeId: 'widget',
      via: 'genericCreate',
      slots: ['identity', 'data', 'specs'],
      construction: {
        mode: 'genericCreate',
        inputs: [
          { id: 'specs.width', label: 'specs.width', path: 'specs.width', type: 'number', required: false, prompt: true }
        ]
      }
    }, context);
    expect(speciesCreate.inputs.map(input => input.id)).toEqual([
      'type',
      'specs.width',
      'status.state.primary'
    ]);
  });

  it('exposes writable row fields as leaf sockets on a bound cts.mutate', () => {
    const context = {
      fieldSchemas: [
        { path: 'identity.name', block: 'identity', type: { base: 'string', shape: 'item' }, writable: true },
        { path: 'data.width', block: 'data', type: { base: 'number', shape: 'item' }, writable: true },
        { path: 'specs.thickness', block: 'specs', type: { base: 'number', shape: 'item', unit: 'mm' }, writable: true },
        { path: 'data.locked', block: 'data', type: { base: 'boolean', shape: 'item' }, writable: false },
        { path: 'status.state.primary', block: 'status', type: { base: 'status', shape: 'item' }, writable: false }
      ]
    };
    const ports = resolveCatalogNodePorts({ kind: 'cts.mutate', typeId: 'panel' }, context);
    const ids = ports.inputs.map(input => input.id);
    expect(ids[0]).toBe('entity');
    expect(ids).toEqual(expect.arrayContaining(['data.width', 'specs.thickness']));
    expect(ids).not.toContain('data.locked');
    expect(ids).not.toContain('identity');
    expect(ids).not.toContain('data');
    expect(ids.at(-1)).toBe('status.state.primary');
  });

  it('splits the species binding contract: origins carry a typed pin, consumers adapt to their entity wire', () => {
    const context = { domain: {} };

    // an unbound mutate offers only its (untyped) entity input — plugging a
    // typed entity stream in adapts it; there is no Type pin to also satisfy
    const unboundConsumer = resolveCatalogNodePorts({ kind: 'cts.mutate', typeId: '' }, context);
    expect(unboundConsumer.inputs.map(input => input.id)).toEqual(['entity']);
    expect(unboundConsumer.inputs[0].required).toBe(true);
    expect(unboundConsumer.outputs).toEqual([]);
    for (const kind of ['cts.transition', 'cts.remove']) {
      const ports = resolveCatalogNodePorts({ kind, typeId: '' }, context);
      expect(ports.inputs.map(input => input.id), kind).toEqual(['entity']);
    }

    // the pin persists on origin species, typed by the binding when bound
    for (const record of [
      { kind: 'cts.construct', typeId: '', via: 'genericCreate' },
      { kind: 'cts.read', typeId: '' }
    ]) {
      const ports = resolveCatalogNodePorts(record, context);
      expect(ports.inputs.map(input => input.id), record.kind).toEqual(['type']);
    }
    const typedRead = resolveCatalogNodePorts({ kind: 'cts.read', select: 'byId', typeId: 'queue' }, context);
    expect(typedRead.inputs[0]).toMatchObject({ id: 'type', type: { base: 'entityRef', entityType: 'queue' } });
  });

  it('declares List consumption on every mapped mutation effect input socket', () => {
    const context = {
      fieldSchemas: [
        { path: 'identity.name', block: 'identity', type: { base: 'string', shape: 'item' } }
      ]
    };
    for (const [kind, record] of [
      ['effect.createEntity', { kind: 'effect.createEntity', entityType: 'project', blocks: ['identity'] }],
      ['effect.updateEntity', { kind: 'effect.updateEntity', entityType: 'project', blocks: ['identity'] }],
      ['effect.changeStatus', { kind: 'effect.changeStatus', entityType: 'project' }],
      ['effect.archiveEntity', { kind: 'effect.archiveEntity', entityType: 'project' }],
      ['effect.deleteEntity', { kind: 'effect.deleteEntity', entityType: 'project' }]
    ]) {
      const ports = resolveCatalogNodePorts(record, context);
      expect(ports.inputs.length, kind).toBeGreaterThan(0);
      expect(ports.inputs.every(input => input.access === 'list'), kind).toBe(true);
    }
    const typedCreate = resolveCatalogNodePorts({
      kind: 'effect.createEntity',
      entityType: 'cassette_design',
      construction: {
        mode: 'bakeCassetteDesignFromTemplate',
        inputs: [{ id: 'templateId', type: 'entity', entityType: 'cassette', required: true }]
      }
    }, context);
    expect(typedCreate.inputs.every(input => input.access === 'list')).toBe(true);
  });

  it('accepts item, list, and tree sources on mapped mutation sockets', () => {
    const modify = resolveCatalogNodePorts({
      kind: 'effect.updateEntity',
      entityType: 'project',
      blocks: ['identity']
    }, {
      fieldSchemas: [{ path: 'identity.name', block: 'identity', type: { base: 'string', shape: 'item' } }]
    });
    const entitySocket = modify.inputs.find(input => input.id === 'entity');
    const blockSocket = modify.inputs.find(input => input.id === 'identity');
    for (const access of ['item', 'list', 'tree']) {
      const entitySource = { id: 'entities', label: 'entities', role: 'data', access, type: { base: 'entity', entityType: 'project' } };
      expect(processSocketsCompatible(entitySource, entitySocket).ok, `entity ${access}`).toBe(true);
      const blockSource = { id: 'block', label: 'block', role: 'data', access, type: { base: 'block', block: 'identity' } };
      expect(processSocketsCompatible(blockSource, blockSocket).ok, `block ${access}`).toBe(true);
    }
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

  it('uses an explicit intrinsic array type for a relation collection', () => {
    const compose = resolveCatalogNodePorts({
      kind: 'record.composeBlock',
      block: 'relations',
      compositionMode: 'relations',
      entries: [{ id: 'libraries', key: 'library', type: { base: 'array', itemType: { base: 'entityRef', entityType: 'library' } } }]
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

    expect(create.inputs.map(input => input.id)).toEqual(['name', 'templateId', 'status.state.primary']);
    expect(create.inputs[1].type).toMatchObject({ base: 'entityRef', entityType: 'cassette' });
  });

  it('does not require a wire when a construction input declares its own default', () => {
    const create = resolveCatalogNodePorts({
      kind: 'effect.createEntity',
      entityType: 'result',
      construction: {
        mode: 'buildResult',
        inputs: [{ id: 'quality', path: 'data.quality', type: 'string', required: true, default: 'standard' }]
      }
    });

    expect(create.inputs[0]).toMatchObject({ id: 'quality', required: false });
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
        output: {
          entities: [
            { type: 'nesting_run', persistenceOwner: 'commandOwned', timing: 'immediate' },
            { type: 'sheet', persistenceOwner: 'commandOwned', timing: 'completion' }
          ]
        }
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
    expect(resolveCatalogNodePorts({ kind: 'value.string', operation: 'split' }).outputs[0].access).toBe('list');
  });

  it('makes packet-list and intrinsic-array conversion explicit', () => {
    const packed = resolveCatalogNodePorts({
      kind: 'collection.packArray',
      type: { base: 'entityRef', entityType: 'queue', shape: 'list' }
    });
    expect(packed.inputs[0]).toMatchObject({ access: 'list', type: { base: 'entityRef', entityType: 'queue' } });
    expect(packed.outputs[0].type).toMatchObject({
      base: 'array',
      itemType: { base: 'entityRef', entityType: 'queue' }
    });
    const unpacked = resolveCatalogNodePorts({ kind: 'collection.unpackArray', type: packed.outputs[0].type });
    expect(unpacked.outputs[0]).toMatchObject({ access: 'list', type: { base: 'entityRef', entityType: 'queue' } });
  });

  it('keeps field reads item-wise so tree topology flows at runtime', () => {
    const context = {
      fieldSchema: { path: 'identity.name', type: { base: 'string', shape: 'item' } },
      fieldSchemas: [{ path: 'identity.name', type: { base: 'string', shape: 'item' } }]
    };
    expect(resolveCatalogNodePorts({
      kind: 'record.getField',
      block: 'identity',
      path: 'identity.name'
    }, context)).toMatchObject({
      inputs: [{ id: 'block', access: 'item', type: { base: 'block', block: 'identity' } }],
      outputs: [{ id: 'value', access: 'item', type: { base: 'string' } }]
    });
    expect(resolveCatalogNodePorts({
      kind: 'record.deconstruct',
      entityType: 'project',
      blocks: ['identity']
    }, context).outputs[0]).toMatchObject({ access: 'item', type: { base: 'block', block: 'identity' } });
  });

  it('exposes items plus aligned keys for Sort, Distinct, and Group By', () => {
    expect(resolveCatalogNodePorts({ kind: 'collection.sort' }).inputs.map(input => [input.id, input.required, input.access]))
      .toEqual([['items', true, 'list'], ['keys', true, 'list']]);
    expect(resolveCatalogNodePorts({ kind: 'collection.distinct' }).inputs.map(input => [input.id, input.required, input.access]))
      .toEqual([['items', true, 'list'], ['keys', false, 'list']]);
    expect(resolveCatalogNodePorts({ kind: 'collection.groupBy' }).inputs.map(input => [input.id, input.required, input.access]))
      .toEqual([['items', true, 'list'], ['keys', true, 'list']]);
    expect(resolveCatalogNodePorts({ kind: 'collection.sort' }).outputs[0].id).toBe('items');
    expect(resolveCatalogNodePorts({ kind: 'collection.itemAt' }).inputs[1]).toMatchObject({ id: 'index', required: false });
  });

  it('fixes Make List at four optional single-wire item sockets feeding one list output', () => {
    const ports = resolveCatalogNodePorts({
      kind: 'collection.makeList',
      type: { base: 'entityRef', entityType: 'queue' }
    });

    expect(ports.inputs.map(input => [input.id, input.required, input.access, Boolean(input.multiple)]))
      .toEqual([
        ['item1', false, 'item', false],
        ['item2', false, 'item', false],
        ['item3', false, 'item', false],
        ['item4', false, 'item', false]
      ]);
    expect(ports.inputs.every(input => input.type.base === 'entityRef' && input.type.entityType === 'queue')).toBe(true);
    expect(ports.outputs).toHaveLength(1);
    expect(ports.outputs[0]).toMatchObject({ id: 'value', access: 'list', type: { base: 'entityRef', entityType: 'queue' } });
  });

  it('keeps Concat as a two-list join that retains element type and list access', () => {
    const ports = resolveCatalogNodePorts({
      kind: 'collection.concat',
      type: { base: 'entityRef', entityType: 'queue' }
    });

    expect(ports.inputs.map(input => [input.id, input.required, input.access]))
      .toEqual([['left', true, 'list'], ['right', true, 'list']]);
    expect(ports.inputs.every(input => input.type.base === 'entityRef' && input.type.entityType === 'queue')).toBe(true);
    expect(ports.outputs[0]).toMatchObject({ id: 'value', access: 'list', type: { base: 'entityRef', entityType: 'queue' } });
  });
});
