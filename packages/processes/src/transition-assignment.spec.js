// Transition actor assignment (CTS SPEC §7): the actors socket, the
// assignment facet's normalization, draft diagnostics, and the compiled
// action's prompt exposure.
import { describe, expect, it } from 'vitest';
import { createTypeRegistry, projectDomainFromView, frameworkTypes } from '../../cts/src/index.js';
import { resolveCatalogNodePorts } from './node-catalog.js';
import { normalizeTransitionAssignment, compileTreeDeclarations } from './designer.js';
import { compileProcessDefinition } from './compiler-core.js';

describe('transition actors socket', () => {
  it('carries a user-typed list input beside entity, note, and state', () => {
    const ports = resolveCatalogNodePorts({ id: 't1', kind: 'cts.transition', typeId: 'panel' }, {});
    const actors = ports.inputs.find(port => port.id === 'actors');
    expect(actors).toMatchObject({ type: { base: 'entityRef', typeId: 'user' }, required: false });
  });
});

describe('normalizeTransitionAssignment', () => {
  it('keeps a deduped scope list and string capability; drops everything else', () => {
    expect(normalizeTransitionAssignment({ scope: ['done', 'done'], capability: 'reviewer' }))
      .toEqual({ scope: ['done'], capability: 'reviewer' });
    expect(normalizeTransitionAssignment({ scope: [] })).toBeNull();
    expect(normalizeTransitionAssignment({ scope: 'done' })).toBeNull();
    expect(normalizeTransitionAssignment(null)).toBeNull();
  });
});

describe('transition assignment draft diagnostics', () => {
  const classNode = { id: 'cls', type: 'ctsClass', position: { x: 0, y: 0 }, data: { refId: 'cls', typeId: 'panel', class: 'item' } };
  const stateNode = value => ({
    id: `s-${value}`, type: 'ctsState', position: { x: 0, y: 240 },
    data: { refId: `s-${value}`, typeId: 'panel', value, terminal: false }
  });
  const transitionNode = { id: 't1', type: 'processNode', position: { x: 240, y: 0 }, data: { refId: 't1' } };

  function diagnosticsFor(records) {
    return compileTreeDeclarations(
      [classNode, stateNode('available'), stateNode('done'), transitionNode],
      [
        { id: 'd1', source: 's-available', target: 'cls', role: 'type', label: 'state' },
        { id: 'd2', source: 's-done', target: 'cls', role: 'type', label: 'state' }
      ],
      records
    ).diagnostics;
  }

  it('accepts a scope over declared states and names undeclared ones', () => {
    const good = diagnosticsFor({
      t1: { id: 't1', kind: 'cts.transition', typeId: 'panel', state: { to: 'done' }, assignment: { scope: ['done'], capability: 'reviewer' } }
    });
    expect(good).toEqual([]);

    const bad = diagnosticsFor({
      t1: { id: 't1', kind: 'cts.transition', typeId: 'panel', state: { to: 'done' }, assignment: { scope: ['ghost'] } },
      t2: { id: 't2', kind: 'cts.transition', typeId: 'panel', state: { to: 'done' }, assignment: { scope: 'done' } }
    });
    expect(bad).toContainEqual(expect.stringMatching(/t1: assignment scope names undeclared state ghost/));
    expect(bad).toContainEqual(expect.stringMatching(/t2: assignment scope must be a state list/));
  });
});

describe('compiled transition actions expose the assignment', () => {
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

  it('carries the facet and prompts the actors input when nothing supplies it', () => {
    const compiled = compiledWith({ assignment: { scope: ['done'], capability: 'reviewer' } });
    const action = compiled.actions.t1;
    expect(action.assignment).toEqual({ scope: ['done'], capability: 'reviewer' });
    expect(action.inputs).toContainEqual(expect.objectContaining({ id: 'actors', typeId: 'user', prompt: true }));
  });

  it('prompts nothing when a wire supplies the actors socket', () => {
    const compiled = compiledWith(
      { assignment: { capability: 'reviewer' } },
      [{ id: 'who', kind: 'source.currentUser', typeId: null }],
      [{ id: 'e1', source: 'who', sourceHandle: 'data:value', target: 't1', targetHandle: 'data:actors', role: 'data' }]
    );
    const action = compiled.actions.t1;
    expect(action.inputs.some(input => input.id === 'actors')).toBe(false);
  });
});
