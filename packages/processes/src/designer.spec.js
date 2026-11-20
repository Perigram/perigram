import { describe, expect, it } from 'vitest';
import { CANONICAL_ENTITY_BLOCKS } from '../../core/src/index.js';
import { applyFieldDisplayRole, compileTreeDeclarations, createProcessDesignerContract, declarationNodePorts, declarationWireLegality, childrenWireLegality, genericPaletteItemForKind, interpretDeclarationEdges, syncProcessNodeProducerOutputs } from './designer.js';
import { normalizeType } from '../../cts/src/index.js';
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
        read: ['identity.*', 'origin.*', 'status.*', 'lineage.*', 'relations.*', 'provenance.*', 'fields.note'],
        write: ['name', 'relations.owner', 'fields.note'],
        admin: ['attachments.*']
      }
    },
    fieldSchemas: {
      workItem: [
        { path: 'name', block: 'identity', label: 'Name', type: { base: 'string', shape: 'item', nullable: false }, readable: true, writable: true },
        { path: 'relations.owner', block: 'relations', label: 'Owner', type: { base: 'entityRef', shape: 'item', nullable: true }, readable: true, writable: true }
      ]
    },
    blockSchemas: {
      identity: [{ path: 'name', block: 'identity', label: 'Name', type: { base: 'string', shape: 'item', nullable: false } }],
      relations: [{ path: 'relations.owner', block: 'relations', label: 'Owner', type: { base: 'entityRef', shape: 'item', nullable: true } }]
    },
    construction: {
      work_item: {
        modes: ['genericCreate'],
        defaultMode: 'genericCreate',
        inputs: [{ id: 'name', path: 'name', type: 'string' }]
      }
    }
  };

  it('persists the stable producer identity for an entity-emitting effect node', () => {
    const data = { producerOutputs: {} };
    const node = {
      id: 'processNode_1785860422855',
      kind: 'cts.construct',
      outputs: [{
        id: 'result',
        type: { base: 'entity', typeId: 'work_item', nullable: false }
      }]
    };

    expect(syncProcessNodeProducerOutputs(data, node)).toEqual(['processNode_1785860422855:result']);
    expect(node.producerOutputId).toBe('processNode_1785860422855:result');
    expect(data.producerOutputs[node.producerOutputId]).toEqual({
      producerOutputId: 'processNode_1785860422855:result',
      nodeId: 'processNode_1785860422855',
      outputSocketId: 'result',
      typeId: 'work_item',
      lifecycle: { mode: 'defaultCreated' },
      fields: { read: [], write: [], private: [] }
    });
  });

  it('does not create producer outputs for entity reads', () => {
    const data = {
      producerOutputs: {
        'read:result': {
          producerOutputId: 'read:result',
          nodeId: 'read',
          outputSocketId: 'result',
          typeId: 'work_item'
        }
      }
    };
    const read = {
      id: 'read',
      kind: 'cts.read',
      select: 'current',
      typeId: 'work_item',
      producerOutputId: 'read:result',
      outputs: [{
        id: 'result',
        type: { base: 'entity', typeId: 'work_item', nullable: false }
      }]
    };

    expect(syncProcessNodeProducerOutputs(data, read)).toEqual([]);
    expect(data.producerOutputs).toEqual({});
    expect(read.producerOutputId).toBeUndefined();
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
    expect(contract.construction('work_item').inputs[0].path).toBe('name');
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
      'types',
      'operations',
      'control',
      'instances',
      'values',
      'listTree'
    ]);
    // the Types group opens with declaration authoring: classes, their
    // fields/states, status definitions, and the type reference compose in
    // the same tree (SPEC §20/§21); the registry catalog prepends to it at
    // the designer surface
    expect(groups.types.map(item => item.type)).toEqual([
      'ctsClass', 'ctsField', 'ctsState', 'ctsType'
    ]);
    // operations are native entity-bound species plus the event emitter.
    // Producer convergence is compiler behavior, not an author-facing node.
    expect(groups.operations.map(item => item.kind || item.type)).toEqual([
      'cts.construct',
      'cts.mutate',
      'cts.transition',
      'cts.remove',
      'cts.emit'
    ]);
    // The retained instance sources are current, typed-reference, and All<T>;
    // the pinned entity (one authored exact-instance ref) rides beside
    // them; declared-edge traversal remains separate from unfiltered
    // collection reads.
    expect(groups.instances.map(item => item.preset.select)).toEqual([
      'current', 'all', undefined, undefined, undefined, 'extract', 'parent', 'children', 'related', undefined, undefined
    ]);
    const pinned = groups.instances.find(item => item.id === 'pinnedEntity');
    expect(pinned.kind).toBe('source.literalItem');
    expect(pinned.preset.type).toEqual({ base: 'entityRef' });
    // the kind's generic vocabulary: the plain literal, the pinned-entity
    // variant staying a variant; reads fall back to their default select
    expect(genericPaletteItemForKind('source.literalItem').id).toBe('literal');
    expect(genericPaletteItemForKind('source.literalList').id).toBe('literalList');
    expect(genericPaletteItemForKind('cts.read').id).toBe('contextEntity');
    expect(genericPaletteItemForKind('cts.construct').id).toBe('construct');
    // The field projection and the per-facet instance elimination live with
    // the entity sources; block composition (cts.compose) stays catalog-only
    // for migrated graphs.
    expect(groups.instances.at(-2).kind).toBe('cts.field');
    expect(groups.instances.at(-1).kind).toBe('cts.decompose');
    expect(items.map(item => item.kind)).not.toContain('cts.compose');
    expect(items.map(item => item.kind)).not.toContain('cts.join');
    expect(items.map(item => item.preset?.select)).not.toContain('byId');
    expect(items.map(item => item.preset?.select)).not.toContain('query');
    expect(groups.values.map(item => item.kind)).toEqual([
      'source.literalItem',
      'source.literalList',
      'source.currentTime',
      'source.triggerPayload',
      'value.compare',
      'value.select',
      'value.logic',
      'value.string',
      'value.recordField',
      'record.construct',
      'record.merge',
      'value.math',
      'value.dateTime',
      'value.cast',
      'value.convertUnit',
      'value.coalesce',
      'value.format',
      'value.required',
      'value.validate'
    ]);
    // List/tree authoring is exhaustive (owner direction 2026-10-10:
    // operate like a dataflow toolkit): the whole tree-algebra family and
    // the list reshapes are palette items; only the fixed-arity
    // constructor and the persisted-array boundary stay catalog-only
    // (SPEC §8 palette law).
    expect(groups.listTree.map(item => item.kind)).not.toEqual(expect.arrayContaining([
      'collection.makeList',
      'collection.packArray',
      'collection.unpackArray'
    ]));
    expect(groups.listTree.map(item => item.kind)).toEqual(expect.arrayContaining([
      'collection.concat',
      'collection.join',
      'collection.itemAt',
      'collection.slice',
      'collection.count',
      'collection.filter',
      'collection.sort',
      'collection.dispatch',
      'collection.distinct',
      'collection.groupBy',
      'collection.reduce',
      'collection.reverse',
      'collection.shift',
      'collection.partition',
      'tree.flatten',
      'tree.graft',
      'tree.simplify',
      'tree.branch',
      'tree.zip',
      'tree.unzip',
      'tree.cross',
      'tree.transpose',
      'tree.clean',
      'tree.stats'
    ]));
    expect(groups.control.map(item => item.kind)).toEqual([
      'control.if',
      'control.joinAll',
      'control.joinAny',
      'control.forEach',
      'control.waitUntil',
      'control.stopSuccess',
      'control.stopFailure'
    ]);
    expect(items.map(item => item.kind)).not.toContain('control.manualTrigger');
    expect(items.map(item => item.kind)).not.toContain('control.entityChangedTrigger');
    expect(items.map(item => item.kind)).not.toContain('control.domainEventTrigger');
    expect(items.map(item => item.kind)).not.toContain('cts.command');
    // stateDefinition and the ctsType reference node are canvas surfaces, not catalog operations
    // declaration canvas nodes (class/field/state/reference) are tree vocabulary, not catalog operations
    expect(items.every(item => ['stateDefinition', 'ctsType', 'ctsClass', 'ctsField', 'ctsState'].includes(item.type) || getProcessNodeDefinition(item.kind))).toBe(true);
    expect(new Set(items.map(item => item.id)).size).toBe(items.length);
    expect(items.every(item => item.description && item.preset)).toBe(true);
    expect(items.find(item => item.id === 'date')?.preset).toMatchObject({
      operation: 'addDays',
      inputDefaults: { amount: 30 }
    });
    expect(contract.fieldType('work_item', 'name')).toMatchObject({ base: 'string', shape: 'item' });
  });

  it('offers services from the projected operator registry, never a legacy command list', () => {
    const withServices = createProcessDesignerContract({
      ...domain,
      serviceContracts: {
        'nesting.solve': { id: 'nesting.solve', command: 'solveNestingValue', render: { label: 'Nesting solver', icon: 'pi pi-compass' } },
        incomplete: { id: 'incomplete' }
      }
    });
    const servicesGroup = withServices.paletteGroups.find(group => group.id === 'services');
    expect(servicesGroup.items.map(item => item.kind)).toEqual(['cts.service']);
    expect(servicesGroup.items[0].preset).toEqual({ operator: 'nesting.solve' });

    const withoutServices = createProcessDesignerContract(domain);
    expect(withoutServices.paletteGroups.some(group => group.id === 'services')).toBe(false);
  });

  it('keeps domain construction producers out of the authoring palette', () => {
    const contract = createProcessDesignerContract({
      ...domain,
      producers: [{
        id: 'buildResult',
        label: 'Build result',
        kind: 'construction',
        constructionMode: 'buildResult',
        output: { typeId: 'result' }
      }],
      construction: {
        ...domain.construction,
        result: {
          modes: ['buildResult'],
          defaultMode: 'buildResult',
          derived: true,
          inputs: [{ id: 'source', path: 'source', type: 'entity', typeId: 'work_item', required: true }]
        }
      }
    });
    const producer = contract.paletteGroups.flatMap(group => group.items)
      .find(item => item.id === 'buildResult');

    expect(producer).toBeUndefined();
  });
});

