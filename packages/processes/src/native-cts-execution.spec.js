import { describe, expect, it, vi } from 'vitest';
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
  validateProcessDefinition
} from './index.js';
import { createDataPacket } from './data-tree.js';
import { runProcessUntilSettled } from './orchestration.js';

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
  it('keeps native species kinds, discriminators, socket ids, and graph edges through resolution', () => {
    const domain = nativeDomain();
    const definition = graph([
      { id: 'read', kind: 'cts.read', select: 'parent', typeId: 'panel' },
      { id: 'field', kind: 'cts.field', typeId: 'panel', path: 'data.name' },
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
      construction: { mode: 'genericCreate', inputs: [{ id: 'name', path: 'data.name', type: 'string', required: true }] }
    }, domain);
    const mutate = portsFor({ kind: 'cts.mutate', typeId: 'panel' }, domain);
    const transition = portsFor({
      kind: 'cts.transition',
      typeId: 'panel',
      state: { axis: 'main', from: 'draft', to: 'active' }
    }, domain);
    const read = portsFor({ kind: 'cts.read', select: 'parent', typeId: 'panel' }, domain);
    const field = portsFor({ kind: 'cts.field', typeId: 'panel', path: 'data.name' }, domain);

    expect(construct.inputs.map(port => port.id)).toEqual(['in', 'type', 'data.name', 'data.note', 'state']);
    expect(construct.inputs.some(port => port.id === 'states.main')).toBe(false);
    expect(mutate.inputs.map(port => port.id)).toEqual(['in', 'entity', 'data.name', 'data.note']);
    expect(mutate.inputs.some(port => port.id === 'states.main')).toBe(false);
    expect(transition.inputs.map(port => port.id)).toEqual(['in', 'entity', 'note', 'state']);
    expect(read.inputs.map(port => port.id)).toEqual(['entity']);
    expect(field.inputs.map(port => port.id)).toEqual(['entity', 'field']);
    expect(field.inputs[0]).toMatchObject({ id: 'entity', type: { base: 'entity', typeId: 'panel' } });
  });

  it('derives native construct and consumer actions without replacing the process-node record', () => {
    const domain = nativeDomain();
    const construct = {
      id: 'create',
      kind: 'cts.construct',
      typeId: 'panel',
      producerOutputId: 'create:result',
      construction: { mode: 'genericCreate', inputs: [{ id: 'data.name', path: 'data.name', type: 'string', required: true, prompt: true }] },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
    };
    const mutate = {
      id: 'mutate',
      kind: 'cts.mutate',
      typeId: 'panel',
      inputDefaults: { 'data.name': 'Renamed' },
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
      fields: { read: ['identity.*'], write: ['data.name', 'data.note'], private: [] }
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
        fields: { read: ['identity.*'], write: [], private: [] }
      }
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

  it('does not mint producer outputs for entity-bearing reads', async () => {
    const domain = nativeDomain();
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
      inputDefaults: { 'data.name': 'Renamed' }
    };
    const result = await executeProcessEffectNode(record, {
      entity: createDataPacket([
        { type: 'panel', id: 'p1' },
        { type: 'panel', id: 'p2' }
      ], 'list'),
      'data.name': createDataPacket('Renamed')
    }, async inputs => ({ ...inputs.entity, data: { name: inputs['data.name'] } }));
    expect(result.branches[0].items).toEqual([
      { type: 'panel', id: 'p1', data: { name: 'Renamed' } },
      { type: 'panel', id: 'p2', data: { name: 'Renamed' } }
    ]);
  });

  it('executes native service and command records through the native dispatch seam', async () => {
    const domain = nativeDomain();
    const service = { id: 'service', kind: 'cts.service', operator: 'panel.ping', trigger: { mode: 'manual' } };
    const command = { id: 'command', kind: 'cts.command', commandId: 'panel.run', trigger: { mode: 'manual' } };
    const definition = graph([service, command], [
      { id: 'service-command', source: 'service', sourceHandle: 'control:completed', target: 'command', targetHandle: 'control:in', role: 'control' }
    ]);
    const executeEffect = vi.fn()
      .mockResolvedValueOnce({ value: 'ok' })
      .mockResolvedValueOnce({ value: 'done' });
    const completed = await runProcessUntilSettled(
      (await import('./orchestration.js')).createProcessRun(definition, { nodeId: 'service' }),
      definition,
      {
        executeEffect,
        catalogContext: record => ({
          domain: { ...domain, serviceContracts: { 'panel.ping': { id: 'panel.ping', command: 'panel.ping', signature: { input: { base: 'record', fields: {} }, output: { base: 'json' } } } } },
          command: { input: { entities: [], parameters: [] }, output: { entities: [] } }
        })
      }
    );
    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledTimes(2);
    expect(executeEffect.mock.calls.map(call => call[0].kind)).toEqual(['cts.service', 'cts.command']);
    expect(executeEffect.mock.calls[1][0].record.commandId).toBe('panel.run');
  });

  it('keeps native reads and field projections executable as data nodes', async () => {
    const result = await executeProcessDataNode(
      { id: 'field', kind: 'cts.field', typeId: 'panel', path: 'data.name' },
      { entity: createDataPacket({ type: 'panel', id: 'p1', data: { name: 'Panel' } }) }
    );
    expect(result.branches[0].items).toEqual(['Panel']);
  });
});
