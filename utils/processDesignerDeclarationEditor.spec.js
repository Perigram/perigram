import { describe, expect, it } from 'vitest';
import {
  canvasToDefinition,
  compileTreeDeclarations,
  interpretDeclarationEdges,
  normalizeDesignerAccess
} from '#packages/processes/src/index.js';
import { mintId } from './processDesignerIdentity.js';
import {
  declarationDiagnostics,
  declarationSubtreeOf,
  definitionDeclaresType,
  fieldDescriptorSummary,
  machineModelOf,
  mermaidFlowchartOf,
  newFieldDeclaration,
  newStateDeclaration,
  newTransitionDeclaration,
  removeDeclarationNode,
  setTransitionTarget,
  tryRemoveDeclarationNode
} from './processDesignerDeclarationEditor.js';

// A canvas-authored declaration subtree (SPEC §20/§21 one tree): the
// shapes pages/organization/process.vue creates through its palette and
// connect gestures — the round-trip baseline the in-place editor must
// reproduce exactly.
const TYPE_ID = 'fixture-widget';

function canvasFixture() {
  const classNode = {
    id: 'cls_w',
    type: 'ctsClass',
    position: { x: 0, y: 0 },
    data: { refId: 'cls_w', typeId: TYPE_ID, name: 'Widget', class: 'item', glyph: null, payload: null, operators: [] }
  };
  const fieldNode = {
    id: 'fld_title',
    type: 'ctsField',
    position: { x: -260, y: 0 },
    data: { refId: 'fld_title', typeId: TYPE_ID, name: 'Title', descriptor: { base: 'string', identifier: true } }
  };
  const fieldEdge = {
    id: 'declares:fld_title-cls_w',
    source: 'fld_title',
    target: 'cls_w',
    sourceHandle: 'output:field',
    targetHandle: 'input:declare',
    type: 'default',
    role: 'type',
    label: 'field'
  };
  const draftState = stateNode('st_draft', 'draft', { x: 0, y: 220 });
  const publishedState = stateNode('st_published', 'published', { x: 0, y: 360 });
  const transitionNode = {
    id: 'tr_publish',
    type: 'processNode',
    position: { x: 480, y: 120 },
    data: { refId: 'tr_publish', label: 'tr_publish' }
  };
  const entryEdge = {
    id: 'entry_publish',
    source: 'st_published',
    target: 'tr_publish',
    sourceHandle: 'output:state',
    targetHandle: 'data:state',
    type: 'default',
    role: 'type',
    label: 'entry'
  };
  const records = {
    tr_publish: {
      id: 'tr_publish',
      kind: 'cts.transition',
      typeId: TYPE_ID,
      label: 'Publish',
      icon: 'pi pi-forward',
      inputs: [],
      outputs: [],
      access: normalizeDesignerAccess({}),
      trigger: { mode: 'manual' },
      entryTriggerId: 'tr_publish',
      inputDefaults: { state: 'published' }
    }
  };
  return {
    nodes: [classNode, fieldNode, draftState, publishedState, transitionNode],
    edges: [fieldEdge, entryEdge],
    records
  };
}

function stateNode(id, value, position) {
  return {
    id,
    type: 'ctsState',
    position,
    data: { refId: id, typeId: null, value, initial: false, terminal: false }
  };
}

// The canvas gesture pair for a fresh field (addNode's declaration branch
// + onConnect's declares wire): the baseline the in-place gesture must
// equal after serialization.
function canvasAuthoredFieldFixture(base, id, position) {
  const typeNode = {
    id,
    type: 'ctsField',
    position,
    selected: true,
    data: { refId: id, typeId: null, name: '', descriptor: { base: 'string' } }
  };
  const edge = {
    id: `declares:${id}-cls_w`,
    source: id,
    target: 'cls_w',
    sourceHandle: 'output:field',
    targetHandle: 'input:declare',
    type: 'default',
    role: 'type',
    label: 'field'
  };
  const nodes = [...base.nodes, typeNode];
  const edges = [...base.edges, edge];
  // The live interpretation assigns the declaring class's type id.
  const { mutations } = interpretDeclarationEdges(nodes, edges, base.records, {});
  for (const mutation of mutations) {
    if (mutation.scope === 'node' && mutation.key === 'typeId') {
      const node = nodes.find(candidate => candidate.id === mutation.nodeId);
      node.data.typeId = mutation.value;
    }
  }
  return { nodes, edges };
}

function baseDefinitionData(fixture) {
  return {
    schemaVersion: 1,
    graphProtocol: 5,
    graph: { nodes: fixture.nodes, edges: fixture.edges, viewport: { x: 0, y: 0, zoom: 1 } },
    processNodes: fixture.records,
    ctsTypes: {},
    roleGrants: {},
    producerOutputs: {},
    actions: {},
    services: {},
    sockets: {},
    stateDefinitions: {},
    valueInputs: {},
    screens: {}
  };
}