describe('declaration wire legality', () => {
  const legality = args => declarationWireLegality(args);

  it('field nodes declare on a class node', () => {
    expect(legality({ sourceType: 'ctsField', targetType: 'ctsClass' })).toBe('declares');
    expect(legality({ sourceType: 'ctsState', targetType: 'ctsClass' })).toBeNull();
  });

  it('class and reference nodes bind origin species only; consumers adapt to their entity stream', () => {
    expect(legality({ sourceType: 'ctsClass', targetType: 'processNode', targetRecordKind: 'cts.construct' })).toBe('binds');
    expect(legality({ sourceType: 'ctsType', targetType: 'processNode', targetRecordKind: 'cts.read' })).toBe('binds');
    // consumer species carry no Type pin: their entity input accepts
    // instance streams only, never a declaration wire
    for (const kind of ['cts.mutate', 'cts.transition', 'cts.remove']) {
      expect(legality({ sourceType: 'ctsClass', targetType: 'processNode', targetRecordKind: kind })).toBeNull();
    }
    // v4 working-vocabulary records are not declaration-bindable
    expect(legality({ sourceType: 'ctsClass', targetType: 'processNode', targetRecordKind: 'effect.createEntity' })).toBeNull();
    // operator-bound and structure species carry no type to bind
    expect(legality({ sourceType: 'ctsClass', targetType: 'processNode', targetRecordKind: 'cts.service' })).toBeNull();
    expect(legality({ sourceType: 'ctsClass', targetType: 'processNode', targetRecordKind: 'cts.compose' })).toBeNull();
    expect(legality({ sourceType: 'ctsClass', targetType: 'processNode' })).toBeNull();
  });

  it('refuses every other declaration pairing', () => {
    // a declaration node is never a value source
    expect(legality({ sourceType: 'ctsField', targetType: 'processNode', targetRecordKind: 'value.math' })).toBeNull();
    expect(legality({ sourceType: 'ctsState', targetType: 'processNode', targetRecordKind: 'cts.transition' })).toBe('entry');
    expect(legality({ sourceType: 'ctsState', targetType: 'processNode', targetRecordKind: 'value.math' })).toBeNull();
    // ref fields receive their target types as wired inputs
    expect(legality({ sourceType: 'ctsClass', targetType: 'ctsField' })).toBe('targets');
    expect(legality({ sourceType: 'ctsType', targetType: 'ctsField' })).toBe('targets');
    // nothing feeds a class from the data plane
    expect(legality({ sourceType: 'processNode', targetType: 'ctsClass', targetRecordKind: 'source.literalItem' })).toBeNull();
    // no declaration-to-declaration wiring beside declares/children/transition/targets
    expect(legality({ sourceType: 'ctsField', targetType: 'ctsState' })).toBeNull();
    expect(legality({ sourceType: 'ctsState', targetType: 'ctsField' })).toBeNull();
  });

  it('class-to-class wires declare children; state-to-state wires nest', () => {
    expect(legality({ sourceType: 'ctsClass', targetType: 'ctsClass' })).toBe('children');
    expect(legality({ sourceType: 'ctsState', targetType: 'ctsState' })).toBe('nested');
  });

  it('children wires are legal exactly as drawn — the drawn target must parent', () => {
    // The wire leaves the child (in-tree class or type card) and enters
    // the parenting class's declare input; the pair below is the whole
    // legality surface (SPEC §5).
    expect(childrenWireLegality({ source: { type: 'ctsType' }, target: { type: 'ctsClass', class: 'group' } })).toBe(true);
    expect(childrenWireLegality({ source: { type: 'ctsClass', class: 'file' }, target: { type: 'ctsClass', class: 'group' } })).toBe(true);
    expect(childrenWireLegality({ source: { type: 'ctsClass', class: 'group' }, target: { type: 'ctsClass', class: 'item' } })).toBe(true);
    expect(childrenWireLegality({ source: { type: 'ctsClass', class: 'group' }, target: { type: 'ctsClass', class: 'file' } })).toBe(false);
    expect(childrenWireLegality({ source: { type: 'ctsClass', class: 'group' }, target: { type: 'ctsClass', class: 'party' } })).toBe(false);
    expect(childrenWireLegality({ source: { type: 'ctsClass', class: 'group' }, target: { type: 'ctsType' } })).toBe(false);
  });
});

