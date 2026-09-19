// SAVE persists the tree as authored (SPEC §20/§21): a draft whose nodes
// are bound to types declared IN-TREE (`ctsTypes` records traveling with
// the draft) must pass protocol acceptance — the declarations only land
// in the registry at APPLY. The acceptance domain overlays the draft's
// own declarations; without it every in-tree binding 400s with
// `unknown type` and saving is broken.
import { describe, it, expect } from 'vitest';
import { createTypeRegistry, projectDomainFromView } from '../../../packages/cts/src/index.js';
import { cncTypePack } from '../../../packages/cts/src/pack/cnc.js';
import { frameworkTypes } from '../../../packages/cts/src/pack/framework.js';
import { cncDomain } from '../../../packages/domain-cnc/src/index.js';
import { currentProcessDefinition } from './compiler-adapter.js';

function projectedDomain() {
  const view = createTypeRegistry({ id: 'draft-overlay' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) {
    view.defineType(declaration);
  }
  return projectDomainFromView(view, 'org-1', cncDomain);
}

// The shape the designer persists after authoring a class with one field
// and one state, wiring a construct to it, and adapting a mutate to the
// construct's stream.
function draftWithInTreeType() {
  return {
    dataflowVersion: 4,
    graphProtocol: 5,
    graph: {
      nodes: [
        { id: 'cls', type: 'ctsClass', position: { x: 0, y: 0 }, data: { refId: 'cls' } },
        { id: 'f1', type: 'ctsField', position: { x: 1, y: 0 }, data: { refId: 'f1' } },
        { id: 's1', type: 'ctsState', position: { x: 1, y: 1 }, data: { refId: 's1' } },
        { id: 'ctor', type: 'processNode', position: { x: 2, y: 0 }, data: { refId: 'ctor' } },
        { id: 'mut', type: 'processNode', position: { x: 3, y: 0 }, data: { refId: 'mut' } }
      ],
      edges: [
        { id: 'd1', source: 'f1', target: 'cls', role: 'type', label: 'field' },
        { id: 'd2', source: 's1', target: 'cls', role: 'type', label: 'state' },
        { id: 'b1', source: 'cls', target: 'ctor', role: 'type', label: 'type' },
        { id: 'flow', source: 'ctor', target: 'mut', sourceHandle: 'data:result', targetHandle: 'data:entity' }
      ]
    },
    roleGrants: {},
    producerOutputs: {},
    actions: {},
    services: {},
    sockets: {},
    statusDefinitions: {},
    valueInputs: {},
    screens: {},
    ctsTypes: {
      cls: { id: 'cls', kind: 'class', typeId: 'panel', class: 'item' },
      f1: { id: 'f1', kind: 'field', typeId: 'panel', name: 'width', descriptor: { base: 'quantity', unit: 'mm' } },
      s1: { id: 's1', kind: 'state', typeId: 'panel', value: 'raw', initial: true, terminal: false }
    },
    processNodes: {
      ctor: {
        id: 'ctor', kind: 'cts.construct', typeId: 'panel', via: 'genericCreate',
        trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
      },
      mut: {
        id: 'mut', kind: 'cts.mutate', typeId: 'panel',
        trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
      }
    }
  };
}

describe('draft declaration overlay at protocol acceptance', () => {
  it('accepts a draft bound to its own in-tree type at save time', () => {
    const lowered = currentProcessDefinition(draftWithInTreeType(), projectedDomain());
    expect(lowered.processNodes.ctor).toMatchObject({ kind: 'effect.createEntity', entityType: 'panel' });
    expect(lowered.processNodes.mut).toMatchObject({ kind: 'effect.updateEntity', entityType: 'panel' });
  });

  it('still rejects bindings to types nobody declares anywhere', () => {
    const draft = draftWithInTreeType();
    draft.processNodes.ctor.typeId = 'ghost';
    expect(() => currentProcessDefinition(draft, projectedDomain()))
      .toThrow(/unknown type ghost/);
  });

  it('keeps unfinished declarations authored, not fatal', () => {
    const draft = draftWithInTreeType();
    // A class renamed mid-authoring to an id that cannot register: the
    // overlay stubs it, live interpretation has re-bound its wired nodes
    // to the current id, and the draft still saves — APPLY reports the
    // declaration error where it belongs.
    draft.ctsTypes.cls.typeId = 'My Panel';
    draft.processNodes.ctor.typeId = 'My Panel';
    draft.processNodes.mut.typeId = 'My Panel';
    const lowered = currentProcessDefinition(draft, projectedDomain());
    expect(lowered.processNodes.ctor).toMatchObject({ entityType: 'My Panel' });
  });
});
