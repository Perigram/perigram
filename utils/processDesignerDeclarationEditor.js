// Pure projection and authoring gestures for the in-place declaration
// editor (SPEC §1, owner direction 2026-11-06): the canvas declaration
// records are the one authoring model, and this module is the per-type
// projection over the same arrays the designer serializes. The gestures
// mint exactly the node/edge/record shapes the canvas palette and connect
// gestures create; compilation and diagnostics stay in
// `compileTreeDeclarations` (packages/processes) — nothing here
// re-validates.
import {
  applyFieldDisplayRole,
  authoredSocketDefault,
  compileTreeDeclarations,
  createProcessNodeRecord,
  normalizeDesignerAccess
} from '~/packages/processes/src/index.js';
import { normalizeType } from '~/packages/cts/src/index.js';
import { mintId } from './processDesignerIdentity.js';

// A definition stations a type's declaration when its draft graph carries
// the class node for it (SPEC §20/§21 one tree); pack and plugin types
// have no authored subtree and render no author affordance.
export function definitionDeclaresType(definitionData = {}, typeId = '') {
  const nodes = definitionData?.graph?.nodes;
  return Array.isArray(nodes)
    && nodes.some(node => node?.type === 'ctsClass' && node.data?.typeId === typeId);
}

export function classNodeForType(nodes = [], typeId = '') {
  return nodes.find(node => node.type === 'ctsClass' && node.data?.typeId === typeId) || null;
}

// The authored target of an operation (SPEC §7): a construct's initial
// state or a transition's target, wired or stored.
export function operationTargetState(record = {}) {
  const value = record.state?.to ?? authoredSocketDefault(record.inputDefaults?.state);
  return typeof value === 'string' ? value : '';
}

// The per-type declaration subtree: the class node, its declared fields
// (matched by binding, exactly like `compileTreeDeclarations` matches
// field records), the state nodes of the type's vocabulary (entry-wired
// into the type's constructs/transitions, or targeted by their stored
// state), and the bound construct/transition records.
export function declarationSubtreeOf(nodes = [], edges = [], records = {}, typeId = '') {
  const classNode = classNodeForType(nodes, typeId);
  if (!classNode) return null;
  const nodeById = new Map(nodes.map(node => [node.id, node]));

  const declareEdgeByField = new Map();
  for (const edge of edges) {
    if (edge.role !== 'type') continue;
    const source = nodeById.get(edge.source);
    if (source?.type === 'ctsField' && edge.target === classNode.id) declareEdgeByField.set(source.id, edge.id);
  }
  const fields = nodes
    .filter(node => node.type === 'ctsField' && (node.data?.typeId ?? null) === typeId)
    .map(node => ({ node, declareEdgeId: declareEdgeByField.get(node.id) || null }));

  const operations = [];
  for (const node of nodes) {
    if (node.type !== 'processNode' || !node.data?.refId) continue;
    const record = records[node.data.refId];
    if (record?.typeId !== typeId) continue;
    if (record.kind === 'cts.construct' || record.kind === 'cts.transition') {
      operations.push({ node, record });
    }
  }

  const entryEdgesByState = new Map();
  const operationNodeIds = new Set(operations.map(operation => operation.node.id));
  for (const edge of edges) {
    if (edge.role !== 'type' || edge.label !== 'entry') continue;
    if (!operationNodeIds.has(edge.target)) continue;
    const source = nodeById.get(edge.source);
    if (source?.type !== 'ctsState') continue;
    const list = entryEdgesByState.get(source.id) || [];
    list.push(edge.id);
    entryEdgesByState.set(source.id, list);
  }
  const targetedValues = new Set(operations.map(({ record }) => operationTargetState(record)).filter(Boolean));
  const states = nodes
    .filter(node => node.type === 'ctsState' && node.data?.value
      && (entryEdgesByState.has(node.id) || targetedValues.has(String(node.data.value))))
    .map(node => ({ node, entryEdgeIds: entryEdgesByState.get(node.id) || [] }));

  return {
    classNode,
    fields,
    states,
    transitions: operations.filter(operation => operation.record.kind === 'cts.transition'),
    constructs: operations.filter(operation => operation.record.kind === 'cts.construct')
  };
}