describe('tree declaration compilation', () => {
  const classNode = (id, extra = {}) => ({ id: `class:${id}`, type: 'ctsClass', data: { typeId: id, class: 'process', ...extra } });
  const fieldNode = (typeId, name, descriptor) => ({
    id: `field:${typeId}:${name}`, type: 'ctsField', data: { typeId, name, descriptor }
  });
  const stateNode = (id, value, extra = {}) => ({
    id: `state:${id}:${value}`, type: 'ctsState', data: { value, ...extra }
  });
  const declares = (source, target, label) => ({
    id: `d:${source.id}-${target.id}`, source: source.id, target: target.id, role: 'type', label
  });

  it('compiles wired fields, states, transitions, and children edges', () => {
    const widget = classNode('widget');
    const gadget = classNode('gadget');
    const construct = { id: 'mk', type: 'processNode', data: { refId: 'mk', typeId: 'widget' } };
    const nodes = [
      widget,
      gadget,
      fieldNode('widget', 'name', { base: 'string' }),
      fieldNode('widget', 'width', { base: 'quantity', unit: 'mm' }),
      stateNode('widget', 'raw'),
      stateNode('widget', 'done'),
      stateNode('widget', 'archived'),
      stateNode('gadget', 'new'),
      construct
    ];
    const edges = [
      declares(nodes[2], widget, 'field'),
      declares(nodes[3], widget, 'field'),
      // entry: the state wired into the construct IS the machine entry
      { id: 'entry1', source: nodes[4].id, target: 'mk', role: 'type', label: 'entry' },
      // nesting: `archived` nests under `done` (SPEC §7); transitions
      // come from transition nodes only
      { id: 'n1', source: nodes[6].id, target: nodes[5].id, role: 'type', label: 'nested' },
      // children: the child's output wires into the parent's declare input
      { id: 'c1', source: gadget.id, target: widget.id, role: 'type', label: 'children', data: { key: 'parts', onRemove: 'cascade' } }
    ];
    const { declarations, diagnostics } = compileTreeDeclarations(nodes, edges);
    expect(diagnostics).toEqual([]);
    const compiled = Object.fromEntries(declarations.map(declaration => [declaration.id, declaration]));
    expect(compiled.widget.fields).toEqual({
      name: { base: 'string' },
      width: { base: 'quantity', unit: 'mm' }
    });
    // State nodes declare no type facet (SPEC §7): the posted declaration
    // carries fields and edges only — the state vocabulary stays draft
    // authoring wired into create/transition sockets.
    expect(compiled.widget.states).toBeUndefined();
    expect(compiled.widget.transitions).toBeUndefined();
    expect(compiled.widget.edges).toEqual({ children: { parts: { types: ['gadget'], onRemove: 'cascade' } } });
  });

  it('a class wired to itself declares recursive containment (SPEC §6)', () => {
    const assembly = classNode('assembly', { class: 'item' });
    const nodes = [assembly, fieldNode('assembly', 'name', { base: 'string' })];
    const edges = [
      declares(nodes[1], assembly, 'field'),
      { id: `c:${assembly.id}-${assembly.id}`, source: assembly.id, target: assembly.id, role: 'type', label: 'children', data: { key: 'parts', onRemove: 'restrict' } }
    ];
    const { declarations, diagnostics } = compileTreeDeclarations(nodes, edges);
    expect(diagnostics).toEqual([]);
    expect(declarations[0].edges).toEqual({ children: { parts: { types: ['assembly'], onRemove: 'restrict' } } });
  });

  it('a file class carries its authored payload traits into the posted declaration', () => {
    const blueprint = classNode('blueprint', {
      class: 'file',
      payload: { mime: ['image/*', 'application/pdf'], maxSize: 5 * 1024 * 1024, creation: ['upload', 'capture'] }
    });
    const { declarations, diagnostics } = compileTreeDeclarations([blueprint], []);
    expect(diagnostics).toEqual([]);
    expect(declarations[0].payload).toEqual({
      mime: ['image/*', 'application/pdf'],
      maxSize: 5 * 1024 * 1024,
      creation: ['upload', 'capture']
    });
  });

  it('authored field names are labels; the row id derives, not validates', () => {
    const widget = classNode('widget');
    const nodes = [widget,
      fieldNode('widget', 'Anythin', { base: 'string' }),
      fieldNode('widget', 'Cut speed', { base: 'quantity', unit: 'mm' })
    ];
    const edges = [declares(nodes[1], widget, 'field'), declares(nodes[2], widget, 'field')];
    const { declarations, diagnostics } = compileTreeDeclarations(nodes, edges);
    expect(diagnostics).toEqual([]);
    const fields = declarations.find(declaration => declaration.id === 'widget').fields;
    // The authored spelling survives as the label; the id is plumbing.
    expect(fields).toEqual({
      anythin: { base: 'string', label: 'Anythin' },
      cutSpeed: { base: 'quantity', unit: 'mm', label: 'Cut speed' }
    });
  });

  it('a field name in any script carries its identifier flag onto the posted declaration', () => {
    const widget = classNode('widget');
    const nodes = [widget,
      fieldNode('widget', 'Наименование', { base: 'string', identifier: true }),
      fieldNode('widget', 'Serial', { base: 'string' })
    ];
    const edges = [declares(nodes[1], widget, 'field'), declares(nodes[2], widget, 'field')];
    const { declarations, diagnostics } = compileTreeDeclarations(nodes, edges);
    expect(diagnostics).toEqual([]);
    const fields = declarations[0].fields;
    const digested = Object.keys(fields).find(key => key !== 'serial');
    expect(fields[digested]).toEqual({ base: 'string', identifier: true, label: 'Наименование' });
    expect(() => normalizeType({ ...declarations[0], scope: 'org', organizationId: 'o1' })).not.toThrow();
    // Stable mint: the same name derives the same key on every compile.
    const again = compileTreeDeclarations(nodes, edges).declarations[0].fields;
    expect(again[digested]).toEqual(fields[digested]);
  });

  it('derives the row key from the latin segments of a mixed-script name', () => {
    const widget = classNode('widget');
    const nodes = [widget, fieldNode('widget', 'Ширина sheet', { base: 'string' })];
    const edges = [declares(nodes[1], widget, 'field')];
    const { declarations, diagnostics } = compileTreeDeclarations(nodes, edges);
    expect(diagnostics).toEqual([]);
    expect(declarations[0].fields).toEqual({ sheet: { base: 'string', label: 'Ширина sheet' } });
  });

  it('descriptor display tokens compile verbatim onto the declaration (SPEC §4)', () => {
    const widget = classNode('widget');
    const nodes = [widget,
      fieldNode('widget', 'Serial', {
        base: 'string', label: 'Serial number', display: 'code', control: 'textarea',
        identifier: true, depiction: true
      }),
      // An authored label wins over the name-derived default.
      fieldNode('widget', 'Cut speed', { base: 'quantity', unit: 'mm', label: 'Speed' })
    ];
    const edges = [declares(nodes[1], widget, 'field'), declares(nodes[2], widget, 'field')];
    const { declarations, diagnostics } = compileTreeDeclarations(nodes, edges);
    expect(diagnostics).toEqual([]);
    expect(declarations[0].fields).toEqual({
      serial: {
        base: 'string', label: 'Serial number', display: 'code', control: 'textarea',
        identifier: true, depiction: true
      },
      cutSpeed: { base: 'quantity', unit: 'mm', label: 'Speed' }
    });
  });

  it('compiles the class name and glyph as top-level declaration keys', () => {
    const widget = classNode('widget', { name: 'Widget', glyph: 'pi pi-star' });
    const { declarations } = compileTreeDeclarations([widget], []);
    expect(declarations[0].name).toBe('Widget');
    expect(declarations[0].glyph).toBe('pi pi-star');
    expect(declarations[0].render).toBeUndefined();
    // Absent authored keys stay absent: the class default table derives
    // the glyph and the boundary adopts the name.
    const bare = compileTreeDeclarations([classNode('gadget')], []).declarations[0];
    expect(Object.hasOwn(bare, 'name')).toBe(false);
    expect(Object.hasOwn(bare, 'glyph')).toBe(false);
  });

  it('carries class-node declared migration steps onto the declaration (SPEC §11)', () => {
    const withSteps = classNode('widget', {
      migrate: [{ kind: 'rename-field', from: 'anythin', to: 'anything' }]
    });
    const { declarations } = compileTreeDeclarations([withSteps], []);
    expect(declarations[0].migrate).toEqual([
      { kind: 'rename-field', from: 'anythin', to: 'anything' }
    ]);
    // Absent by default: a tree without authored steps never carries the key.
    const { declarations: bare } = compileTreeDeclarations([classNode('gadget')], []);
    expect(Object.hasOwn(bare[0], 'migrate')).toBe(false);
    // An empty array is authoring residue, not a declaration.
    const { declarations: emptied } = compileTreeDeclarations(
      [classNode('gizmo', { migrate: [] })], []
    );
    expect(Object.hasOwn(emptied[0], 'migrate')).toBe(false);
  });

  it('no state is an initial — initials are construct socket authoring (SPEC §7)', () => {
    const widget = classNode('widget');
    const nodes = [classNode('widget'), stateNode('widget', 'raw'), stateNode('widget', 'done')];
    const edges = [];
    const compiled = compileTreeDeclarations(nodes, edges);
    expect(compiled.diagnostics).toEqual([]);

    // two constructs wired to different states: each construct owns its
    // own initial — there is no class-level initial to disagree about
    const constructA = { id: 'ca', type: 'processNode', data: { refId: 'ca', typeId: 'widget' } };
    const constructB = { id: 'cb', type: 'processNode', data: { refId: 'cb', typeId: 'widget' } };
    const wired = compileTreeDeclarations(
      [...nodes, constructA, constructB],
      [...edges,
        { id: 'e1', source: nodes[1].id, target: 'ca', role: 'type', label: 'entry' },
        { id: 'e2', source: nodes[2].id, target: 'cb', role: 'type', label: 'entry' }],
      {
        ca: { id: 'ca', kind: 'cts.construct', typeId: 'widget' },
        cb: { id: 'cb', kind: 'cts.construct', typeId: 'widget' }
      }
    );
    expect(wired.diagnostics).toEqual([]);
  });

  it('a sole wired state declares nothing on the type — it is wiring vocabulary', () => {
    const widget = classNode('widget');
    const nodes = [widget, stateNode('widget', 'raw')];
    const { declarations, diagnostics } = compileTreeDeclarations(nodes, []);
    expect(diagnostics).toEqual([]);
    expect(declarations[0].states).toBeUndefined();
  });

  it('transition records carry no declaration synthesis — authored targets validate against the state nodes', () => {
    const goo = classNode('t-uth93vgdab');
    const nodes = [
      goo,
      stateNode('t-uth93vgdab', 'GOO'),
      stateNode('t-uth93vgdab', 'CHANGED')
    ];
    const edges = [];
    const records = {
      move: {
        id: 'move',
        kind: 'cts.transition',
        typeId: 't-uth93vgdab',
        inputDefaults: { state: 'CHANGED' }
      }
    };
    const { declarations, diagnostics } = compileTreeDeclarations(nodes, edges, records);
    expect(diagnostics).toEqual([]);
    expect(declarations[0].states).toBeUndefined();
    expect(declarations[0].transitions).toBeUndefined();
  });

  it('rejects a transition record that targets an undeclared state', () => {
    const widget = classNode('widget');
    const nodes = [widget, stateNode('widget', 'raw')];
    const edges = [];
    const records = {
      ship: {
        id: 'ship',
        kind: 'cts.transition',
        typeId: 'widget',
        state: { to: 'SHIPPED' }
      }
    };
    const { diagnostics } = compileTreeDeclarations(nodes, edges, records);
    expect(diagnostics.some(message => message.includes('state SHIPPED not declared in this draft'))).toBe(true);
  });

  it('an untargeted transition is a declaration diagnostic naming the node; archive transitions are exempt', () => {
    const widget = classNode('widget');
    const nodes = [widget, stateNode('widget', 'raw')];
    const edges = [];
    const records = {
      unauthored: { id: 'unauthored', kind: 'cts.transition', typeId: 'widget' },
      archiver: { id: 'archiver', kind: 'cts.transition', typeId: 'widget', archive: true }
    };
    const { diagnostics } = compileTreeDeclarations(nodes, edges, records);
    expect(diagnostics).toEqual(['transition unauthored: pick a target state']);
  });

  it('invalid field descriptors surface as diagnostics naming the type and field', () => {
    const widget = classNode('widget');
    const bad = fieldNode('widget', 'broken', { base: 'quantity' });
    const { diagnostics } = compileTreeDeclarations([widget, bad], [declares(bad, widget, 'field')]);
    expect(diagnostics[0]).toContain('widget');
    expect(diagnostics[0]).toContain('broken');
  });

  it('state values may repeat across the draft (SPEC 7 per-type vocabularies)', () => {
    const widget = classNode('widget', { name: 'Widget' });
    const gadget = classNode('gadget', { name: 'Gadget' });
    const nodes = [widget, gadget, stateNode('widget', 'raw'), stateNode('widget', 'raw'), stateNode('gadget', 'raw')];
    const { diagnostics } = compileTreeDeclarations(nodes, []);
    expect(diagnostics.some(message => message.includes('duplicate state name'))).toBe(false);
  });

  it('diagnostics children wires on file classes instead of emitting the edge', () => {
    const invoice = classNode('t-invoice-1', { class: 'file', name: 'Invoice' });
    const part = classNode('t-part-1', { class: 'item' });
    const { declarations, diagnostics } = compileTreeDeclarations(
      [invoice, part],
      [{ id: 'c1', source: part.id, target: invoice.id, role: 'type', label: 'children', data: { key: 'parts' } }]
    );
    expect(diagnostics.some(message => (
      message.includes('Invoice') && message.includes('may not declare lineage children')
    ))).toBe(true);
    expect(declarations.find(declaration => declaration.id === 't-invoice-1').edges).toBeUndefined();
    // The same wire on a membership-bearing class still compiles.
    const bin = classNode('t-bin-1', { class: 'group', name: 'Bin' });
    const kept = compileTreeDeclarations(
      [bin, part],
      [{ id: 'c2', source: part.id, target: bin.id, role: 'type', label: 'children', data: { key: 'parts' } }]
    );
    expect(kept.diagnostics).toEqual([]);
    expect(kept.declarations.find(declaration => declaration.id === 't-bin-1').edges)
      .toEqual({ children: { parts: { types: ['t-part-1'], onRemove: 'restrict' } } });
  });

  it('emits declarations in dependency order regardless of canvas node order', () => {
    // The parent is the FIRST canvas node, but its children edge references
    // the child: the child declaration must come out first so one apply can
    // introduce both — the registry compiles cross-references only against
    // stored and already posted types.
    const parent = classNode('t-parent-1', { class: 'group' });
    const child = classNode('t-child-1', { class: 'item', fields: undefined });
    const refParent = classNode('t-ref-parent-1', {
      class: 'file',
      name: 'Index',
      operators: undefined
    });
    const nodes = [parent, child, refParent];
    const edges = [
      { id: 'c1', source: child.id, target: parent.id, role: 'type', label: 'children', data: { key: 'parts' } },
      declares(fieldNode('t-ref-parent-1', 'part', { base: 'ref', accepts: ['t-child-1'] }), refParent, 'field')
    ];
    const { declarations } = compileTreeDeclarations(nodes, edges);
    const ids = declarations.map(declaration => declaration.id);
    expect(ids.indexOf('t-child-1')).toBeLessThan(ids.indexOf('t-parent-1'));
    expect(ids.indexOf('t-child-1')).toBeLessThan(ids.indexOf('t-ref-parent-1'));
  });

  it('cyclic nesting chains are diagnostics', () => {
    const a = stateNode('widget', 'raw');
    const b = stateNode('widget', 'done');
    const { diagnostics } = compileTreeDeclarations(
      [a, b],
      [
        { id: 't1', source: a.id, target: b.id, role: 'type', label: 'nested' },
        { id: 't2', source: b.id, target: a.id, role: 'type', label: 'nested' }
      ]
    );
    expect(diagnostics.some(message => message.includes('cyclic nesting chain'))).toBe(true);
  });

  it('compiles declared operators through the registry rules (R5) with named diagnostics', () => {
    const widget = classNode('widget', {
      operators: [
        { id: 'bake-widget', species: 'construct', input: { base: 'record', fields: { name: { base: 'string' } } }, output: { base: 'ref', accepts: ['widget'] }, triggers: [{ event: 'widget.requested' }] },
        { id: '', species: 'service', input: null, output: null, triggers: [] }
      ]
    });
    const { declarations, diagnostics } = compileTreeDeclarations([widget], []);
    expect(declarations[0].operators['bake-widget']).toMatchObject({
      species: 'construct',
      triggers: [{ event: 'widget.requested' }]
    });
    expect(diagnostics.some(message => message.includes('operator (unnamed)'))).toBe(true);
  });
});

