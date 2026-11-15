import { describe, expect, it } from 'vitest';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '../../cts/src/index.js';
import { compileProcessDefinition } from './index.js';

// Machine vocabulary seeding (SPEC §7): state records seed the machines of
// their type's producers. A scoped record binds by its authored typeId; an
// unscoped value token binds through its ENTRY WIRES — the wire into a
// construct or transition of a type is the token's type binding, so a
// shared vocabulary must be wired where it is meant and never leaks into
// every producer's machine (the board lanes of one type must not carry
// another type's states).

function domain() {
  const registry = createTypeRegistry();
  for (const declaration of frameworkTypes) registry.defineType(declaration);
  registry.defineType({
    id: 'folder', class: 'group', name: 'Folder',
    fields: { name: { base: 'string' } }
  });
  registry.defineType({
    id: 'note', class: 'file', name: 'Note',
    fields: { body: { base: 'string' } }
  });
  return projectDomainFromView(registry, 'org-vocab');
}

function definition() {
  return {
    graphProtocol: 5,
    dataflowVersion: 4,
    graph: {
      nodes: [
        { id: 'folderCreate', type: 'processNode', data: { refId: 'folderCreate' } },
        { id: 'noteCreate', type: 'processNode', data: { refId: 'noteCreate' } },
        { id: 'sharedState', type: 'ctsState', data: { refId: 'sharedState' } },
        { id: 'noteState', type: 'ctsState', data: { refId: 'noteState' } },
        { id: 'orphanState', type: 'ctsState', data: { refId: 'orphanState' } }
      ],
      edges: [
        // The unscoped token binds where it is wired: folder only. Handles
        // mirror the persisted declaration wire (state output → state
        // input); normalization drops labels, so the compile matches the
        // wire structurally.
        { id: 'e1', source: 'sharedState', target: 'folderCreate', sourceHandle: 'output:state', targetHandle: 'data:state', role: 'type', label: 'entry' },
        // A scoped record needs no wire: its typeId binds it.
        { id: 'e2', source: 'noteState', target: 'noteCreate', sourceHandle: 'output:state', targetHandle: 'data:state', role: 'type', label: 'entry' }
      ]
    },
    roleGrants: {},
    ctsTypes: {
      sharedState: { id: 'sharedState', kind: 'state', typeId: null, value: 'inbox' },
      noteState: { id: 'noteState', kind: 'state', typeId: 'note', value: 'jotted' },
      orphanState: { id: 'orphanState', kind: 'state', typeId: null, value: 'floating' }
    },
    processNodes: {
      folderCreate: {
        id: 'folderCreate', kind: 'cts.construct', typeId: 'folder',
        producerOutputId: 'folderCreate:result',
        trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
      },
      noteCreate: {
        id: 'noteCreate', kind: 'cts.construct', typeId: 'note',
        producerOutputId: 'noteCreate:result',
        trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
      }
    },
    producerOutputs: {
      'folderCreate:result': {
        producerOutputId: 'folderCreate:result', nodeId: 'folderCreate', outputSocketId: 'result',
        typeId: 'folder', lifecycle: { mode: 'domainDefault' },
        fields: { read: ['name'], write: [], private: [] }
      },
      'noteCreate:result': {
        producerOutputId: 'noteCreate:result', nodeId: 'noteCreate', outputSocketId: 'result',
        typeId: 'note', lifecycle: { mode: 'domainDefault' },
        fields: { read: ['name'], write: [], private: [] }
      }
    },
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    stateDefinitions: {},
    valueInputs: {}
  };
}

function workflowStatesFor(compiled, producerOutputId) {
  const workflow = compiled.producerOutputs[producerOutputId]?.workflow || {};
  const region = workflow.regions?.[workflow.primaryRegion] || {};
  return Object.keys(region.states || {});
}

describe('machine vocabulary seeding follows the entry wires', () => {
  it('seeds an unscoped state token only into the wired type', () => {
    const compiled = compileProcessDefinition(definition(), domain(), { roles: {} });
    expect(workflowStatesFor(compiled, 'folderCreate:result')).toEqual(['inbox']);
    expect(workflowStatesFor(compiled, 'noteCreate:result')).toEqual(['jotted']);
  });

  it('drops an unscoped state token no entry wire binds', () => {
    const compiled = compileProcessDefinition(definition(), domain(), { roles: {} });
    const vocabularies = ['folderCreate:result', 'noteCreate:result']
      .map(id => workflowStatesFor(compiled, id).join(','));
    expect(vocabularies.join(';')).not.toContain('floating');
  });


  it('marks an event-wired transition edge process-owned; a manual transition stays a user edge', () => {
    const source = definition();
    source.ctsTypes.sharedState.typeId = 'folder';
    source.ctsTypes.orphanState.typeId = 'folder';
    source.ctsTypes.doneState = { id: 'doneState', kind: 'state', typeId: 'folder', value: 'done' };
    source.processNodes.toDone = {
      id: 'toDone', kind: 'cts.transition', typeId: 'folder',
      state: { from: 'inbox', to: 'done' },
      trigger: { mode: 'event' }, access: { level: 'write', grants: [] }
    };
    source.processNodes.toFloating = {
      id: 'toFloating', kind: 'cts.transition', typeId: 'folder',
      state: { from: 'inbox', to: 'floating' },
      trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
    };
    source.graph.nodes.push(
      { id: 'toDone', type: 'processNode', data: { refId: 'toDone' } },
      { id: 'toFloating', type: 'processNode', data: { refId: 'toFloating' } }
    );
    source.graph.edges.push({
      id: 'e3', source: 'folderCreate', target: 'toDone',
      sourceHandle: 'control:completed', targetHandle: 'control:in', role: 'control'
    });
    const compiled = compileProcessDefinition(source, domain(), { roles: {} });
    const workflow = compiled.producerOutputs['folderCreate:result'].workflow;
    const region = workflow.regions[workflow.primaryRegion];
    expect(region.transitions).toContainEqual(expect.objectContaining({ from: 'inbox', to: 'done', processOwned: true }));
    const manualEdge = region.transitions.find(transition => transition.from === 'inbox' && transition.to === 'floating');
    expect(manualEdge.processOwned).toBeUndefined();
  });
});