// The field-card tag derivation (components/type-designer FieldNode): the
// one summary of a descriptor's base and qualifier.
export function fieldDescriptorSummary(descriptor = {}) {
  if (descriptor.base === 'quantity') return `${descriptor.unit || '?'}`;
  if (descriptor.base === 'ref') return `Ref(${(descriptor.accepts || []).join('|')})`;
  if (descriptor.nullable) return `${descriptor.base}?`;
  return descriptor.base || 'field';
}

// Gestures mint the canvas shapes: declaration nodes seed the same data
// keys the designer's palette branch seeds, declares edges keep the
// deterministic `declares:` id, and entry wires land on the process-plane
// `data:state` handle.
export function newFieldDeclaration({ id, classNode, position = null }) {
  const typeId = classNode?.data?.typeId ?? null;
  return {
    node: {
      id,
      type: 'ctsField',
      position: position || besideClass(classNode, -260),
      data: { refId: id, typeId, name: '', descriptor: { base: 'string' } }
    },
    edge: {
      id: `declares:${id}-${classNode.id}`,
      source: id,
      target: classNode.id,
      sourceHandle: 'output:field',
      targetHandle: 'input:declare',
      type: 'default',
      role: 'type',
      label: 'field'
    }
  };
}

export function newStateDeclaration({ id, value, position = null }) {
  return {
    node: {
      id,
      type: 'ctsState',
      position: position || { x: 0, y: 220 },
      data: { refId: id, typeId: null, value: String(value || ''), initial: false, terminal: false }
    }
  };
}

export function newTransitionDeclaration({ id, typeId, stateNodeId = '', stateValue = '', label = '', position = null }) {
  const record = createProcessNodeRecord(id, 'cts.transition');
  record.typeId = typeId;
  if (label) record.label = label;
  record.access = normalizeDesignerAccess(record.access || {});
  record.trigger = { mode: 'manual' };
  record.entryTriggerId = id;
  return {
    node: {
      id,
      type: 'processNode',
      position: position || { x: 420, y: 120 },
      data: { refId: id, label: id }
    },
    record,
    ...(stateNodeId
      ? {
          edge: {
            id: mintId('entry'),
            source: stateNodeId,
            target: id,
            sourceHandle: 'output:state',
            targetHandle: 'data:state',
            type: 'default',
            role: 'type',
            label: 'entry'
          }
        }
      : {})
  };
}

// The single-holder move (SPEC §4): the same display-role pass the class
// inspector applies over the sibling field nodes.
export function setIdentifierHolder(nodes, fieldNodeId, enabled) {
  applyFieldDisplayRole(nodes, fieldNodeId, 'identifier', enabled);
}

// Retarget keeps one target source per transition (SPEC §7): the entry
// wire is the value, so retargeting rewires it (or mints it) and drops
// any stored target so the two can never disagree — interpretation
// re-writes the socket default from the wire.
export function setTransitionTarget(edges = [], record = {}, stateNodeId = '') {
  const nextRecord = { ...record };
  delete nextRecord.state;
  nextRecord.inputDefaults = { ...(record.inputDefaults || {}) };
  delete nextRecord.inputDefaults.state;
  const entryIndex = edges.findIndex(edge => (
    edge.role === 'type' && edge.label === 'entry' && edge.target === String(record.id)
  ));
  if (entryIndex >= 0) {
    const entry = edges[entryIndex];
    const nextEdges = [...edges];
    nextEdges[entryIndex] = {
      ...entry,
      source: stateNodeId,
      sourceHandle: 'output:state',
      targetHandle: 'data:state'
    };
    return { edges: nextEdges, record: nextRecord };
  }
  return {
    edges: [...edges, {
      id: mintId('entry'),
      source: stateNodeId,
      target: String(record.id),
      sourceHandle: 'output:state',
      targetHandle: 'data:state',
      type: 'default',
      role: 'type',
      label: 'entry'
    }],
    record: nextRecord
  };
}