describe('field display-role toggles', () => {
  const fieldNode = (id, typeId, descriptor) => ({ id, type: 'ctsField', data: { typeId, name: id, descriptor } });

  it('moves the identifier flag between the sibling fields of one type', () => {
    const nodes = [
      fieldNode('title', 'widget', { base: 'string', identifier: true }),
      fieldNode('code', 'widget', { base: 'string' })
    ];
    applyFieldDisplayRole(nodes, 'code', 'identifier', true);
    expect(nodes[0].data.descriptor.identifier).toBeUndefined();
    expect(nodes[1].data.descriptor.identifier).toBe(true);
    // Disabling removes the flag — the boundary mint owns the default,
    // never the toggle.
    applyFieldDisplayRole(nodes, 'code', 'identifier', false);
    expect(nodes[1].data.descriptor.identifier).toBeUndefined();
  });

  it('moves the depiction flag without touching the identifier', () => {
    const nodes = [
      fieldNode('title', 'widget', { base: 'string', identifier: true }),
      fieldNode('photo', 'widget', { base: 'string', depiction: true })
    ];
    applyFieldDisplayRole(nodes, 'title', 'depiction', true);
    expect(nodes[0].data.descriptor.depiction).toBe(true);
    expect(nodes[0].data.descriptor.identifier).toBe(true);
    expect(nodes[1].data.descriptor.depiction).toBeUndefined();
  });

  it('never crosses type boundaries and leaves unbound fields alone', () => {
    const nodes = [
      fieldNode('title', 'widget', { base: 'string', identifier: true }),
      fieldNode('name', 'gadget', { base: 'string' }),
      fieldNode('loose', null, { base: 'string' })
    ];
    applyFieldDisplayRole(nodes, 'name', 'identifier', true);
    expect(nodes[0].data.descriptor.identifier).toBe(true);
    expect(nodes[1].data.descriptor.identifier).toBe(true);
    // An unbound field toggles its own flag only — it declares nowhere.
    applyFieldDisplayRole(nodes, 'loose', 'identifier', true);
    expect(nodes[2].data.descriptor.identifier).toBe(true);
    expect(nodes[1].data.descriptor.identifier).toBe(true);
  });
});

