import { describe, expect, it } from 'vitest';
import {
  createTypeRegistry,
  frameworkTypes,
  projectDomainFromView
} from '../../cts/src/index.js';
import { cncTypePack } from '../../cts/src/pack/cnc.js';
import {
  operationKindOf,
  resolveCtsDefinition
} from '../../cts/src/index.js';
import { resolveCatalogNodePorts } from './node-catalog.js';
import {
  compileProcessDefinition,
  executeProcessDataNode,
  executeProcessEffectNode,
  normalizeProcessDefinition,
  resolveRoleAssignmentAccess,
  validateProcessDefinition
} from './index.js';
import { createDataPacket } from './data-tree.js';

function nativeDomain() {
  const registry = createTypeRegistry({ id: 'native-cts-execution' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) registry.defineType(declaration);
  registry.defineType({
    id: 'panel',
    class: 'item',
    name: 'Panel',
    fields: {
      name: { base: 'string' },
      note: { base: 'string', nullable: true }
    },
    states: {
      main: {
        initial: 'draft',
        states: {
          draft: {},
          active: {},
          archived: { terminal: true }
        }
      }
    },
    transitions: [
      { axis: 'main', from: 'draft', to: 'active', intent: 'activate' },
      { axis: 'main', from: 'active', to: 'archived', intent: 'archive' }
    ]
  });
  registry.defineType({
    id: 'rack',
    class: 'group',
    name: 'Rack',
    fields: {
      name: { base: 'string' }
    },
    edges: {
      children: { panels: { types: ['panel'], onRemove: 'restrict' } }
    },
    states: {
      main: {
        initial: 'draft',
        states: {
          draft: {},
          active: {},
          archived: { terminal: true }
        }
      }
    },
    transitions: [
      { axis: 'main', from: 'draft', to: 'active', intent: 'activate' },
      { axis: 'main', from: 'active', to: 'archived', intent: 'archive' }
    ]
  });
  return projectDomainFromView(registry, 'org-native');
}

function graph(records, edges = []) {
  return {
    graphProtocol: 5,
    dataflowVersion: 4,
    graph: {
      nodes: records.map(record => ({ id: record.id, type: 'processNode', data: { refId: record.id } })),
      edges
    },
    roleGrants: {},
    producerOutputs: {},
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: Object.fromEntries(records.map(record => [record.id, record]))
  };
}

function portsFor(record, domain) {
  return resolveCatalogNodePorts(record, {
    domain,
    fieldSchema: domain.fieldSchemas[record.typeId]?.find(field => field.path === record.path) || null,
    fieldSchemas: domain.fieldSchemas[record.typeId] || []
  });
}

describe('native CTS process execution contract', () => {
  it('treats party types as readable principals — reads and fields pass, effect species refuse', () => {
    const domain = nativeDomain();
    expect(domain.entities.find(entity => entity.type === 'user')?.party).toBe(true);

    const readable = validateProcessDefinition(graph([
      { id: 'users', kind: 'cts.read', select: 'all', typeId: 'user' },
      { id: 'email', kind: 'cts.field', typeId: 'user', path: 'fields.email', path: 'fields.email' }
    ], [{
      id: 'users-email',
      source: 'users',
      sourceHandle: 'data:result',
      target: 'email',
      targetHandle: 'data:entity',
      role: 'data'
    }]), domain);
    expect(readable.errors).toEqual([]);

    for (const kind of ['cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove']) {
      const refused = validateProcessDefinition(graph([{ id: 'op', kind, typeId: 'user' }]), domain);
      expect(refused.errors.join('\n'), kind).toContain('cannot target party type user');
    }
  });

  it('mints the run-context principal sources with fixed party-typed outputs', () => {
    const domain = nativeDomain();
    const who = portsFor({ kind: 'source.currentUser' }, domain);
    const which = portsFor({ kind: 'source.currentOrganization' }, domain);

    expect(who.outputs[0]).toMatchObject({ id: 'value', type: { base: 'entityRef', typeId: 'user' } });
    expect(which.outputs[0]).toMatchObject({ id: 'value', type: { base: 'entityRef', typeId: 'organization' } });
  });

  it('keeps native species kinds, discriminators, socket ids, and graph edges through resolution', () => {
    const domain = nativeDomain();
    const definition = graph([
      { id: 'read', kind: 'cts.read', select: 'parent', typeId: 'panel' },
      { id: 'field', kind: 'cts.field', typeId: 'panel', path: 'fields.name' },
      { id: 'mutate', kind: 'cts.mutate', typeId: 'panel' }
    ], [{
      id: 'read-field',
      source: 'read',
      sourceHandle: 'data:entity',
      target: 'field',
      targetHandle: 'data:entity',
      role: 'data'
    }]);

    const { definition: resolved, diagnostics } = resolveCtsDefinition(definition, domain);

    expect(diagnostics).toEqual([]);
    expect(Object.values(resolved.processNodes).map(node => node.kind)).toEqual([
      'cts.read',
      'cts.field',
      'cts.mutate'
    ]);
    expect(resolved.processNodes.read.select).toBe('parent');
    expect(resolved.graph.edges).toEqual(definition.graph.edges);
    expect(resolveCatalogNodePorts(resolved.processNodes.field, { domain, fieldSchemas: domain.fieldSchemas.panel }).inputs[0].id).toBe('entity');
  });

  it('exposes native entity and field sockets without legacy block/status ports', () => {
    const domain = nativeDomain();
    const construct = portsFor({
      kind: 'cts.construct',
      typeId: 'panel',
      construction: { mode: 'genericCreate', inputs: [{ id: 'name', path: 'fields.name', type: 'string', required: true }] }
    }, domain);
    const mutate = portsFor({ kind: 'cts.mutate', typeId: 'panel' }, domain);
    const transition = portsFor({
      kind: 'cts.transition',
      typeId: 'panel',
      state: { axis: 'main', from: 'draft', to: 'active' }
    }, domain);
    const read = portsFor({ kind: 'cts.read', select: 'parent', typeId: 'panel' }, domain);
    const field = portsFor({ kind: 'cts.field', typeId: 'panel', path: 'fields.name' }, domain);

    expect(construct.inputs.map(port => port.id)).toEqual(['in', 'type', 'lineage.rackId', 'fields.name', 'fields.note', 'state']);
    expect(construct.inputs.some(port => port.id === 'states.main')).toBe(false);
    expect(mutate.inputs.map(port => port.id)).toEqual(['in', 'entity', 'fields.name', 'fields.note']);
    expect(mutate.inputs.some(port => port.id === 'states.main')).toBe(false);
    expect(transition.inputs.map(port => port.id)).toEqual(['in', 'entity', 'note', 'state', 'actors']);
    expect(read.inputs.map(port => port.id)).toEqual(['entity']);
    expect(field.inputs.map(port => port.id)).toEqual(['entity', 'field']);
    expect(field.inputs[0]).toMatchObject({ id: 'entity', type: { base: 'entityRef', typeId: 'panel' } });
  });

  it('types the Get field output from the record path', () => {
    const domain = nativeDomain();
    const viaPath = portsFor({ kind: 'cts.field', typeId: 'panel', path: 'fields.name' }, domain);
    expect(viaPath.outputs[0]).toMatchObject({ id: 'value', type: { base: 'string' } });
    // A party row stays typed through the same home.
    const partyRow = portsFor({ kind: 'cts.field', typeId: 'user', path: 'fields.email' }, domain);
    expect(partyRow.outputs[0]).toMatchObject({ id: 'value', type: { base: 'string' } });
  });

  it('derives native construct and consumer actions without replacing the process-node record', () => {
    const domain = nativeDomain();
    const construct = {
      id: 'create',
      kind: 'cts.construct',
      typeId: 'panel',
      producerOutputId: 'create:result',
      construction: { mode: 'genericCreate', inputs: [{ id: 'fields.name', path: 'fields.name', type: 'string', required: true, prompt: true }] },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
    };
    const mutate = {
      id: 'mutate',
      kind: 'cts.mutate',
      typeId: 'panel',
      inputDefaults: { 'fields.name': 'Renamed' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
    };
    const definition = graph([construct, mutate], [{
      id: 'create-mutate',
      source: 'create',
      sourceHandle: 'data:result',
      target: 'mutate',
      targetHandle: 'data:entity',
      role: 'data'
    }]);
    definition.producerOutputs['create:result'] = {
      producerOutputId: 'create:result',
      nodeId: 'create',
      outputSocketId: 'result',
      typeId: 'panel',
      lifecycle: { mode: 'domainDefault' },
      fields: { read: ['name'], write: ['fields.name', 'fields.note'], private: [] }
    };

    const normalized = normalizeProcessDefinition(definition, domain);
    expect(normalized.processNodes.create.kind).toBe('cts.construct');
    expect(normalized.processNodes.mutate.kind).toBe('cts.mutate');
    expect(normalized.actions.create).toMatchObject({ actionKind: 'createEntity', typeId: 'panel' });
    expect(normalized.actions.mutate).toMatchObject({ actionKind: 'updateEntity', typeId: 'panel' });
    expect(normalized.actions.mutate.producerOutputId).toBeUndefined();

    const compiled = compileProcessDefinition(definition, domain, {
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } }
    });
    expect(compiled.processNodes.create.kind).toBe('cts.construct');
    expect(compiled.processNodes.mutate.kind).toBe('cts.mutate');
    expect(compiled.actions.mutate).toMatchObject({ typeId: 'panel' });
    expect(compiled.actions.mutate.producerOutputId).toBeNull();
  });

  it('derives a transition action from the declared target and carries process access into the workflow', () => {
    const domain = nativeDomain();
    const definition = graph([{
      id: 'move',
      kind: 'cts.transition',
      typeId: 'panel',
      state: { axis: 'main', from: 'draft', to: 'active', intent: 'activate' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
    }]);
    definition.producerOutputs = {
      'seed:entity': {
        producerOutputId: 'seed:entity',
        nodeId: 'seed',
        outputSocketId: 'entity',
        typeId: 'panel',
        lifecycle: { mode: 'domainDefault' },
        fields: { read: ['name'], write: [], private: [] }
      }
    };
    // The domain projection carries no workflows (SPEC §7): the draft's own
    // state records author the panel vocabulary the transition targets.
    definition.ctsTypes = {
      panel_draft: { id: 'panel_draft', kind: 'state', typeId: 'panel', value: 'draft' },
      panel_active: { id: 'panel_active', kind: 'state', typeId: 'panel', value: 'active' },
      panel_archived: { id: 'panel_archived', kind: 'state', typeId: 'panel', value: 'archived', terminal: true }
    };

    const validation = validateProcessDefinition(definition, domain, {
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } }
    });
    expect(validation.errors).toEqual([]);
    const compiled = compileProcessDefinition(definition, domain, {
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } }
    });
    expect(compiled.actions.move).toMatchObject({
      actionKind: 'updateEntity',
      typeId: 'panel',
      state: { to: 'active' }
    });
    expect(compiled.producerOutputs['seed:entity'].workflow.regions.main.transitions)
      .toEqual(expect.arrayContaining([expect.objectContaining({ from: 'draft', to: 'active', processRoleIds: ['role_admin'] })]));
  });

  it('compiles a transition guard onto the derived action and the machine edge', () => {
    const domain = nativeDomain();
    const guard = {
      op: 'and',
      args: [
        { op: 'lt', args: [{ op: 'field', path: ['value', 'name'] }, { op: 'lit', value: 'zz' }] },
        { op: 'eq', args: [{ op: 'field', path: ['value', 'name'] }, { op: 'lit', value: 'kept' }] }
      ]
    };
    const definition = graph([{
      id: 'move',
      kind: 'cts.transition',
      typeId: 'panel',
      state: { axis: 'main', from: 'draft', to: 'active' },
      guard,
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
    }]);
    definition.producerOutputs = {
      'seed:entity': {
        producerOutputId: 'seed:entity',
        nodeId: 'seed',
        outputSocketId: 'entity',
        typeId: 'panel',
        lifecycle: { mode: 'domainDefault' },
        fields: { read: ['name'], write: [], private: [] }
      }
    };
    definition.ctsTypes = {
      panel_draft: { id: 'panel_draft', kind: 'state', typeId: 'panel', value: 'draft' },
      panel_active: { id: 'panel_active', kind: 'state', typeId: 'panel', value: 'active' }
    };

    const compiled = compileProcessDefinition(definition, domain, {
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } }
    });
    expect(compiled.actions.move.guard).toEqual(guard);
    expect(compiled.producerOutputs['seed:entity'].workflow.regions.main.transitions)
      .toEqual(expect.arrayContaining([expect.objectContaining({ from: 'draft', to: 'active', guard })]));
  });

  it('compiles graph-authored lineage from native construct lineage sockets and places the hierarchy', () => {
    const domain = nativeDomain();
    const roles = { role_admin: { id: 'role_admin', label: 'Admin' } };
    const construct = (id, typeId) => ({
      id,
      kind: 'cts.construct',
      typeId,
      producerOutputId: `${id}:result`,
      construction: { mode: 'genericCreate', inputs: [{ id: 'name', path: 'name', type: 'string', required: true, prompt: true }] },
      trigger: { mode: 'manual' },
      access: { level: 'admin', roleIds: ['role_admin'], grants: [{ roleId: 'role_admin', level: 'admin' }] }
    });
    const createRack = construct('create_rack', 'rack');
    const createPanel = {
      ...construct('create_panel', 'panel'),
      construction: {
        mode: 'genericCreate',
        inputs: [
          { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
          { id: 'lineage.rackId', label: 'Rack', path: 'lineage.rackId', type: 'entity', typeId: 'rack', required: false, prompt: true }
        ]
      }
    };
    const definition = graph([createRack, createPanel], [{
      id: 'rack-to-panel',
      source: 'create_rack',
      sourceHandle: 'data:result',
      target: 'create_panel',
      targetHandle: 'data:lineage.rackId',
      role: 'data'
    }]);
    definition.producerOutputs = {
      'create_rack:result': {
        producerOutputId: 'create_rack:result', nodeId: 'create_rack', outputSocketId: 'result',
        typeId: 'rack', lifecycle: { mode: 'defaultCreated' }, fields: { read: [], write: [], private: [] }
      },
      'create_panel:result': {
        producerOutputId: 'create_panel:result', nodeId: 'create_panel', outputSocketId: 'result',
        typeId: 'panel', lifecycle: { mode: 'defaultCreated' }, fields: { read: [], write: [], private: [] }
      }
    };

    const compiled = compileProcessDefinition(definition, domain, { roles });

    expect(compiled.lineageBindings).toEqual([{
      childTypeId: 'panel',
      parentTypeId: 'rack',
      lineageKey: 'rackId',
      producerOutputId: 'create_panel:result',
      sourceProducerOutputId: 'create_rack:result',
      sourceNode: 'create_rack',
      sourceSocket: 'data:result',
      consumingNode: 'create_panel',
      consumingSocket: 'data:lineage.rackId'
    }]);
    expect(compiled.producerOutputs['create_panel:result'].lineageBindings.map(binding => binding.lineageKey))
      .toEqual(['rackId']);

    // The compiled binding places the hierarchy beyond what the declared
    // children edge covers: the home source carries the compiled bindings
    // (the client's graph-pair suppression channel) and the child create
    // action resolves its contextual parent scope from the binding alone.
    const access = resolveRoleAssignmentAccess({
      compiled,
      assignment: { userId: 'user-1', roleIds: ['role_admin'], bindings: {} },
      domain
    });
    const home = access.screens.find(screen => screen.template === 'home');
    expect(home.sources.map(source => source.typeId)).toEqual(['rack']);
    expect(home.sources[0].lineageBindings.map(binding => (
      `${binding.childTypeId}<-${binding.parentTypeId}:${binding.lineageKey}`
    ))).toEqual(['panel<-rack:rackId']);
    const createPanelAction = Object.values(access.actions || {})
      .find(action => action.typeId === 'panel' && (action.actionKind || action.kind) === 'createInstance');
    expect(createPanelAction.parentTypeId).toBe('rack');
    const rackDetail = access.screens.find(screen => screen.template === 'instanceDetail' && screen.typeId === 'rack');
    expect(rackDetail.sources.some(source => (
      source.typeId === 'panel' && source.mode === 'list' && source.filters.rackId === '$screen.scope.instanceId'
    ))).toBe(true);
  });

  it('does not mint producer outputs for entity-bearing reads', async () => {    const domain = nativeDomain();
    const read = { id: 'read', kind: 'cts.read', select: 'parent', typeId: 'panel' };
    const definition = graph([read]);
    const normalized = normalizeProcessDefinition({
      ...definition,
      producerOutputs: {
        'read:entity': {
          producerOutputId: 'read:entity',
          nodeId: 'read',
          outputSocketId: 'entity',
          typeId: 'panel',
          fields: { read: [], write: [], private: [] }
        }
      }
    }, domain);
    expect(normalized.producerOutputs).not.toHaveProperty('read:entity');
    expect(operationKindOf(read)).toBe('cts.read');
  });

  it('routes native mutate leaf values into processUpdate and aligns scalar defaults deterministically', async () => {
    const domain = nativeDomain();
    const record = {
      id: 'mutate',
      kind: 'cts.mutate',
      typeId: 'panel',
      inputDefaults: { 'fields.name': 'Renamed' }
    };
    const result = await executeProcessEffectNode(record, {
      entity: createDataPacket([
        { type: 'panel', id: 'p1' },
        { type: 'panel', id: 'p2' }
      ], 'list'),
      'fields.name': createDataPacket('Renamed')
    }, async inputs => ({ ...inputs.entity, data: { name: inputs['fields.name'] } }));
    expect(result.branches[0].items).toEqual([
      { type: 'panel', id: 'p1', data: { name: 'Renamed' } },
      { type: 'panel', id: 'p2', data: { name: 'Renamed' } }
    ]);
  });

  it('keeps native reads and field projections executable as data nodes', async () => {
    const result = await executeProcessDataNode(
      { id: 'field', kind: 'cts.field', typeId: 'panel', path: 'fields.name' },
      { entity: createDataPacket({ type: 'panel', _id: 'p1', fields: { name: 'Panel' } }) }
    );
    expect(result.branches[0].items).toEqual(['Panel']);
    // The field socket is the channel: a wired path wins over the default.
    const wired = await executeProcessDataNode(
      { id: 'field', kind: 'cts.field', typeId: 'panel', path: 'fields.name' },
      {
        entity: createDataPacket({ type: 'panel', _id: 'p1', fields: { name: 'Panel' } }),
        field: createDataPacket('fields.name')
      }
    );
    expect(wired.branches[0].items).toEqual(['Panel']);
  });
});
