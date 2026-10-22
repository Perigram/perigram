// Transition actor assignment (CTS SPEC §7): the user-typed actors
// socket and the compiled surface — assignment rides the graph (wire or
// authored socket default) and never prompts at action time.
import { describe, expect, it } from 'vitest';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '../../cts/src/index.js';
import { resolveCatalogNodePorts } from './node-catalog.js';
import { compileProcessDefinition } from './compiler-core.js';

describe('transition actors socket', () => {
  it('carries a user-typed list input beside entity, note, and state', () => {
    const ports = resolveCatalogNodePorts({ id: 't1', kind: 'cts.transition', typeId: 'panel' }, {});
    const actors = ports.inputs.find(port => port.id === 'actors');
    expect(actors).toMatchObject({ type: { base: 'entityRef', typeId: 'user' }, required: false });
  });
});

describe('compiled transition actions expose no actors prompt', () => {
  function compiledWith(transition, extraNodes = [], extraEdges = []) {
    const registry = createTypeRegistry();
    for (const declaration of frameworkTypes) registry.defineType(declaration);
    registry.defineType({
      id: 'panel', class: 'item', name: 'Panel',
      fields: { serial: { base: 'string' } }
    });
    const domain = projectDomainFromView(registry, 'org-actors');
    return compileProcessDefinition({
      graphProtocol: 5,
      dataflowVersion: 4,
      graph: {
        nodes: [
          { id: 'create', type: 'processNode', data: { refId: 'create' } },
          { id: 't1', type: 'processNode', data: { refId: 't1' } },
          ...extraNodes.map(node => ({ id: node.id, type: 'processNode', data: { refId: node.id } }))
        ],
        edges: extraEdges
      },
      roleGrants: {},
      ctsTypes: {
        s1: { id: 's1', kind: 'state', typeId: 'panel', value: 'available' },
        s2: { id: 's2', kind: 'state', typeId: 'panel', value: 'done' }
      },
      processNodes: {
        create: {
          id: 'create', kind: 'cts.construct', typeId: 'panel',
          producerOutputId: 'create:result',
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] },
          inputDefaults: { state: 'available' }
        },
        t1: {
          id: 't1', kind: 'cts.transition', typeId: 'panel',
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] },
          state: { to: 'done' },
          ...transition
        },
        ...Object.fromEntries(extraNodes.map(node => [node.id, node]))
      },
      producerOutputs: {
        'create:result': {
          producerOutputId: 'create:result', nodeId: 'create', outputSocketId: 'result',
          typeId: 'panel', lifecycle: { mode: 'domainDefault' },
          fields: { read: ['fields.serial'], write: [], private: [] }
        }
      },
      actions: {}, services: {}, sockets: {}, screens: {}, stateDefinitions: {}, valueInputs: {}
    }, domain, {});
  }

  it('keeps the action inputs empty wired or not', () => {
    const unwired = compiledWith({ inputDefaults: { actors: ['u-1'] } });
    expect(unwired.actions.t1.inputs).toEqual([]);

    const wired = compiledWith(
      {},
      [{ id: 'who', kind: 'source.currentUser', typeId: null }],
      [{ id: 'e1', source: 'who', sourceHandle: 'data:value', target: 't1', targetHandle: 'data:actors', role: 'data' }]
    );
    expect(wired.actions.t1.inputs).toEqual([]);
    expect(wired.actions.t1.assignment).toBeUndefined();
  });
});