describe('declaration node ports', () => {
  it('gives every declaration handle a typed spec', () => {
    const classPorts = declarationNodePorts({ type: 'ctsClass', data: { typeId: 'panel' } });
    expect(classPorts.inputSpecs[0]).toMatchObject({ id: 'declare', role: 'data' });
    expect(classPorts.outputSpecs[0]).toMatchObject({ id: 'type', type: { base: 'entityRef', typeId: 'panel' } });

    const fieldPorts = declarationNodePorts({ type: 'ctsField', data: { name: 'width', descriptor: { base: 'quantity', unit: 'mm' } } });
    expect(fieldPorts.outputSpecs[0]).toMatchObject({ id: 'field', label: 'width' });

    // the state node's nesting input and value output are real specs
    const statePorts = declarationNodePorts({ type: 'ctsState', data: { value: 'raw' } });
    expect(statePorts.inputSpecs[0]).toMatchObject({ id: 'state', type: { base: 'status' } });
    expect(statePorts.outputSpecs[0]).toMatchObject({ id: 'state', type: { base: 'status' } });

    const typePorts = declarationNodePorts({ type: 'ctsType', data: { typeId: 'sheet' } }, [{ id: 'sheet' }]);
    expect(typePorts.outputSpecs[0]).toMatchObject({ id: 'type', type: { base: 'entityRef', typeId: 'sheet' } });
    expect(declarationNodePorts({ type: 'ctsType', data: { typeId: '' } }, [{ id: 'sheet' }]).outputSpecs).toEqual([]);
  });
});