// Canvas-node removal with the designer's ownership semantics: the node,
// its touching wires, and a processNode's canvas-owned record go
// together; declaration records (ctsTypes) rebuild from nodes at save.
export function removeDeclarationNode(nodes = [], edges = [], records = {}, nodeId = '') {
  const node = nodes.find(candidate => candidate.id === nodeId);
  if (!node) return { nodes, edges, records, removedRecordIds: [] };
  const refId = String(node.data?.refId || nodeId);
  const nextRecords = { ...records };
  const removedRecordIds = [];
  if (node.type === 'processNode' && nextRecords[refId]) {
    delete nextRecords[refId];
    removedRecordIds.push(refId);
  }
  return {
    nodes: nodes.filter(candidate => candidate.id !== nodeId),
    edges: edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId),
    records: nextRecords,
    removedRecordIds
  };
}

// The designer's live diagnostics chain over the edited arrays — the same
// compile + normalize pass the class inspector shows, so what SAVE/APPLY
// rejects is visible while authoring.
export function declarationDiagnostics(nodes = [], edges = [], records = {}, organizationId = null) {
  const { declarations, diagnostics } = compileTreeDeclarations(nodes, edges, records || {});
  for (const declaration of declarations) {
    try {
      normalizeType({ ...declaration, scope: 'org', organizationId });
    } catch (error) {
      diagnostics.push(`class ${declaration.name || declaration.id}: ${error.message}`);
    }
  }
  return diagnostics;
}

// A removal is refused when it would orphan consumers: the gate compares
// the compile diagnostics before and after and reports only the fresh
// ones (pre-existing authoring errors never block an unrelated removal).
export function tryRemoveDeclarationNode(nodes, edges, records, nodeId, organizationId = null) {
  const before = declarationDiagnostics(nodes, edges, records, organizationId);
  const next = removeDeclarationNode(nodes, edges, records, nodeId);
  const after = declarationDiagnostics(next.nodes, next.edges, next.records, organizationId);
  const fresh = after.filter(item => !before.includes(item));
  return fresh.length
    ? { ok: false, diagnostics: fresh }
    : { ok: true, ...next };
}

// The lifecycle machine view (SPEC §1): states of the type's vocabulary,
// legal edges from the transition records, and the initial state from the
// construct's entry target where derivable.
export function machineModelOf(subtree) {
  if (!subtree) return { initial: null, states: [], edges: [] };
  const initial = subtree.constructs
    .map(({ record }) => operationTargetState(record))
    .find(Boolean) || null;
  const states = subtree.states.map(({ node }) => ({
    value: String(node.data?.value || ''),
    label: String(node.data?.label || node.data?.value || ''),
    severity: node.data?.severity || 'info',
    icon: node.data?.icon || null
  }));
  const edges = subtree.transitions
    .map(({ record }) => ({
      from: typeof record.state?.from === 'string' && record.state.from ? record.state.from : null,
      to: operationTargetState(record),
      intent: String(record.label || '')
    }))
    .filter(edge => edge.to);
  return { initial, states, edges };
}

// A mermaid flowchart over the machine model: the initial state renders
// as the stadium node, intents ride the edges, and an unscoped transition
// (no authored from) renders from the initial state when derivable, else
// from every other state — the availability law the compiled window
// applies.
export function mermaidFlowchartOf(model = { states: [], edges: [] }) {
  const safe = value => String(value).replace(/["'`\n\r<>&]/g, '').trim() || '?';
  const idOf = value => `s${model.states.findIndex(state => state.value === value)}`;
  const lines = ['flowchart LR'];
  model.states.forEach((state, index) => {
    const shape = state.value === model.initial ? `(["${safe(state.label)}"])` : `["${safe(state.label)}"]`;
    lines.push(`  s${index}${shape}`);
  });
  for (const edge of model.edges) {
    const sources = edge.from
      ? [edge.from]
      : model.initial
        ? [model.initial]
        : model.states.map(state => state.value).filter(value => value !== edge.to);
    for (const from of sources) {
      if (idOf(from) === 's-1' || idOf(edge.to) === 's-1') continue;
      const label = edge.intent ? `-->|"${safe(edge.intent)}"|` : '-->';
      lines.push(`  ${idOf(from)} ${label} ${idOf(edge.to)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function besideClass(classNode, offset) {
  const position = classNode?.position || { x: 0, y: 0 };
  return { x: position.x + offset, y: position.y + 160 };
}
