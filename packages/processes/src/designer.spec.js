import { describe, expect, it } from 'vitest';
import { CANONICAL_ENTITY_BLOCKS } from '../../core/src/index.js';
import { createProcessDesignerContract, syncProcessNodeProducerOutputs } from './designer.js';
import { getProcessNodeDefinition } from './node-catalog.js';

describe('process designer domain contract', () => {
  const domain = {
    entities: [
      { type: 'work_item', label: 'Work item', collection: 'work_items', blocks: ['identity', 'origin', 'status', 'lineage', 'relations', 'provenance', 'attachments', 'data'] },
      { type: 'result', collection: 'results', blocks: ['identity', 'status', 'specs', 'summary'] }
    ],
    commands: {
      calculate: { id: 'calculate', label: 'Calculate' }
    },
    tasks: { calculateTask: { id: 'calculate.task', label: 'Calculate task' } },
    events: { calculated: { id: 'calculated', label: 'Calculated' } },
    hooks: { audit: { id: 'audit', label: 'Audit' } },
    effects: { notify: { id: 'notify', label: 'Notify' } },
    attachmentKinds: { report: { kind: 'REPORT', label: 'Report' } },
    containment: [{ parentType: 'work_item', childType: 'result', lineageKey: 'workItemId' }],
    relations: [{ ownerType: 'work_item', key: 'owner', targetType: 'result', cardinality: 'one' }],
    workflows: { work_item: { label: 'Work item lifecycle' } },
    fieldAccess: {
      workItem: {
        read: ['identity.*', 'origin.*', 'status.*', 'lineage.*', 'relations.*', 'provenance.*', 'data.note'],
        write: ['identity.name', 'relations.owner', 'data.note'],
        admin: ['attachments.*']
      }
    },
    fieldSchemas: {
      workItem: [
        { path: 'identity.name', block: 'identity', label: 'Name', type: { base: 'string', shape: 'item', nullable: false }, readable: true, writable: true },
        { path: 'relations.owner', block: 'relations', label: 'Owner', type: { base: 'entityRef', shape: 'item', nullable: true }, readable: true, writable: true }
      ]
    },
    blockSchemas: {
      identity: [{ path: 'identity.name', block: 'identity', label: 'Name', type: { base: 'string', shape: 'item', nullable: false } }],
      relations: [{ path: 'relations.owner', block: 'relations', label: 'Owner', type: { base: 'entityRef', shape: 'item', nullable: true } }]
    },
    construction: {
      work_item: {
        modes: ['genericCreate'],
        defaultMode: 'genericCreate',
        inputs: [{ id: 'name', path: 'identity.name', type: 'string' }]
      }
    }
  };

  it('persists the stable producer identity for an entity-emitting effect node', () => {
    const data = { producerOutputs: {} };
    const node = {
      id: 'processNode_1785860422855',
      kind: 'effect.createEntity',
      outputs: [{
        id: 'result',
        type: { base: 'entity', entityType: 'work_item', nullable: false }
      }]
    };

    expect(syncProcessNodeProducerOutputs(data, node)).toEqual(['processNode_1785860422855:result']);
    expect(node.producerOutputId).toBe('processNode_1785860422855:result');
    expect(data.producerOutputs[node.producerOutputId]).toEqual({
      producerOutputId: 'processNode_1785860422855:result',
      nodeId: 'processNode_1785860422855',
      outputSocketId: 'result',
      entityType: 'work_item',
      fields: { read: [], write: [], private: [] }
    });
  });

  it('projects a domain implementation through framework-owned designer contracts', () => {
    const contract = createProcessDesignerContract(domain);

    expect(contract.entityOptions).toContainEqual({ label: 'Work item', value: 'work_item' });
    expect(contract.commandOptions).toEqual([{ label: 'Calculate', value: 'calculate' }]);
    expect(contract.taskOptions).toEqual([{ label: 'Calculate task', value: 'calculate.task' }]);
    expect(contract.eventOptions).toEqual([{ label: 'Calculated', value: 'calculated' }]);
    expect(contract.hookOptions).toEqual([{ label: 'Audit', value: 'audit' }]);
    expect(contract.effectOptions).toEqual([{ label: 'Notify', value: 'notify' }]);
    expect(contract.attachmentKindOptions).toEqual([{
      label: 'Report · workflow',
      value: 'REPORT',
      creation: { mode: 'workflow' },
      editor: { mode: 'none' }
    }]);
    expect(contract.workflowOptions).toEqual([{ label: 'Work item lifecycle', value: 'work_item' }]);
    expect(contract.construction('work_item').inputs[0].path).toBe('identity.name');
    expect(contract.fieldPolicy('work_item').write).toContain('relations.owner');
    expect(contract).not.toHaveProperty('lineageOptions');
    expect(contract).not.toHaveProperty('relationOptions');
  });

  it('exposes every core block and limits entity decomposition to declared domain blocks', () => {
    const contract = createProcessDesignerContract(domain);

    expect(contract.blocks.map(block => block.id)).toEqual(CANONICAL_ENTITY_BLOCKS);
    expect(contract.blocksForEntity('work_item').map(block => block.id)).toEqual([
      'identity',
      'origin',
      'status',
      'lineage',
      'relations',
      'provenance',
      'attachments',
      'data'
    ]);
    expect(contract.fieldsForEntity('work_item', 'relations')).toEqual([
      {
        path: 'relations.owner',
        block: 'relations',
        label: 'Owner',
        value: 'relations.owner',
        type: { base: 'entityRef', shape: 'item', nullable: true },
        readable: true,
        writable: true
      }
    ]);
    expect(contract.fieldsForBlock('relations')).toEqual([
      expect.objectContaining({ value: 'relations.owner', type: { base: 'entityRef', shape: 'item', nullable: true } })
    ]);
  });

  it('does not infer generic construction for entities without an explicit contract', () => {
    const contract = createProcessDesignerContract(domain);

    expect(contract.construction('result')).toBeNull();
    expect(contract.construction('work_item')).toMatchObject({
      modes: ['genericCreate'],
      defaultMode: 'genericCreate'
    });
  });

  it('filters per-operation entity options by the matching domain signal', () => {
    const contract = createProcessDesignerContract(domain);

    expect(contract.createEntityOptions).toEqual([{ label: 'Work item', value: 'work_item' }]);
    expect(contract.updateEntityOptions).toEqual([{ label: 'Work item', value: 'work_item' }]);
    expect(contract.changeStatusOptions).toEqual([{ label: 'Work item', value: 'work_item' }]);
    expect(contract.deleteEntityOptions).toEqual([]);
    expect(contract.archivableEntityOptions).toEqual([]);
    expect(contract.paletteGroups.flatMap(group => group.items).map(item => item.kind)).not.toContain('effect.deleteEntity');
    expect(contract.paletteGroups.flatMap(group => group.items).map(item => item.kind)).not.toContain('effect.archiveEntity');
  });

  it('gates list and get-by-id entity choices by the serialized capability projection', () => {
    const contract = createProcessDesignerContract(domain, {
      work_item: { list: true, getById: true },
      result: { list: false, getById: true }
    });

    expect(contract.listableEntityOptions).toEqual([{ label: 'Work item', value: 'work_item' }]);
    expect(contract.readableEntityOptions).toEqual([
      { label: 'Work item', value: 'work_item' },
      { label: 'result', value: 'result' }
    ]);
  });

  it('falls back to every entity for read choices when no capability projection is loaded', () => {
    const contract = createProcessDesignerContract(domain);

    expect(contract.listableEntityOptions).toEqual([
      { label: 'Work item', value: 'work_item' },
      { label: 'result', value: 'result' }
    ]);
    expect(contract.readableEntityOptions).toEqual([
      { label: 'Work item', value: 'work_item' },
      { label: 'result', value: 'result' }
    ]);
  });

  it('derives create options and modes from a serialized capability projection when present', () => {
    const contract = createProcessDesignerContract(domain, {
      work_item: { createModes: ['genericCreate'] },
      result: { createModes: [] }
    });

    expect(contract.createEntityOptions).toEqual([{ label: 'Work item', value: 'work_item' }]);
    expect(contract.createModes('work_item')).toEqual(['genericCreate']);
    expect(contract.createModes('result')).toEqual([]);
  });

  it('filters an entity whose declared mode has no effective runtime handler', () => {
    const contract = createProcessDesignerContract({
      ...domain,
      construction: {
        ...domain.construction,
        result: { modes: ['deriveResult'], defaultMode: 'deriveResult', inputs: [] }
      }
    }, {
      work_item: { createModes: ['genericCreate'] },
      result: { createModes: [] }
    });

    expect(contract.createEntityOptions).toEqual([{ label: 'Work item', value: 'work_item' }]);
    expect(contract.createModes('result')).toEqual([]);
  });

  it('exposes delete and archive options only for entities with those capabilities', () => {
    const contract = createProcessDesignerContract({
      ...domain,
      entities: [
        ...domain.entities,
        { type: 'queue', label: 'Queue', blocks: ['identity'], operations: { delete: true } },
        { type: 'library', label: 'Library', blocks: ['identity'] }
      ],
      workflows: {
        ...domain.workflows,
        queue: { label: 'Queue lifecycle', regions: { main: { states: { DRAFT: {}, ARCHIVED: {} } } } },
        library: { label: 'Library lifecycle', regions: { main: { states: { ACTIVE: {} } } } }
      }
    }, {
      work_item: { delete: false, archive: false },
      result: { delete: false, archive: false },
      queue: { delete: true, archive: true },
      library: { delete: false, archive: false }
    });

    expect(contract.deleteEntityOptions).toEqual([{ label: 'Queue', value: 'queue' }]);
    expect(contract.archivableEntityOptions).toEqual([{ label: 'Queue', value: 'queue' }]);
  });

  it('presents authoring operations by concern without exposing runtime plumbing', () => {
    const contract = createProcessDesignerContract(domain, {
      work_item: { delete: true, archive: true },
      result: { delete: false, archive: false }
    });
    const groups = Object.fromEntries(contract.paletteGroups.map(group => [group.id, group.items]));
    const items = contract.paletteGroups.flatMap(group => group.items);

    expect(Object.keys(groups)).toEqual([
      'entities',
      'values',
      'listTree'
    ]);
    expect(groups.entities.map(item => item.kind || item.type)).toEqual([
      'effect.createEntity',
      'effect.updateEntity',
      'effect.changeStatus',
      'effect.archiveEntity',
      'effect.deleteEntity',
      'effect.runCommand',
      'statusDefinition',
      'read.currentEntity',
      'read.entityById',
      'read.resolveEntityRef',
      'read.queryEntities',
      'read.parent',
      'read.children',
      'read.related',
      'record.deconstruct',
      'record.composeBlock',
      'record.modifyBlock',
      'record.getBlock',
      'record.getField',
      'producer.join'
    ]);
    expect(groups.values.map(item => item.kind)).toEqual([
      'source.literalItem',
      'value.logic',
      'value.string',
      'value.math',
      'value.dateTime'
    ]);
    expect(groups.listTree.map(item => item.kind)).not.toContain('tree.cross');
    expect(groups.listTree[0]).toMatchObject({ id: 'makeList', kind: 'collection.makeList' });
    expect(groups.listTree.map(item => item.kind)).not.toEqual(expect.arrayContaining([
      'collection.reverse',
      'collection.shift',
      'collection.partition',
      'tree.flatten',
      'tree.graft',
      'tree.simplify',
      'tree.branch',
      'tree.transpose',
      'tree.clean',
      'tree.stats'
    ]));
    expect(items.map(item => item.kind)).not.toContain('control.manualTrigger');
    expect(items.map(item => item.kind)).not.toContain('control.entityChangedTrigger');
    expect(items.map(item => item.kind)).not.toContain('control.domainEventTrigger');
    expect(items.map(item => item.kind)).not.toContain('control.if');
    expect(items.map(item => item.kind)).not.toContain('control.forEach');
    expect(items.map(item => item.kind)).not.toContain('control.forEachEnd');
    expect(items.map(item => item.kind)).not.toContain('control.waitUntil');
    expect(items.map(item => item.kind)).not.toContain('control.waitDuration');
    expect(items.map(item => item.kind)).not.toContain('value.cast');
    expect(items.map(item => item.kind)).not.toContain('value.parse');
    expect(items.map(item => item.kind)).not.toContain('source.triggerPayload');
    expect(items.every(item => item.type === 'statusDefinition' || getProcessNodeDefinition(item.kind))).toBe(true);
    expect(new Set(items.map(item => item.id)).size).toBe(items.length);
    expect(items.every(item => item.description && item.preset)).toBe(true);
    expect(items.find(item => item.id === 'date')?.preset).toMatchObject({
      operation: 'addDays',
      inputDefaults: { amount: 30 }
    });
    expect(contract.fieldType('work_item', 'identity.name')).toMatchObject({ base: 'string', shape: 'item' });
  });

  it('keeps domain construction producers out of the authoring palette', () => {
    const contract = createProcessDesignerContract({
      ...domain,
      producers: [{
        id: 'buildResult',
        label: 'Build result',
        kind: 'construction',
        constructionMode: 'buildResult',
        output: { entityType: 'result' }
      }],
      construction: {
        ...domain.construction,
        result: {
          modes: ['buildResult'],
          defaultMode: 'buildResult',
          derived: true,
          inputs: [{ id: 'source', path: 'source', type: 'entity', entityType: 'work_item', required: true }]
        }
      }
    });
    const producer = contract.paletteGroups.flatMap(group => group.items)
      .find(item => item.id === 'buildResult');

    expect(producer).toBeUndefined();
  });
});