describe('live declaration wire interpretation', () => {
  const graph = () => ({
    nodes: [
      { id: 'cls', type: 'ctsClass', data: { typeId: 'panel', fields: 0 } },
      { id: 'f1', type: 'ctsField', data: { typeId: null, name: 'width' } },
      { id: 's1', type: 'ctsState', data: { value: 'raw' } },
      { id: 'ctor', type: 'processNode', data: { refId: 'ctor' } }
    ],
    edges: [
      { id: 'd1', source: 'f1', target: 'cls', role: 'type', label: 'field' },
      { id: 'e1', source: 's1', target: 'ctor', role: 'type', label: 'entry' },
      { id: 'b1', source: 'cls', target: 'ctor', role: 'type', label: 'type' }
    ],
    records: { ctor: { id: 'ctor', kind: 'cts.construct', typeId: '' } }
  });
  const apply = (state, mutations) => {
    for (const mutation of mutations) {
      if (mutation.scope === 'node') {
        state.nodes.find(node => node.id === mutation.nodeId).data[mutation.key] = mutation.value;
      } else if (mutation.key === 'typeId') {
        state.records[mutation.recordId].typeId = mutation.value;
      } else {
        const [head, tail] = String(mutation.key).split('.');
        const record = state.records[mutation.recordId];
        record[head] = { ...(record[head] || {}), [tail]: mutation.value };
      }
    }
  };

  it('derives declaration node type ids, class counts, and record bindings from the wires', () => {
    const state = graph();
    const first = interpretDeclarationEdges(state.nodes, state.edges, state.records, {});
    apply(state, first.mutations);
    expect(state.nodes.find(node => node.id === 'f1').data.typeId).toBe('panel');
    expect(state.nodes.find(node => node.id === 'cls').data).toMatchObject({ fields: 1 });
    expect(state.records.ctor.typeId).toBe('panel');
    // The entry wire authors the construct's initial state (SPEC §7).
    expect(state.records.ctor.inputDefaults.state).toBe('raw');

    // a settled graph interprets to nothing — evaluation is idempotent
    const second = interpretDeclarationEdges(state.nodes, state.edges, state.records, first.bindings);
    expect(second.mutations).toEqual([]);
  });

  it('authors a wired field path from the seam row key', () => {
    const state = graph();
    state.nodes.push({ id: 'f2', type: 'ctsField', data: { typeId: null, name: 'Ширина sheet' } });
    state.nodes.push({ id: 'get1', type: 'processNode', data: { refId: 'get1' } });
    state.edges.push({ id: 'd2', source: 'f2', target: 'cls', role: 'type', label: 'field' });
    state.edges.push({ id: 'fe1', source: 'f2', target: 'get1', role: 'type', label: 'entry' });
    state.records.get1 = { id: 'get1', kind: 'cts.field', path: '' };
    const pass = interpretDeclarationEdges(state.nodes, state.edges, state.records, {});
    const pathMutation = pass.mutations.find(mutation => mutation.scope === 'record' && mutation.key === 'path');
    expect(pathMutation?.value).toBe('fields.sheet');
  });

  it('re-binds descendants live when the class is renamed', () => {
    const state = graph();
    apply(state, interpretDeclarationEdges(state.nodes, state.edges, state.records, {}).mutations);
    state.nodes.find(node => node.id === 'cls').data.typeId = 'plate';
    const pass = interpretDeclarationEdges(state.nodes, state.edges, state.records, {});
    apply(state, pass.mutations);
    expect(state.nodes.find(node => node.id === 'f1').data.typeId).toBe('plate');
    expect(state.records.ctor.typeId).toBe('plate');
  });

  it('unbinds when the wire is removed but keeps palette-preset bindings', () => {
    const state = graph();
    const first = interpretDeclarationEdges(state.nodes, state.edges, state.records, {});
    apply(state, first.mutations);
    state.edges = state.edges.filter(edge => edge.id !== 'b1');
    const pass = interpretDeclarationEdges(state.nodes, state.edges, state.records, first.bindings);
    apply(state, pass.mutations);
    expect(state.records.ctor.typeId).toBe('');

    // a record bound by preset (no wire ever) is authored data: untouched
    const preset = interpretDeclarationEdges(
      state.nodes,
      state.edges.filter(edge => edge.id !== 'e1'),
      { ctor: { id: 'ctor', kind: 'cts.construct', typeId: 'sheet' } },
      {}
    );
    expect(preset.mutations.filter(mutation => mutation.scope === 'record')).toEqual([]);
  });

  it('clears the binding when the source class loses its type id', () => {
    const state = graph();
    apply(state, interpretDeclarationEdges(state.nodes, state.edges, state.records, {}).mutations);
    state.nodes.find(node => node.id === 'cls').data.typeId = '';
    const pass = interpretDeclarationEdges(state.nodes, state.edges, state.records, {});
    apply(state, pass.mutations);
    expect(state.records.ctor.typeId).toBe('');
    expect(state.nodes.find(node => node.id === 'f1').data.typeId).toBeNull();
  });

  it('derives a ref field\'s accepted targets from its target wires', () => {
    const nodes = [
      { id: 'clsA', type: 'ctsClass', data: { typeId: 'panel', fields: 0, states: 0 } },
      { id: 'clsB', type: 'ctsClass', data: { typeId: 'plate', fields: 0, states: 0 } },
      { id: 'f1', type: 'ctsField', data: { typeId: 'machine', name: 'design', descriptor: { base: 'ref', accepts: [] } } }
    ];
    const edges = [
      { id: 't1', source: 'clsA', target: 'f1', role: 'type', label: 'ref-target' },
      { id: 't2', source: 'clsB', target: 'f1', role: 'type', label: 'ref-target' }
    ];
    const pass = interpretDeclarationEdges(nodes, edges, {}, {});
    apply({ nodes, records: {} }, pass.mutations);
    expect(nodes.find(node => node.id === 'f1').data.descriptor.accepts).toEqual(['panel', 'plate']);

    // renaming a target class re-derives the accepts live
    nodes.find(node => node.id === 'clsB').data.typeId = 'sheet';
    const next = interpretDeclarationEdges(nodes, edges, {}, {});
    apply({ nodes, records: {} }, next.mutations);
    expect(nodes.find(node => node.id === 'f1').data.descriptor.accepts).toEqual(['panel', 'sheet']);

    // unwired ref fields keep their authored accepts
    const unwired = interpretDeclarationEdges(nodes, [], {}, {});
    apply({ nodes, records: {} }, unwired.mutations);
    expect(nodes.find(node => node.id === 'f1').data.descriptor.accepts).toEqual(['panel', 'sheet']);
  });

  it('adapts consumer species to their entity input when no binds wire exists', () => {
    const nodes = [
      { id: 'src', type: 'processNode', data: { refId: 'src' } },
      { id: 'mut', type: 'processNode', data: { refId: 'mut' } }
    ];
    const edges = [
      { id: 'flow', source: 'src', target: 'mut', sourceHandle: 'data:result', targetHandle: 'data:entity' }
    ];
    const records = {
      src: { id: 'src', kind: 'cts.construct', typeId: 'sheet' },
      mut: { id: 'mut', kind: 'cts.mutate', typeId: '' }
    };
    const resolvers = { entityInputType: recordId => (recordId === 'mut' ? 'sheet' : '') };
    const pass = interpretDeclarationEdges(nodes, edges, records, {}, resolvers);
    apply({ nodes, records }, pass.mutations);
    expect(records.mut.typeId).toBe('sheet');

    // the entity source re-typing re-binds the consumer live
    records.src.typeId = 'plate';
    const next = interpretDeclarationEdges(nodes, edges, records, pass.bindings, {
      entityInputType: () => 'plate'
    });
    apply({ nodes, records }, next.mutations);
    expect(records.mut.typeId).toBe('plate');

    // unplugging the entity wire unbinds the consumer it had adapted
    const unplugged = interpretDeclarationEdges(nodes, [], records, next.bindings, { entityInputType: () => '' });
    apply({ nodes, records }, unplugged.mutations);
    expect(records.mut.typeId).toBe('');

    // a stored preset survives when no channel ever supplied a binding
    const preset = interpretDeclarationEdges(nodes, [], { mut: { id: 'mut', kind: 'cts.mutate', typeId: 'sheet' } }, {}, resolvers);
    expect(preset.mutations.filter(mutation => mutation.scope === 'record')).toEqual([]);
  });

  it('adapts the instance elimination form to its entity input like every consumer species', () => {
    const nodes = [
      { id: 'src', type: 'processNode', data: { refId: 'src' } },
      { id: 'dec', type: 'processNode', data: { refId: 'dec' } }
    ];
    const edges = [
      { id: 'flow', source: 'src', target: 'dec', sourceHandle: 'data:result', targetHandle: 'data:entity' }
    ];
    const records = {
      src: { id: 'src', kind: 'cts.construct', typeId: 'panel' },
      dec: { id: 'dec', kind: 'cts.decompose', typeId: '' }
    };
    const pass = interpretDeclarationEdges(nodes, edges, records, {}, {
      entityInputType: recordId => (recordId === 'dec' ? 'panel' : '')
    });
    apply({ nodes, records }, pass.mutations);
    expect(records.dec.typeId).toBe('panel');

    const unplugged = interpretDeclarationEdges(nodes, [], records, pass.bindings, { entityInputType: () => '' });
    apply({ nodes, records }, unplugged.mutations);
    expect(records.dec.typeId).toBe('');
  });
});