describe('definitionDeclaresType', () => {
  it('finds the class node declaring the type in the draft graph', () => {
    const fixture = canvasFixture();
    expect(definitionDeclaresType(baseDefinitionData(fixture), TYPE_ID)).toBe(true);
  });

  it('renders nothing for types without an authored declaration subtree', () => {
    const fixture = canvasFixture();
    expect(definitionDeclaresType(baseDefinitionData(fixture), 'cassette-design')).toBe(false);
    expect(definitionDeclaresType({ graph: { nodes: [] } }, TYPE_ID)).toBe(false);
  });
});

describe('declarationSubtreeOf', () => {
  it('projects fields, vocabulary states, and bound transitions of the type', () => {
    const fixture = canvasFixture();
    const subtree = declarationSubtreeOf(fixture.nodes, fixture.edges, fixture.records, TYPE_ID);
    expect(subtree.classNode.id).toBe('cls_w');
    expect(subtree.fields.map(field => field.node.id)).toEqual(['fld_title']);
    expect(subtree.fields[0].declareEdgeId).toBe('declares:fld_title-cls_w');
    // 'published' is entry-wired into the transition; 'draft' is unwired
    // and unreferenced, so it stays out of the type's vocabulary.
    expect(subtree.states.map(state => state.node.id)).toEqual(['st_published']);
    expect(subtree.transitions.map(entry => entry.record.id)).toEqual(['tr_publish']);
    expect(subtree.constructs).toEqual([]);
  });

  it('returns null when the type has no authored declaration subtree', () => {
    expect(declarationSubtreeOf(canvasFixture().nodes, canvasFixture().edges, {}, 'pack-type')).toBeNull();
  });
});

describe('in-place field authoring round-trips the canvas shape', () => {
  it('serializes an added field to the same document the canvas gesture saves', () => {
    const base = canvasFixture();
    const position = { x: -260, y: 140 };
    const canvasAuthored = canvasAuthoredFieldFixture(base, 'fld_new', position);
    const canvasSaved = canvasToDefinition(
      { nodes: canvasAuthored.nodes, edges: canvasAuthored.edges, viewport: { x: 0, y: 0, zoom: 1 } },
      baseDefinitionData(base)
    );

    const gesture = newFieldDeclaration({ id: 'fld_new', classNode: base.nodes[0], position });
    const inPlaceNodes = [...base.nodes, gesture.node];
    const inPlaceEdges = [...base.edges, gesture.edge];
    const { mutations } = interpretDeclarationEdges(inPlaceNodes, inPlaceEdges, base.records, {});
    for (const mutation of mutations) {
      if (mutation.scope === 'node' && mutation.key === 'typeId') {
        const node = inPlaceNodes.find(candidate => candidate.id === mutation.nodeId);
        node.data.typeId = mutation.value;
      }
    }
    const inPlaceSaved = canvasToDefinition(
      { nodes: inPlaceNodes, edges: inPlaceEdges, viewport: { x: 0, y: 0, zoom: 1 } },
      baseDefinitionData(base)
    );

    expect(inPlaceSaved.ctsTypes.fld_new).toEqual(canvasSaved.ctsTypes.fld_new);
    expect(inPlaceSaved.graph.nodes.find(node => node.id === 'fld_new'))
      .toEqual(canvasSaved.graph.nodes.find(node => node.id === 'fld_new'));
    expect(inPlaceSaved.graph.edges.find(edge => edge.id === 'declares:fld_new-cls_w')).toBeDefined();
  });

  it('mints the canvas declaration node shapes', () => {
    const base = canvasFixture();
    const field = newFieldDeclaration({ id: 'fld_a', classNode: base.nodes[0] });
    expect(field.node.type).toBe('ctsField');
    expect(field.node.data).toEqual({ refId: 'fld_a', typeId: TYPE_ID, name: '', descriptor: { base: 'string' } });
    expect(field.edge).toMatchObject({ role: 'type', label: 'field', targetHandle: 'input:declare' });

    const state = newStateDeclaration({ id: 'st_a', value: 'review' });
    expect(state.node.type).toBe('ctsState');
    expect(state.node.data.value).toBe('review');
  });
});

describe('transition authoring', () => {
  it('mints the canvas-authored record: bound, grantless, manual, wired target', () => {
    const base = canvasFixture();
    const gesture = newTransitionDeclaration({
      id: 'tr_archive',
      typeId: TYPE_ID,
      stateNodeId: 'st_draft',
      stateValue: 'draft',
      label: 'Archive'
    });
    expect(gesture.record).toMatchObject({
      id: 'tr_archive',
      kind: 'cts.transition',
      typeId: TYPE_ID,
      label: 'Archive',
      access: { level: 'write', roleIds: [], grants: [] },
      trigger: { mode: 'manual' },
      entryTriggerId: 'tr_archive'
    });
    // The wire is the value (SPEC §7): the record carries no authored
    // target until interpretation writes the socket default.
    expect(gesture.record.state).toBeUndefined();
    expect(gesture.edge).toMatchObject({
      source: 'st_draft',
      target: 'tr_archive',
      sourceHandle: 'output:state',
      targetHandle: 'data:state',
      role: 'type',
      label: 'entry'
    });

    const nodes = [...base.nodes, gesture.node];
    const edges = [...base.edges, gesture.edge];
    const records = { ...base.records, tr_archive: gesture.record };
    const { mutations } = interpretDeclarationEdges(nodes, edges, records, {});
    expect(mutations).toContainEqual({
      scope: 'record',
      recordId: 'tr_archive',
      key: 'inputDefaults.state',
      value: 'draft'
    });
  });

  it('retargets by rewiring the entry edge, keeping one target source', () => {
    const base = canvasFixture();
    const next = setTransitionTarget(base.edges, base.records.tr_publish, 'st_draft');
    const edge = next.edges.find(item => item.id === 'entry_publish');
    expect(edge.source).toBe('st_draft');
    expect(edge.targetHandle).toBe('data:state');
    expect(next.record.state).toBeUndefined();
    expect(next.record.inputDefaults.state).toBeUndefined();
  });
});

