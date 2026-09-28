import { describe, expect, it } from 'vitest';
import { createTypeRegistry } from '../../cts/src/index.js';
import { projectDomainFromView } from '../../cts/src/index.js';
import { compileProcessDefinition } from './compiler-core.js';

// Machine vocabulary seeding (SPEC §7): state records seed the machines of
// their type's producers. A scoped record binds by its authored typeId; an
// unscoped value token binds through its ENTRY WIRES — the wire into a
// construct or transition of a type is the token's type binding, so a
// shared vocabulary must be wired where it is meant and never leaks into
// every producer's machine (the board lanes of one type must not carry
// another type's states).

function domain() {
  const registry = createTypeRegistry();
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
        fields: { read: ['identity.*'], write: [], private: [] }
      },
      'noteCreate:result': {
        producerOutputId: 'noteCreate:result', nodeId: 'noteCreate', outputSocketId: 'result',
        typeId: 'note', lifecycle: { mode: 'domainDefault' },
        fields: { read: ['identity.*'], write: [], private: [] }
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
});