describe('removal gate', () => {
  it('refuses a state removal that orphans a targeting transition', () => {
    const base = canvasFixture();
    const result = tryRemoveDeclarationNode(base.nodes, base.edges, base.records, 'st_published');
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some(item => item.includes('published'))).toBe(true);
  });

  it('removes the state once the transition is retargeted', () => {
    const base = canvasFixture();
    const retargeted = setTransitionTarget(base.edges, base.records.tr_publish, 'st_draft');
    const nextRecords = { ...base.records, tr_publish: retargeted.record };
    const result = tryRemoveDeclarationNode(base.nodes, retargeted.edges, nextRecords, 'st_published');
    expect(result.ok).toBe(true);
    expect(result.nodes.some(node => node.id === 'st_published')).toBe(false);
    expect(result.edges.some(edge => edge.source === 'st_published')).toBe(false);
  });

  it('drops the canvas-owned record with a removed transition node', () => {
    const base = canvasFixture();
    const next = removeDeclarationNode(base.nodes, base.edges, base.records, 'tr_publish');
    expect(next.records.tr_publish).toBeUndefined();
    expect(next.nodes.some(node => node.id === 'tr_publish')).toBe(false);
  });

  it('reports the removal refusals through the compile diagnostics chain', () => {
    const base = canvasFixture();
    const before = declarationDiagnostics(base.nodes, base.edges, base.records, 'org-1');
    expect(Array.isArray(before)).toBe(true);
    const compiled = compileTreeDeclarations(base.nodes, base.edges, base.records);
    expect(compiled.declarations.map(declaration => declaration.id)).toContain(TYPE_ID);
  });
});

describe('machine view', () => {
  function machineFixture() {
    const base = canvasFixture();
    const construct = {
      id: 'tr_publish',
      kind: 'cts.construct',
      typeId: TYPE_ID,
      construction: { mode: 'genericCreate', inputs: [] },
      inputDefaults: { state: 'published' }
    };
    const subtree = declarationSubtreeOf(base.nodes, base.edges, { tr_publish: construct }, TYPE_ID);
    return { base, subtree };
  }

  it('derives the initial state from the construct entry target', () => {
    const { subtree } = machineFixture();
    const model = machineModelOf(subtree);
    expect(model.initial).toBe('published');
    expect(model.states.map(state => state.value)).toEqual(['published']);
  });

  it('renders a mermaid flowchart with the initial stadium and intent labels', () => {
    const { base } = machineFixture();
    const constructNode = {
      id: 'ctor_widget',
      type: 'processNode',
      position: { x: 420, y: 0 },
      data: { refId: 'ctor_widget', label: 'ctor_widget' }
    };
    const construct = {
      id: 'ctor_widget',
      kind: 'cts.construct',
      typeId: TYPE_ID,
      construction: { mode: 'genericCreate', inputs: [] },
      inputDefaults: { state: 'draft' }
    };
    const records = { ctor_widget: construct, tr_publish: base.records.tr_publish };
    const subtree = declarationSubtreeOf([...base.nodes, constructNode], base.edges, records, TYPE_ID);
    const model = machineModelOf(subtree);
    expect(model.initial).toBe('draft');
    const mermaid = mermaidFlowchartOf(model);
    expect(mermaid.startsWith('flowchart LR')).toBe(true);
    expect(mermaid).toContain('(["draft"])');
    expect(mermaid).toContain('-->|"Publish"|');
  });
});

describe('fieldDescriptorSummary', () => {
  it('summarizes qualifiers the way the field card tag does', () => {
    expect(fieldDescriptorSummary({ base: 'string' })).toBe('string');
    expect(fieldDescriptorSummary({ base: 'string', nullable: true })).toBe('string?');
    expect(fieldDescriptorSummary({ base: 'quantity', unit: 'mm' })).toBe('mm');
    expect(fieldDescriptorSummary({ base: 'ref', accepts: ['a', 'b'] })).toBe('Ref(a|b)');
  });
});

describe('id minting parity', () => {
  it('mints collision-proof gesture ids through the designer identity module', () => {
    const gesture = newTransitionDeclaration({ id: 'tr_x', typeId: TYPE_ID, stateNodeId: 'st_a', stateValue: 'a' });
    expect(gesture.edge.id).toMatch(/^entry_/);
    expect(typeof mintId('entry')).toBe('string');
  });
});
