import { operationKindOf, durationMs } from '@perigram/cts';
import { normalizeWorkflow, resolveWorkflowStatePath } from '@perigram/core';
import {
  HOME_SCREEN_ROUTE,
  generatedScreenRoute,
  normalizeScreenContract,
  validateScreenContract
} from './screen-contract.js';
import {
  PROCESS_SCALAR_KINDS,
  PROCESS_DATAFLOW_VERSION,
  PROCESS_STRUCTURES,
  inferProcessDataflowContracts,
  resolveProcessNodePorts,
  validateProcessEdges
} from './ports.js';
import { CONSUMER_SPECIES_KINDS, constructionInputsForContract, entityBlocks, EFFECT_SPECIES_KINDS, getFieldPolicy, getProcessNodeDefinition, resolveCatalogNodePorts } from './node-catalog.js';
import { normalizeStateFieldPolicy } from './designer.js';
import { normalizeDesignerAccess } from './authoring.js';
import { projectUiAction, projectUiContractChannels, creationModeLabel } from './ui-contract-projection.js';
import { normalizeProcessType, sanitizeProcessType, processSocketsCompatible, processType } from './types.js';
import { createDataTree, isDataTree } from './data-tree.js';
import { normalizeHandle, lineageKeyForTypeId, lineageRelationsForParent, mergedHierarchyBindings } from './hierarchy-utils.js';

export const PROCESS_SCHEMA_VERSION = 1;
const ACCESS_ORDER = { none: 0, read: 1, write: 2, admin: 3 };
export function effectKindOf(record = {}) {
  return operationKindOf(record);
}

export function isEffectRecord(record = {}) {
  return EFFECT_SPECIES_KINDS.has(String(record.kind || ''));
}

export {
  canvasToDefinition,
  definitionToCanvas,
  hasCanonicalProcessSource,
  validateCanvasSemantics,
  validateRoundTrip
} from './transpiler.js';

export {
  PROCESS_SCALAR_KINDS,
  PROCESS_DATAFLOW_VERSION,
  PROCESS_STRUCTURES,
  inferProcessDataflowContracts,
  normalizePortSpec,
  portSpecsCompatible,
  resolveProcessNodePorts,
  resolveNodePort,
  validateProcessEdges
} from './ports.js';

export {
  PROCESS_DESIGNER_PALETTE_GROUPS,
  createProcessDesignerContract
} from './designer.js';

export { resolveProcessActionInputContext } from './algebra.js';
export {
  PROCESS_PROTOCOL_VERSION,
  PROCESS_OPERATION_LEVELS,
  PROCESS_BASE_TYPES,
  PROCESS_DATA_ACCESS,
  PROCESS_SOCKET_ROLES,
  formatProcessType,
  normalizeProcessSocket,
  normalizeProcessType,
  sanitizeProcessType,
  processSocketsCompatible,
  processType,
  processTypesCompatible
} from './types.js';
export * from './data-tree.js';
export { migrateProcessDefinitionV4 } from './migration-v4.js';
export {
  PROCESS_NODE_CATALOG,
  PROCESS_NODE_FAMILIES,
  getProcessNodeDefinition,
  processNodeDefinitionsForFamily,
  requireProcessNodeDefinition,
  resolveCatalogNodePorts
} from './node-catalog.js';
export {
  executeProcessDataNode
} from './evaluator.js';
export {
  PROCESS_RUN_STATUSES,
  PROCESS_STEP_STATUSES,
  advanceProcessRun,
  createProcessRun,
  previewProcessDataflow,
  runProcessUntilSettled
} from './orchestration.js';

export function processDefaultValue(value) {
  return isDataTree(value) ? value.branches[0]?.items?.[0] : value;
}

export function wiredHandlePaths(nodeId, graph, allowed = null) {
  const graphNode = (graph?.nodes || []).find(item =>
    String(item.data?.refId || item.id) === String(nodeId));
  if (!graphNode) return [];
  return (graph?.edges || [])
    .filter(edge => String(edge.target) === String(graphNode.id))
    .map(edge => normalizeHandle(edge.targetHandle))
    .filter(path => path && path !== 'entity' && path !== 'in')
    .filter(path => !allowed || allowed.has(path));
}

export function requiredEffectCapability(kind = '', record = {}) {
  if (kind === 'cts.construct') return 'create';
  if (kind === 'cts.mutate') return 'processUpdate';
  if (kind === 'cts.transition') return record.archiveIntent ? 'archive' : 'statusMutation';
  if (kind === 'cts.remove') return 'delete';
  return null;
}

export function resolveSourceProducerOutputId(process, source, sourcePort) {
  if (!source?.id) return null;
  if (CONSUMER_SPECIES_KINDS.has(source.kind)) {
    return upstreamProducerOutputId(process, source);
  }
  const candidates = Object.values(process.producerOutputs || {})
    .filter(output => output?.nodeId === source.id);
  const exactKey = sourcePort?.id ? `${source.id}:${sourcePort.id}` : '';
  const exact = exactKey && candidates.find(output => (
    output.producerOutputId === exactKey || output.outputSocketId === sourcePort.id
  ));
  if (exact) return exact.producerOutputId;
  const portTypeId = sourcePort?.type?.typeId || sourcePort?.type?.itemType?.typeId || '';
  const matching = portTypeId
    ? candidates.filter(output => output.typeId === portTypeId)
    : candidates;
  return matching.length === 1 ? matching[0].producerOutputId : null;
}

// The declared lineage input for a native `lineage.<lineageKey>` socket:
// construction inputs are the catalog's port source (the designer persists
// the derived domain input there); the top-level socket list mirrors it.
export function declaredLineageInput(record = {}, handle = '') {
  const matches = input => input && (
    normalizeHandle(input.id) === handle
    || normalizeHandle(input.path) === handle
  );
  return (record.construction?.inputs || []).find(matches)
    || (record.inputs || []).find(matches)
    || null;
}

export function declaredAncestorTypeId(input = {}) {
  return input.typeId || input.type?.typeId || '';
}

export function compileLineageBindings(process = {}, domain = {}) {
  const bindings = [];
  const processNodes = process.processNodes || {};
  const graph = process.graph || {};
  const recordsByGraphId = new Map((graph.nodes || []).map(node => [
    String(node.id),
    processNodes[String(node.data?.refId || node.id)]
  ]));
  for (const edge of graph.edges || []) {
    const target = recordsByGraphId.get(String(edge.target));
    if (!target || target.compositionMode !== 'ancestors') continue;
    const entryId = normalizeHandle(edge.targetHandle).replace(/^entry:/, '');
    const entry = target.entries?.find(item => item.id === entryId);
    if (!entry) continue;
    const source = recordsByGraphId.get(String(edge.source));
    if (!source) continue;
    let outputs = [];
    try { outputs = resolveCatalogNodePorts(source, catalogContext(domain, source)).outputs; } catch { outputs = []; }
    const sourcePort = catalogPortForHandle(outputs, edge.sourceHandle);
    const sourceProducerOutputId = resolveSourceProducerOutputId(process, source, sourcePort)
      || source.producerOutputId || null;
    const ancestorType = sourcePort?.type?.typeId
      || sourcePort?.type?.itemType?.typeId
      || source.typeId
      || entry.typeId
      || '';
    if (!ancestorType) continue;
    const lineageKey = entry.key || lineageKeyForTypeId(ancestorType);
    const consumers = (graph.edges || [])
      .filter(candidate => String(candidate.source) === String(edge.target))
      .filter(candidate => normalizeHandle(candidate.sourceHandle) === 'block')
      .filter(candidate => normalizeHandle(candidate.targetHandle) === 'lineage')
      .map(candidate => ({ node: recordsByGraphId.get(String(candidate.target)), edge: candidate }))
      .filter(({ node }) => node);
    const producerConsumers = consumers.filter(({ node }) => (
      node.kind === 'cts.construct'
    ));
    if (!lineageKey || ancestorType === 'organization') continue;
    if (producerConsumers.length) {
      for (const { node } of producerConsumers) {
        const childTypeId = node.typeId || target.targetTypeId || target.typeId || '';
        if (!childTypeId) continue;
      bindings.push({
        childTypeId,
        parentTypeId: ancestorType,
        lineageKey,
        producerOutputId: node.producerOutputId || null,
        sourceProducerOutputId,
        sourceNode: String(edge.source),
        sourceSocket: String(edge.sourceHandle || ''),
        consumingNode: String(edge.target),
        consumingSocket: String(edge.targetHandle || '')
      });
      }
      continue;
    }
    const childTypes = [...new Set([
      target.targetTypeId,
      target.typeId,
      ...consumers.map(({ node }) => node.typeId)
    ].filter(Boolean))];
    if (!childTypes.length) continue;
    for (const childTypeId of childTypes) {
      bindings.push({
        childTypeId,
        parentTypeId: ancestorType,
        lineageKey,
        producerOutputId: null,
        sourceProducerOutputId,
        sourceNode: String(edge.source),
        sourceSocket: String(edge.sourceHandle || ''),
        consumingNode: String(edge.target),
        consumingSocket: String(edge.targetHandle || '')
      });
    }
  }
  // Native species wiring: a typed `lineage.<lineageKey>` data socket on a
  // lineage-persisting construct, fed by an entity-emitting output — the
  // graph-authored hierarchy without a compose-block node. Same binding
  // identity and fields as the composed path; the declared input's type
  // only backfills an ancestor the wire cannot resolve.
  for (const edge of graph.edges || []) {
    const handle = normalizeHandle(edge.targetHandle);
    if (!handle.startsWith('lineage.') || handle === 'lineage.') continue;
    const target = recordsByGraphId.get(String(edge.target));
    if (!target || effectKindOf(target) !== 'cts.construct') continue;
    const declared = declaredLineageInput(target, handle);
    if (!declared) continue;
    const childTypeId = target.typeId || target.targetTypeId || '';
    if (!childTypeId) continue;
    const source = recordsByGraphId.get(String(edge.source));
    if (!source) continue;
    let outputs = [];
    try { outputs = resolveCatalogNodePorts(source, catalogContext(domain, source)).outputs; } catch { outputs = []; }
    const sourcePort = catalogPortForHandle(outputs, edge.sourceHandle);
    const ancestorType = sourcePort?.type?.typeId
      || sourcePort?.type?.itemType?.typeId
      || source.typeId
      || declaredAncestorTypeId(declared)
      || '';
    if (!ancestorType || ancestorType === 'organization') continue;
    const sourceProducerOutputId = resolveSourceProducerOutputId(process, source, sourcePort)
      || source.producerOutputId || null;
    bindings.push({
      childTypeId,
      parentTypeId: ancestorType,
      lineageKey: handle.slice('lineage.'.length),
      producerOutputId: target.producerOutputId || null,
      sourceProducerOutputId,
      sourceNode: String(edge.source),
      sourceSocket: String(edge.sourceHandle || ''),
      consumingNode: String(edge.target),
      consumingSocket: String(edge.targetHandle || '')
    });
  }
  const unique = new Map(bindings.map(binding => [
    [
      binding.producerOutputId,
      binding.sourceProducerOutputId,
      binding.childTypeId,
      binding.parentTypeId,
      binding.lineageKey,
      binding.sourceNode,
      binding.sourceSocket,
      binding.consumingNode,
      binding.consumingSocket
    ].join(':'),
    binding
  ]));
  return [...unique.values()];
}

export function normalizeGraph(graph = {}) {
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map(normalizeNode) : [],
    // Declaration wires (`role: 'type'`) survive normalization: machine
    // vocabulary (state nesting, entry wires) reads them from the
    // normalized graph by node type and handle. They are not dataflow —
    // every role-classifying consumer (cycle checks, control/data walkers)
    // skips a `type`-role edge, so a declaration wire never counts as a
    // data or control connection.
    edges: Array.isArray(graph.edges)
      ? graph.edges.map(normalizeEdge)
      : [],
    viewport: {
      x: Number(graph.viewport?.x || 0),
      y: Number(graph.viewport?.y || 0),
      zoom: Number(graph.viewport?.zoom || 1)
    }
  };
}

function normalizeNode(node = {}) {
  return {
    id: String(node.id || ''),
    type: node.type || 'default',
    position: {
      x: Number(node.position?.x || 0),
      y: Number(node.position?.y || 0)
    },
    data: node.data && typeof node.data === 'object' ? node.data : {}
  };
}

function normalizeEdge(edge = {}) {
  const sourceHandle = edge.sourceHandle || inferEdgeHandle(edge, 'source');
  const targetHandle = edge.targetHandle || inferEdgeHandle(edge, 'target');
  return {
    id: String(edge.id || `${edge.source || ''}-${edge.target || ''}`),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    sourceHandle,
    targetHandle,
    type: edge.type || 'default',
    // The declaration wire's role and label are its semantics (children/
    // declares/entry/targets); stripping them here reclassified every
    // declaration wire as data, so a declaration self-wire read as a
    // one-node data cycle.
    ...(edge.role ? { role: edge.role } : {}),
    ...(edge.label ? { label: edge.label } : {}),
    data: edge.data && typeof edge.data === 'object' ? edge.data : {}
  };
}

function inferEdgeHandle(edge = {}, side = 'source') {
  const dataKey = side === 'source' ? 'sourceHandle' : 'targetHandle';
  if (edge.data?.[dataKey]) return edge.data[dataKey];
  const id = String(edge.id || '');
  const pattern = side === 'source'
    ? /(?:^|[-])((?:output)(?::[A-Za-z0-9_.:]+)?)(?=[-]|$)/
    : /(?:^|[-])((?:input|data)(?::[A-Za-z0-9_.:]+)?)(?=[-]|$)/;
  const match = id.match(pattern);
  return match?.[1] || null;
}

export function normalizeRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

export function normalizeActions(value) {
  return Object.fromEntries(Object.entries(normalizeRecord(value)).map(([id, action]) => [id, normalizeActionRecord(action)]));
}

function normalizeActionRecord(action = {}) {
  if (action.actionKind !== 'changeStatus') return { ...action };
  const typeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId || '';
  const inputs = [...(action.inputs || [])];
  if (!inputs.some(input => input.id === 'entity')) {
    inputs.unshift({ id: 'entity', kind: 'entity', typeId, required: false });
  }
  if (!inputs.some(input => input.id === 'state')) {
    inputs.push({
      id: 'state',
      kind: 'state',
      stateRef: action.stateRef || null,
      state: action.state?.to || action.access?.stateTo || '',
      required: false
    });
  }
  return {
    ...action,
    actionKind: 'updateEntity',
    typeId,
    inputs,
    mutation: action.mutation || { fields: [] },
    access: {
      ...(action.access || {}),
      stateFrom: action.access?.stateFrom || action.state?.from || '',
      stateTo: action.access?.stateTo || action.state?.to || ''
    }
  };
}

// Lifecycle machines are authored data only (SPEC §7: graph-derived at
// compile, never invented): the draft's state records seed the vocabulary,
// compiled actions contribute transitions, and a producer whose type has no
// authored vocabulary compiles NO machine — instances of such types are
// stateless and creation writes no status. There is no synthesized CREATED
// lifecycle: a state nobody declared is not vocabulary.
export function workflowTransitionSources(actionId, action = {}, typeId = '', graphContext, actionWindows) {
  const sources = [];
  const edges = graphContext.incomingByActionId.get(actionId) || [];

  for (const edge of edges) {
    if (!isEntityTargetHandle(edge.targetHandle)) continue;
    const sourceWindow = outputWindowForHandle(actionWindows.get(edge.sourceActionId), edge.sourceHandle);
    if (!sourceWindow?.status) continue;
    if (typeId && sourceWindow.typeId && sourceWindow.typeId !== typeId) continue;
    sources.push({ status: sourceWindow.status, window: sourceWindow });
  }

  const fallbackStatus = action.state?.from
    || action.access?.stateFrom
    || action.inputs?.find(input => input.status)?.status
    || '';
  if (fallbackStatus) sources.push({ status: fallbackStatus, window: actionWindows.get(actionId)?.input || null });

  const seen = new Set();
  return sources.filter(source => {
    if (!source.status || seen.has(source.status)) return false;
    seen.add(source.status);
    return true;
  });
}

export function actionTypeId(action = {}) {
  return action.typeId
    || action.inputs?.find(input => input.typeId)?.typeId
    || action.outputs?.find(output => output.typeId)?.typeId
    || '';
}

// The exposure keys a projected manifest record does not redefine: identity
// and type aliases, parent context, prompt policy, and relation mutation.
// Colliding keys the UI contract owns (actionKind, construction, fields,
// label, status, typeId, trigger, access, relation) are stripped here.
export function exposureFieldsOf(action = {}) {
  const {
    actionKind: _actionKind, construction: _construction, fields: _fields,
    label: _label, status: _status, typeId: _typeId, trigger: _trigger,
    access: _access, relation: _relation, ...exposure
  } = action;
  return exposure;
}

export function compileHomeScreenForAssignment({ assignment = {}, screens = [], lineageBindings = [], domain = {} } = {}) {
  const sections = topLevelHomeSections(screens, mergedHierarchyBindings(lineageBindings, domain));
  if (!sections.length) return null;
  const screenKey = `home_${assignment.userId || assignment.id || 'user'}`;
  return {
    id: screenKey,
    screenKey,
    label: 'Home',
    kind: 'home',
    template: 'home',
    placement: 'home',
    // Home serves at the stable shell route — the per-user screenKey
    // stays the manifest identity, never the URL.
    route: HOME_SCREEN_ROUTE,
    sourceRoute: HOME_SCREEN_ROUTE,
    roleIds: assignment.roleIds || [],
    sources: sections.map(section => ({
      id: section.sourceId,
      label: section.label,
      typeId: section.typeId,
      mode: 'list',
      required: section.required || null,
      filters: section.filters || {},
      lineageBindings: lineageBindings.map(binding => ({ ...binding }))
    })),
    regions: sections.map(section => ({
      id: `${section.sourceId}_section`,
      label: section.label,
      slot: 'main',
      sourceId: section.sourceId,
      surface: 'card',
      actions: section.actions || [],
      screenKey: section.screenKey,
      route: section.route
    })),
    actions: [...new Set(sections.flatMap(section => section.actions || []))]
  };
}

function topLevelHomeSections(screens = [], hierarchy = []) {
  const listScreens = screens.filter(screen => screen.template === 'typeList' && screen.typeId && screen.sources?.some(source => source.mode === 'list'));
  const sectionsByType = new Map();
  for (const screen of listScreens) {
    const typeId = screen.typeId;
    if (sectionsByType.has(typeId)) {
      const existing = sectionsByType.get(typeId);
      existing.actions = [...new Set([...(existing.actions || []), ...(screen.actions || [])])];
      continue;
    }
    const source = screen.sources.find(item => item.mode === 'list') || {};
    sectionsByType.set(typeId, {
      typeId,
      sourceId: `home_${typeId}`,
      label: screen.label || typeId,
      required: source.required || screen.required || null,
      filters: source.filters || {},
      actions: screen.actions || [],
      screenKey: screen.screenKey,
      route: screen.route
    });
  }
  // Declared and compiled hierarchy both scope the home: a section whose
  // type is a child of another sectioned type is suppressed — it remains
  // reachable through its parent's detail child region.
  const sectionTypes = new Set(sectionsByType.keys());
  const childTypes = new Set(hierarchy
    .filter(relation => sectionTypes.has(relation.parentTypeId)
      && relation.childTypeId !== relation.parentTypeId)
    .map(relation => relation.childTypeId));
  return [...sectionsByType.values()].filter(section => !childTypes.has(section.typeId));
}

export function workflowDropsNoOp(workflow, from, to) {
  if (!workflow || !to) return false;
  const region = workflow.regions?.[workflow.primaryRegion]
    || Object.values(workflow.regions || {})[0]
    || null;
  if (!region) return false;
  const fromPath = resolveWorkflowStatePath(region, from || region.initial) || (from || region.initial);
  const toPath = resolveWorkflowStatePath(region, to) || to;
  return Boolean(fromPath) && fromPath === toPath;
}

export function exposedActionFeature(action = {}, actionWindow = null, access = {}, domain = {}) {
  const kind = action.actionKind || 'createEntity';
  if (kind === 'runCommand' && actionWindow?.input?.feature) {
    return actionWindow.input.feature;
  }
  return actionWindow?.primaryGrant?.feature || grantFromAction(action, access, domain)?.feature || null;
}

// Authored action roles are the primary declaration of whom the action
// belongs to: they receive the surfaced action and the status-scoped grant
// for the resulting state. Executability derived from the input window only
// fills in when the action declares no roles of its own.
export function actionExposureRoleIds(action = {}, access = {}, actionWindow = null) {
  const kind = action.actionKind || 'createEntity';
  const explicitGrants = access.grants?.length ? access.grants : grantsFromRoleIds(access.roleIds || [], access.level);
  const explicit = explicitGrants
    .filter(grant => ACCESS_ORDER[normalizeAccessLevel(grant.level)] >= ACCESS_ORDER.write)
    .map(grant => grant.roleId)
    .filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];
  if (kind === 'updateEntity' && actionTargetState(action)) {
    const executable = executableRoleIdsForWindow(actionWindow?.input, access);
    if (executable.length) return [...new Set(executable)];
  }
  return [...new Set((actionWindow?.outputs || []).flatMap(output => {
    const grants = output.roleGrants || grantsFromRoleIds(output.roleIds || [], output.level || access.level);
    return grants
      .filter(grant => ACCESS_ORDER[normalizeAccessLevel(grant.level)] >= ACCESS_ORDER.write)
      .map(grant => grant.roleId);
  }))];
}

export function actionExposureRoleIdsForInput(action = {}, access = {}, inputWindow = null) {
  const explicitGrants = access.grants?.length ? access.grants : grantsFromRoleIds(access.roleIds || [], access.level);
  const explicit = explicitGrants
    .filter(grant => ACCESS_ORDER[normalizeAccessLevel(grant.level)] >= ACCESS_ORDER.write)
    .map(grant => grant.roleId)
    .filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];
  if ((action.actionKind || 'createEntity') !== 'updateEntity' || !actionTargetState(action)) return actionExposureRoleIds(action, access, null);
  const executable = executableRoleIdsForWindow(inputWindow, access);
  if (executable.length) return [...new Set(executable)];
  return actionExposureRoleIds(action, access, null);
}

function executableRoleIdsForWindow(window = null, access = {}) {
  const incomingRoleGrants = window?.roleGrants || grantsFromRoleIds(window?.roleIds || [], window?.level || access.level);
  return incomingRoleGrants
    .filter(grant => ACCESS_ORDER[normalizeAccessLevel(grant.level)] >= ACCESS_ORDER.write)
    .map(grant => grant.roleId)
    .filter(Boolean);
}

export function actionStatusForExposure(action = {}, actionWindow = null, access = {}, process = {}, wiredFrom = '') {
  // The exposed/manifest action carries the same wiring arrival as the
  // execution channel: compileActionStatus derives `from` from the same
  // wiring fact the machine edge and the compiled action use. The action
  // window's arrival (carried under `status`) is the fallback.
  const status = compileActionStatus(action, process, wiredFrom);
  // The incoming action window carries the arrival state under `status`
  // (compileActionWindow); the exposed/manifest action must keep it as
  // `from` so generated surfaces scope the button to the states the
  // transition actually leaves. Reading `.state` here silently dropped it.
  const inputStatus = actionWindow?.input?.status || actionWindow?.input?.state || '';
  if (!status.from && inputStatus) status.from = inputStatus;
  const targetState = actionTargetState(action, process) || access.stateTo || actionWindow?.outputs?.[0]?.state || '';
  if (!status.to && targetState) status.to = targetState;
  return status;
}

function grantFromAction(action = {}, access = {}, domain = {}) {
  const typeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId;
  const feature = typeId ? resolveEntityFeature(domain, typeId) : null;
  if (!feature || !access.roleIds?.length) return null;
  const grant = {
    feature,
    level: access.level || 'write'
  };
  if (action.actionKind === 'createEntity') {
    const to = action.state?.to || '';
    if (to) grant.rule = { fact: 'primaryState', equals: to };
  }
  if (action.actionKind === 'updateEntity' && actionTargetState(action)) {
    const from = access.stateFrom || action.state?.from || '';
    const to = access.stateTo || action.state?.to || '';
    if (from || to) grant.transitions = [{ from: from || undefined, to: to || undefined }];
    if (to) grant.rule = { fact: 'primaryState', equals: to };
  }
  return grant;
}

export function upsertGrant(grants, next) {
  const normalized = normalizeCompiledGrant(next);
  const existing = grants.find(grant => grantKey(grant) === grantKey(normalized));
  if (!existing) {
    grants.push(normalized);
    return;
  }
  if (ACCESS_ORDER[normalized.level] > ACCESS_ORDER[existing.level || 'read']) existing.level = normalized.level;
}

function normalizeCompiledGrant(grant = {}) {
  const { roleIds, sourceActionId, sourcePath, ...rest } = grant;
  return JSON.parse(JSON.stringify(rest));
}

function grantKey(grant = {}) {
  return JSON.stringify({
    feature: grant.feature,
    // Types sharing one collection are separate grant identities — without
    // this, the second type's grant merges into the first and its screens
    // never infer.
    typeId: grant.typeId || null,
    scope: grant.scope || null,
    transitions: grant.transitions || null,
    rule: grant.rule || null,
    actions: grant.actions || null
  });
}

export function compileActionAccessWindows(process = {}, domain = {}, lineageBindings = []) {
  const actionEntries = Object.entries(process.actions || {});
  const graphContext = buildActionGraphContext(process);
  const windows = new Map();
  const pending = new Map(actionEntries);

  while (pending.size) {
    let progressed = false;
    for (const [actionId, action] of [...pending.entries()]) {
      const incoming = incomingWindowForAction(actionId, action, graphContext, windows);
      const hasGraphInput = graphContext.incomingByActionId.has(actionId);
      if (hasGraphInput && !incoming) continue;
      const window = compileActionWindow(actionId, action, incoming, domain, process, lineageBindings);
      windows.set(actionId, window);
      pending.delete(actionId);
      progressed = true;
    }
    if (!progressed) {
      for (const [actionId, action] of pending) {
        windows.set(actionId, compileActionWindow(actionId, action, null, domain, process, lineageBindings));
      }
      break;
    }
  }

  return windows;
}

export function buildActionGraphContext(process = {}) {
  const actionNodeById = new Map();
  const actionIdByNodeId = new Map();
  for (const node of process.graph?.nodes || []) {
    const refId = String(node.data?.refId || node.id || '');
    const processNode = node.type === 'processNode' ? process.processNodes?.[refId] : null;
    // Species records are the executable graph citizens — the wiring
    // context must see them or no v5 graph derives arrival states,
    // machine edges, or action windows.
    if (node.type !== 'action' && !String(processNode?.kind || '').startsWith('cts.')) continue;
    const actionId = String(processNode?.entryTriggerId || processNode?.id || refId);
    if (!actionId) continue;
    actionNodeById.set(actionId, node);
    actionIdByNodeId.set(String(node.id), actionId);
  }

  const incomingByActionId = new Map();
  const parentIncomingByActionId = new Map();
  for (const edge of process.graph?.edges || []) {
    const targetActionId = actionIdByNodeId.get(String(edge.target));
    const sourceActionId = actionIdByNodeId.get(String(edge.source));
    if (!targetActionId || !sourceActionId) continue;
    const incoming = incomingByActionId.get(targetActionId) || [];
    incoming.push({
      sourceActionId,
      sourceHandle: edge.sourceHandle || null,
      targetHandle: edge.targetHandle || null
    });
    incomingByActionId.set(targetActionId, incoming);
    if (isParentTargetHandle(edge.targetHandle)) {
      const parentOutput = actionOutputForHandle(process.actions?.[sourceActionId], edge.sourceHandle);
      if (parentOutput?.typeId) {
        parentIncomingByActionId.set(targetActionId, {
          typeId: parentOutput.typeId,
          state: parentOutput.state || '',
          parentInput: true
        });
      }
    }
  }

  return { actionNodeById, actionIdByNodeId, incomingByActionId, parentIncomingByActionId };
}

function isParentTargetHandle(targetHandle = '') {
  const handle = String(targetHandle || '');
  return handle === 'parent' || handle === 'input:parent' || handle.endsWith(':parent');
}

export function isEntityTargetHandle(targetHandle = '') {
  const handle = String(targetHandle || '');
  return !handle || handle === 'input' || handle === 'entity' || handle === 'input:entity' || handle.endsWith(':entity');
}

function actionOutputForHandle(action = {}, sourceHandle = '') {
  const outputs = action?.outputs || [];
  if (!outputs.length) return null;
  if (!sourceHandle || sourceHandle === 'output') return outputs.find(output => output.typeId) || outputs[0] || null;
  const id = String(sourceHandle).replace(/^output:/, '');
  return outputs.find(output => output.id === id || output.handleId === sourceHandle)
    || outputs.find(output => output.typeId)
    || outputs[0]
    || null;
}

function incomingWindowForAction(actionId, action = {}, graphContext, windows) {
  const edges = graphContext.incomingByActionId.get(actionId) || [];
  for (const edge of edges) {
    const sourceWindow = outputWindowForHandle(windows.get(edge.sourceActionId), edge.sourceHandle);
    if (sourceWindow) return sourceWindow;
  }
  if (edges.length) return null;
  const input = action.inputs?.find(item => item.typeId);
  if (!input) return null;
  return {
    typeId: input.typeId,
    state: input.state || '',
    level: normalizeActionAccess(action.access).level,
    roleIds: [],
    roleGrants: [],
    scope: null,
    sourcePath: `input:${actionId}:${input.id || 'entity'}`
  };
}

export function outputWindowForHandle(actionWindow, sourceHandle) {
  if (!actionWindow) return null;
  if (!sourceHandle || sourceHandle === 'output') return actionWindow.outputs[0] || null;
  const id = String(sourceHandle).replace(/^output:/, '');
  return actionWindow.outputs.find(output => output.handleId === sourceHandle || output.id === id) || actionWindow.outputs[0] || null;
}

function compileActionWindow(actionId, action = {}, incoming = null, domain = {}, process = {}, lineageBindings = []) {
  const kind = action.actionKind || 'createEntity';
  const access = normalizeActionAccess(action.access);
  const typeId = actionTypeId(action) || incoming?.typeId || '';
  const stateTo = actionTargetState(action, process) || access.stateTo || incoming?.status || '';
  const feature = typeId ? resolveEntityFeature(domain, typeId) : null;
  const inheritedRoleGrants = incoming?.roleGrants || grantsFromRoleIds(incoming?.roleIds || [], incoming?.level || access.level);
  const explicitRoleGrants = access.grants || grantsFromRoleIds(access.roleIds || [], access.level);
  const hasExplicitRoleGrants = hasExplicitActionRoleGrants(action.access);
  const useInherited = inheritedRoleGrants.length && (
    (kind === 'updateEntity' && Boolean(actionTargetState(action, process)) && !access.modified) ||
    (kind === 'runCommand' && !hasExplicitRoleGrants && !access.modified)
  );
  let roleGrants = useInherited ? inheritedRoleGrants : explicitRoleGrants;
  // A root create with no authored action roles of its own inherits its
  // producer output's create rights: write/admin `allowedRoles` open the
  // created-status window, so the class-level create action surfaces to the
  // roles that hold create rights on the type even when the action record
  // itself was never granted explicitly.
  if (!roleGrants.length && !useInherited && kind === 'createEntity' && !incoming) {
    roleGrants = producerOutputRoleGrants(process, action);
  }
  const roleIds = [...new Set(roleGrants.map(grant => grant.roleId).filter(Boolean))];
  const level = maxGrantLevel(roleGrants, useInherited ? (incoming.level || access.level) : access.level);
  const scope = deriveActionWindowScope(action, incoming, lineageBindings);
  const outputs = [];
  const grants = [];

  if (['createEntity', 'updateEntity'].includes(kind) && feature && typeId) {
    const status = kind === 'updateEntity'
      ? (actionTargetState(action, process) || incoming?.status || action.inputs?.find(input => input.status)?.status || '')
      : stateTo;
    const window = {
      id: outputSocketId(action, kind),
      handleId: outputHandleId(action, kind),
      typeId,
      feature,
      status,
      level,
      roleIds,
      roleGrants,
      scope,
      sourcePath: [incoming?.sourcePath, actionId, status].filter(Boolean).join('>')
    };
    outputs.push(window);
    grants.push(...windowGrants(window, action, access));
  }

  if (kind === 'runCommand' && incoming) {
    const commandOutputs = commandOutputTypeIds(domain, action.commandId);
    for (const outputTypeId of commandOutputs) {
      const outputFeature = resolveEntityFeature(domain, outputTypeId);
      if (!outputFeature) continue;
      const outputScope = deriveCommandOutputScope(outputTypeId, incoming, lineageBindings);
      const window = {
        id: outputTypeId,
        handleId: `output:${outputTypeId}`,
        typeId: outputTypeId,
        feature: outputFeature,
        state: '',
        level,
        roleIds,
        roleGrants,
        scope: outputScope,
        sourcePath: [incoming?.sourcePath, actionId, outputTypeId].filter(Boolean).join('>')
      };
      outputs.push(window);
      grants.push(...windowGrants(window, action, access));
    }
  }

  return {
    actionId,
    kind,
    input: incoming,
    outputs,
    grants,
    primaryGrant: grants[0] || null
  };
}

function grantsFromRoleIds(roleIds = [], level = 'write') {
  return [...new Set(roleIds)]
    .filter(Boolean)
    .map(roleId => ({ roleId, level: normalizeAccessLevel(level) }));
}

// Create rights declared on the producer output profile (`allowedRoles`),
// flattened to explicit grant rows: admin roles keep admin, write roles
// that are not also admin get write.
function producerOutputRoleGrants(process = {}, action = {}) {
  const profile = action.producerOutputId
    ? (process.producerOutputs || {})[action.producerOutputId]
    : null;
  const allowed = profile?.allowedRoles || {};
  const admins = new Set(allowed.admin || []);
  return [
    ...[...admins].map(roleId => ({ roleId, level: 'admin' })),
    ...(allowed.write || [])
      .filter(roleId => !admins.has(roleId))
      .map(roleId => ({ roleId, level: 'write' }))
  ];
}

function maxGrantLevel(grants = [], fallback = 'write') {
  return grants.reduce((level, grant) => (
    ACCESS_ORDER[normalizeAccessLevel(grant.level)] > ACCESS_ORDER[level]
      ? normalizeAccessLevel(grant.level)
      : level
  ), normalizeAccessLevel(fallback));
}

function hasExplicitActionRoleGrants(access = {}) {
  if (Array.isArray(access.grants)) return access.grants.some(grant => grant?.roleId);
  if (Array.isArray(access.roleIds)) return access.roleIds.some(Boolean);
  return false;
}

export function outputSocketId(action = {}, kind = '') {
  return action.outputs?.find(output => output.typeId)?.id || (kind === 'createEntity' ? 'created' : 'entity');
}

function outputHandleId(action = {}, kind = '') {
  const outputs = action.outputs || [];
  if (outputs.length <= 1) return 'output';
  const id = outputSocketId(action, kind);
  const index = outputs.findIndex(output => output.id === id);
  return `output:${id || Math.max(index, 0)}`;
}

export function effectiveActionParentTypeId(action = {}, incoming = null, lineageBindings = []) {
  const typeId = action.typeId || action.outputs?.find(output => output.typeId)?.typeId || '';
  const compiledParents = [...new Set(lineageBindings
    .filter(binding => binding.childTypeId === typeId && binding.parentTypeId)
    .map(binding => binding.parentTypeId))];
  const candidates = [
    ...compiledParents,
    incoming?.parentInput ? incoming.typeId : '',
    !incoming?.parentInput ? incoming?.typeId : ''
  ].filter(Boolean);

  for (const parentType of candidates) {
    if (!parentSupportedByLineage(lineageBindings, typeId, parentType)) continue;
    return parentType;
  }
  return '';
}

function parentSupportedByLineage(lineageBindings = [], typeId = '', parentType = '') {
  if (!typeId || !parentType) return false;
  return Boolean(parentRelationForChild(typeId, parentType, lineageBindings));
}

export function actionInputsForExposure(action = {}, parentTypeId = '', domain = {}) {
  if (action.actionKind === 'runCommand') {
    return commandActionInputs(domain.commands?.[action.commandId] || {});
  }
  if ((action.actionKind || 'createEntity') !== 'createEntity') return action.inputs || [];
  const inputs = (action.inputs || []).map(input => {
    if (input.id !== 'parent') return input;
    return {
      ...input,
      label: parentTypeId || 'Parent entity',
      typeId: parentTypeId || '',
      required: false,
      state: parentTypeId ? input.state || '' : ''
    };
  });
  if (parentTypeId && !inputs.some(input => input.id === 'parent')) {
    inputs.unshift({
      id: 'parent',
      label: parentTypeId,
      typeId: parentTypeId,
      required: false
    });
  }
  const construction = normalizeConstruction(action.construction, action.typeId, domain) || { inputs: [] };
  const constructionInputs = new Map((construction.inputs || []).map(input => [input.id || input.path, input]));
  const contract = constructionContract(domain, action.typeId);
  return inputs.filter(input => (
    !contract?.derived
    || !input.constructionInputId
    || constructionInputs.has(input.constructionInputId)
  )).map(input => {
    const constructionInput = constructionInputs.get(input.constructionInputId)
      || constructionInputs.get(input.id)
      || constructionInputs.get(String(input.id || '').replace(/^data:/, ''))
      || constructionInputs.get(input.path);
    if (!constructionInput) return input;
    return {
      ...input,
      ...constructionInput,
      id: input.id,
      dataPath: input.dataPath || constructionInput.path,
      kind: input.kind || constructionInput.type,
      constructionInputId: input.constructionInputId || constructionInput.id
    };
  });
}

function commandActionInputs(command = {}) {
  const abstractInputs = command.input?.abstractEntities || [];
  const acceptedTypes = new Set(abstractInputs.flatMap(input => input.accepts || []));
  return [
    ...abstractInputs.map(input => ({
      id: input.name || input.type || input.capability,
      label: input.label || input.name,
      typeId: input.type || '',
      capability: input.capability || '',
      accepts: input.accepts || [],
      required: Boolean(input.required),
      multiple: Boolean(input.multiple),
      abstract: true,
      prompt: false
    })),
    ...(command.input?.entities || [])
      .filter(input => !acceptedTypes.has(input.type))
      .map(input => ({
        id: input.name || input.type,
        label: input.label || input.name || input.type,
        typeId: input.type,
        kind: 'entity',
        required: Boolean(input.required),
        prompt: input.prompt !== false,
        path: `entities.${input.name || input.type}`
      })),
    ...(command.input?.parameters || []).map(input => ({
      id: input.name,
      label: input.label || input.name,
      kind: input.type === 'object' ? 'json' : input.type || 'data',
      type: input.type || 'string',
      options: input.options || [],
      optionsFromEntity: input.optionsFromEntity || '',
      default: input.default ?? null,
      required: Boolean(input.required && input.default === undefined),
      prompt: input.display !== 'hidden',
      path: `parameters.${input.name}`,
      dataPath: `parameters.${input.name}`,
      typeId: input.typeId || '',
      editor: input.editor || '',
      templateFieldId: input.templateFieldId || ''
    }))
  ];
}

function deriveActionWindowScope(action = {}, incoming = null, lineageBindings = []) {
  const access = normalizeActionAccess(action.access);
  if (access.scope) return { ...access.scope };
  const inheritedScope = incoming?.scope ? { ...incoming.scope } : null;
  if ((action.actionKind || 'createEntity') !== 'createEntity') return inheritedScope;
  const parentType = effectiveActionParentTypeId(action, incoming, lineageBindings);
  if (!parentType || !incoming) return inheritedScope;
  const parentKey = parentRelationForChild(action.typeId, parentType, lineageBindings)?.lineageKey;
  if (!parentKey) return inheritedScope;
  if (inheritedScope?.instanceId && !inheritedScope[parentKey]) {
    const { instanceId, ...lineageScope } = inheritedScope;
    return { ...lineageScope, [parentKey]: instanceId };
  }
  return inheritedScope;
}

function commandOutputTypeIds(domain = {}, commandId = '') {
  const output = domain.commands?.[commandId]?.output || {};
  return [...new Set((output.entities || []).map(entry => entry?.type).filter(Boolean))];
}

function deriveCommandOutputScope(outputTypeId = '', incoming = null, lineageBindings = []) {
  const inheritedScope = incoming?.scope ? { ...incoming.scope } : null;
  if (!incoming?.typeId) return inheritedScope;
  const relation = parentRelationForChild(outputTypeId, incoming.typeId, lineageBindings);
  if (!relation) return inheritedScope;
  if (inheritedScope?.instanceId && !inheritedScope[relation.lineageKey]) {
    const { instanceId, ...lineageScope } = inheritedScope;
    return { ...lineageScope, [relation.lineageKey]: instanceId };
  }
  return inheritedScope;
}

function windowGrants(window = {}, action = {}, access = {}) {
  const grouped = new Map();
  for (const roleGrant of window.roleGrants || grantsFromRoleIds(window.roleIds || [], window.level)) {
    if (!roleGrant.roleId) continue;
    const { roleId, ...dimensions } = roleGrant;
    const normalized = { ...dimensions, level: normalizeAccessLevel(dimensions.level || window.level) };
    const key = JSON.stringify(normalized);
    if (!grouped.has(key)) grouped.set(key, { dimensions: normalized, roleIds: [] });
    grouped.get(key).roleIds.push(roleId);
  }
  return [...grouped.values()].map(({ dimensions, roleIds }) => windowGrant(window, action, access, dimensions, [...new Set(roleIds)]));
}

function windowGrant(window = {}, action = {}, access = {}, dimensions = {}, roleIds = window.roleIds || []) {
  const grant = {
    ...dimensions,
    feature: window.feature,
    level: normalizeAccessLevel(dimensions.level || window.level || 'read'),
    roleIds,
    sourceActionId: action.id,
    sourcePath: window.sourcePath
  };
  if (window.scope) grant.scope = { ...(dimensions.scope || {}), ...window.scope };
  if (window.status) grant.rule = mergeGrantRules(dimensions.rule, { fact: 'primaryState', equals: window.status });
  if ((action.actionKind || 'createEntity') === 'updateEntity' && actionTargetState(action)) {
    const from = access.stateFrom || action.state?.from || '';
    const to = access.stateTo || action.state?.to || window.status || '';
    if (from || to) grant.transitions = [...(dimensions.transitions || []), { from: from || undefined, to: to || undefined }];
  }
  return grant;
}

function mergeGrantRules(left, right) {
  if (!left) return right;
  if (!right) return left;
  return { all: [left, right] };
}

export function resolveEntityFeature(domain = {}, typeId) {
  const entity = (domain.entities || []).find(item => item.type === typeId);
  if (entity?.collection) return entity.collection;
  const fieldPolicy = getFieldPolicy(domain.fieldAccess || {}, typeId);
  if (fieldPolicy?.feature) return fieldPolicy.feature;
  return typeId;
}

export function compileGrantForAssignment(grant = {}, assignment = {}) {
  const incomplete = [];
  const serialized = JSON.parse(JSON.stringify({
    level: grant.level || 'read',
    actions: grant.actions,
    scope: grant.scope,
    transitions: grant.transitions,
    rule: grant.rule
  }));
  replacePlaceholders(serialized, assignment.bindings || {}, incomplete);
  return { grant: serialized, incomplete };
}

function replacePlaceholders(value, bindings, incomplete) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = replacePlaceholders(value[index], bindings, incomplete);
    }
    return value;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) value[key] = replacePlaceholders(child, bindings, incomplete);
    return value;
  }
  if (typeof value !== 'string' || !value.includes('$assignment.')) return value;
  if (value.startsWith('$assignment.') && value.match(/\$assignment\./g)?.length === 1) {
    const binding = value.slice('$assignment.'.length);
    const resolved = getByPath(bindings, binding);
    if (resolved === undefined || resolved === null || resolved === '') incomplete.push(binding);
    return resolved;
  }
  return value.replace(/\$assignment\.([A-Za-z0-9_.-]+)/g, (match, binding) => {
    const resolved = getByPath(bindings, binding);
    if (resolved === undefined || resolved === null || resolved === '') {
      incomplete.push(binding);
      return match;
    }
    return String(resolved);
  });
}

export function normalizeRoleCatalog(roles = {}) {
  return Object.fromEntries(Object.entries(normalizeRecord(roles)).map(([roleId, role]) => [roleId, {
    id: role.id || roleId,
    label: role.label || role.id || roleId
  }]));
}

export function emptyAssignmentAccess() {
  return { roleIds: [], bindings: {}, permissions: {}, screens: [], navigation: [], actions: [], incompleteBindings: [] };
}

export function withCompiledLineage(source = {}, screen = {}, lineageBindings = []) {
  if (screen.template !== 'typeList' || source.mode !== 'list' || source.typeId !== screen.typeId) return source;
  return { ...source, lineageBindings: lineageBindings.map(binding => ({ ...binding })) };
}

export function projectScreenForInferenceEquivalence(screen = {}) {
  return {
    label: screen.label ?? null,
    kind: screen.kind ?? null,
    template: screen.template ?? null,
    placement: screen.placement ?? null,
    typeId: screen.typeId ?? null,
    required: screen.required ?? null,
    roleIds: [...(screen.roleIds || [])],
    sources: screen.sources || [],
    regions: screen.regions || [],
    actions: screen.actions || []
  };
}

// Canonical form for projection equivalence: null- and undefined-valued
// entries are absent. Inference's requirement aggregation spells "unset"
// grant conditions as undefined keys (`rule`, `scope`, `transitions`),
// while any JSON-persisted authored record drops them — null and absent
// are the same projection, and only non-null differences distinguish an
// override from inference slop.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(key => value[key] !== null && value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// Screen actions attach by the screen's entity type when the action knows
// one (org-type actions must not attach to a sibling type's screen through
// a shared feature); feature-only actions keep the feature match.
function actionTargetsScreenType(action = {}, typeId = '', feature = '') {
  return action.typeId ? action.typeId === typeId : action.feature === feature;
}

export function inferredScreenActions(roleActions = [], feature, typeId = '') {
  return roleActions
    .filter(action => actionTargetsScreenType(action, typeId, feature))
    .map(action => action.actionId);
}

export function inferredDetailScreenActions(roleActions = [], feature, typeId = '') {
  return roleActions
    .filter(action => actionTargetsScreenType(action, typeId, feature))
    .filter(action => (action.actionKind || 'createEntity') !== 'createEntity')
    .map(action => action.actionId);
}

// One create affordance per (type, mode, initial state): the first
// compiled create owns the surface's button; later same-shape constructs
// stay executable actions.
export function dedupeRoleCreateActions(roleActions = [], processActions = {}) {
  const seen = new Set();
  return roleActions.filter(roleAction => {
    const actionId = roleAction.actionId || roleAction.id;
    const action = processActions[actionId] || {};
    const kind = roleAction.actionKind || action.actionKind || 'createEntity';
    if (kind !== 'createEntity') return true;
    const key = `${action.typeId || roleAction.typeId || ''}:${action.construction?.mode || ''}:${action.state?.to || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function contextualParentActions(roleActions = [], parentTypeId = '', domain = {}, processActions = {}, graphContext = buildActionGraphContext({ actions: processActions }), lineageBindings = []) {
  return roleActions
    .filter((roleAction) => {
      const actionId = roleAction.actionId || roleAction.id;
      const processAction = processActions[actionId] || {};
      const parentIncoming = graphContext.parentIncomingByActionId.get(actionId);
      if (!isParentBoundCreateAction(roleAction, processAction, parentIncoming, lineageBindings)) return false;
      const actionParent = effectiveActionParentTypeId({ ...processAction, ...roleAction }, parentIncoming, lineageBindings);
      if (actionParent !== parentTypeId) return false;
      const childTypeId = roleAction.typeId || processAction.typeId || '';
      return !parentRelationForChild(childTypeId, parentTypeId, lineageBindings);
    })
    .map(action => action.actionId);
}

function isParentBoundCreateAction(roleAction = {}, processAction = {}, parentIncoming = null, lineageBindings = []) {
  const kind = roleAction.actionKind || processAction.actionKind || 'createEntity';
  const parentTypeId = effectiveActionParentTypeId({ ...processAction, ...roleAction }, parentIncoming, lineageBindings);
  return kind === 'createEntity' && Boolean(parentTypeId);
}

export function childRegionsForParentDetail({ role = {}, parentTypeId = '', domain = {}, actions = {}, graphContext = buildActionGraphContext({ actions }), lineageBindings = [] } = {}) {
  const sourcesByEntity = new Map();
  const regions = [];
  const actionIds = [];
  const grantsByFeature = groupGrantsByFeature(role.grants || []);
  // Presentation placement reads the merged hierarchy: compiled lineage
  // bindings first, declared containment (children edges) filling pairs
  // the graph never composed.
  const hierarchy = mergedHierarchyBindings(lineageBindings, domain);
  const childRelations = lineageRelationsForParent(parentTypeId, hierarchy) || [];

  for (const relation of childRelations) {
    if (!relation.childType || !relation.lineageKey) continue;
    const childFeature = featureFromTypeId(domain, relation.childType);
    if (!childFeature) continue;
    const childGrants = grantsByFeature.get(childFeature) || [];
    if (!childGrants.length) continue;
    ensureChildRegion({
      sourcesByEntity,
      regions,
      childTypeId: relation.childType,
      childFeature,
      childGrants,
      parentIdKey: relation.lineageKey
    });
  }

  // Declared 'many' relations compose as readable child collections: the
  // record page arranges them with the same weight-driven ladder as
  // containment children (SPEC §Generative UI), and the detail body's
  // chip row for the covered key hides (the composer's relationKey
  // channel). Single-target relations stay chip rows on the body.
  for (const relation of domain.relations || []) {
    if (relation.ownerType !== parentTypeId || relation.cardinality !== 'many') continue;
    if (!relation.key || !relation.targetType) continue;
    const targetFeature = featureFromTypeId(domain, relation.targetType);
    if (!targetFeature) continue;
    const targetGrants = grantsByFeature.get(targetFeature) || [];
    if (!targetGrants.length) continue;
    const sourceId = `${relation.targetType}_${relation.key}_related`;
    if (sourcesByEntity.has(sourceId)) continue;
    sourcesByEntity.set(sourceId, {
      id: sourceId,
      label: relation.targetType,
      typeId: relation.targetType,
      mode: 'list',
      required: aggregateScreenRequirement(targetFeature, targetGrants),
      relation: { sourceId: parentTypeId, key: relation.key }
    });
    regions.push({
      id: `${sourceId}_region`,
      slot: 'children',
      sourceId,
      surface: 'card',
      actions: []
    });
  }

  for (const action of role.actions || []) {
    const actionId = action.actionId || action.id;
    const processAction = actions[actionId] || {};
    const kind = action.actionKind || processAction.actionKind || 'createEntity';
    const actionParent = effectiveActionParentTypeId({ ...processAction, ...action }, graphContext.parentIncomingByActionId.get(actionId), lineageBindings);
    const childTypeId = action.typeId || processAction.typeId || '';
    if (!childTypeId) continue;
    // A root create whose construction prompts a lineage parent belongs to
    // that parent's child region: the declared children edge makes the
    // pair valid and the picker binds the created child under the opened
    // parent.
    const constructionParent = constructionLineageParentTypeId({ ...processAction, ...action }, parentTypeId);
    if (kind !== 'createEntity' || (actionParent !== parentTypeId && constructionParent !== parentTypeId)) continue;
    const parentRelation = parentRelationForChild(childTypeId, parentTypeId, hierarchy)
      || (constructionParent === parentTypeId
        ? declaredParentRelation(childTypeId, parentTypeId, domain)
        : null);
    if (!parentRelation) continue;
    const childFeature = featureFromTypeId(domain, childTypeId);
    if (!childFeature) continue;
    const childGrants = grantsByFeature.get(childFeature) || [];
    const region = ensureChildRegion({
      sourcesByEntity,
      regions,
      childTypeId,
      childFeature,
      childGrants,
      parentIdKey: parentRelation.lineageKey
    });
    if (actionId && !region.actions.includes(actionId)) region.actions.push(actionId);
    if (actionId) actionIds.push(actionId);
  }
  return {
    sources: [...sourcesByEntity.values()],
    regions,
    actionIds
  };
}

function ensureChildRegion({ sourcesByEntity, regions, childTypeId, childFeature, childGrants = [], parentIdKey } = {}) {
  const sourceId = `${childTypeId}_children`;
  if (!sourcesByEntity.has(sourceId)) {
    sourcesByEntity.set(sourceId, {
      id: sourceId,
      label: childTypeId,
      typeId: childTypeId,
      mode: 'list',
      required: aggregateScreenRequirement(childFeature, childGrants),
      filters: { [parentIdKey]: '$screen.scope.instanceId' }
    });
  }
  let region = regions.find(item => item.sourceId === sourceId);
  if (!region) {
    region = {
      id: `${sourceId}_region`,
      // Child collections nest under the detail surface's record page
      // (the ui-mapping composer's children slot), never beside it as
      // top-level regions.
      slot: 'children',
      sourceId,
      surface: 'card',
      actions: []
    };
    regions.push(region);
  }
  return region;
}

// The parent a root create's construction prompts: a lineage input whose
// declared entity type matches the region parent (the org children-edge
// picker). Only the construction contract is consulted — graph parents
// still come from compiled lineage bindings.
function constructionLineageParentTypeId(action = {}, parentTypeId = '') {
  if (!parentTypeId) return '';
  return (action.construction?.inputs || [])
    .filter(input => String(input.id || input.path || '').startsWith('lineage.'))
    .some(input => input.typeId === parentTypeId || input.type?.typeId === parentTypeId)
    ? parentTypeId
    : '';
}

function declaredParentRelation(childTypeId = '', parentTypeId = '', domain = {}) {
  const triple = (domain.containment || []).find(candidate => (
    candidate.childType === childTypeId && candidate.parentType === parentTypeId
  ));
  return triple ? { childType: childTypeId, parentType: parentTypeId, lineageKey: triple.lineageKey } : null;
}

function parentRelationForChild(childTypeId = '', parentTypeId = '', lineageBindings = []) {
  const binding = lineageBindings.find(binding =>
    binding.childTypeId === childTypeId
    && (!parentTypeId || binding.parentTypeId === parentTypeId)
    && binding.lineageKey
  );
  if (!binding) return null;
  return { childType: binding.childTypeId, parentType: binding.parentTypeId, lineageKey: binding.lineageKey };
}

export function groupGrantsByFeature(grants = []) {
  const map = new Map();
  for (const grant of grants) {
    if (!grant?.feature) continue;
    if (!map.has(grant.feature)) map.set(grant.feature, []);
    map.get(grant.feature).push(grant);
  }
  return map;
}

// Read-level requirements for inferred surfaces: lineage scope rides along
// (a read may be parent-scoped), but state-scoped grant windows — the status
// rules and transitions of state-changing actions — never do. A read list
// gated by a transition's target states hides every instance outside them
// (stateless instances, states the wiring no longer targets); those windows
// govern what a role may CHANGE. An authored status window on an authored
// screen keeps scoping its reads — only the implicit derivation dies here.
export function aggregateScreenRequirement(feature, grants = []) {
  if (grants.length === 1) {
    const grant = grants[0];
    return {
      feature,
      level: 'read',
      scope: grant.scope
    };
  }
  const scopes = grants.map(grant => grant.scope).filter(Boolean);
  return {
    feature,
    level: 'read',
    ...(scopes.length === 1 ? { scope: scopes[0] } : {})
  };
}

// Grant features resolve to a type by exact type identity only. The
// per-class collection names ('files', 'items', 'groups', 'processes')
// are shared by every type of that class by design: attributing a
// collection-level feature to whichever type composes first is mount
// order dependent, so a shared collection attributes a screen only when
// exactly one non-meta type stores in it — otherwise the grant carries
// no attributable entity and inference skips it.
export function typeIdFromFeature(domain = {}, feature) {
  const entities = (domain.entities || []).filter(entity => !entity.meta);
  const exact = entities.filter(entity => entity.type === feature || `${entity.type}s` === feature);
  if (exact.length === 1) return exact[0].type;
  if (exact.length > 1) return null;
  const sharers = entities.filter(entity => entity.collection === feature);
  return sharers.length === 1 ? sharers[0].type : null;
}

export function typeIdFromProducerOutputs(producerOutputs = {}, domain = {}, feature) {
  const typeId = Object.values(producerOutputs)
    .find(profile => resolveEntityFeature(domain, profile.typeId) === feature)
    ?.typeId || null;
  const definition = (domain.entities || []).find(entity => entity.type === typeId);
  return definition?.meta ? null : typeId;
}

export function entityLabelOf(domain = {}, typeId = '') {
  return (domain.entities || []).find(entity => entity.type === typeId)?.label || null;
}

export function featureFromTypeId(domain = {}, typeId) {
  if (!typeId) return null;
  return resolveEntityFeature(domain, typeId);
}

export function screenAppliesToRole(screen = {}, roleId) {
  return !screen.roleIds?.length || screen.roleIds.includes(roleId);
}

export function compileScreenForAssignment(screen = {}, assignment = {}, roleId = null) {
  const incomplete = [];
  const scoped = JSON.parse(JSON.stringify({
    id: screen.id,
    label: screen.label,
    labelKey: screen.labelKey,
    kind: screen.kind,
    template: screen.template,
    route: screen.route,
    sourceRoute: screen.sourceRoute || screen.route,
    placement: screen.placement,
    typeId: screen.typeId || null,
    required: screen.required,
    scope: { ...(screen.scope || {}), ...(screen.bindings || {}) },
    sources: screen.sources || [],
    regions: screen.regions || [],
    actions: screen.actions || [],
    sourceRoleIds: roleId ? [roleId] : []
  }));
  replacePlaceholders(scoped, assignment.bindings || {}, incomplete);
  const screenKey = scoped.screenKey || makeScreenKey(scoped);
  return {
    incomplete,
    screen: {
      ...scoped,
      screenKey,
      route: generatedScreenRoute(screenKey)
    }
  };
}

function makeScreenKey(screen = {}) {
  const scopeValues = Object.values(screen.scope || {}).filter(value => value !== undefined && value !== null && value !== '');
  return [screen.id, ...(scopeValues.length ? scopeValues : [screen.route])].filter(Boolean).map(String).join(':');
}

export function mergeCompiledScreen(screenMap, screen) {
  const mergeKey = screenMergeKey(screen);
  screen.screenKey = mergeKey;
  screen.route = generatedScreenRoute(mergeKey);
  const existing = screenMap.get(mergeKey);
  if (!existing) {
    screenMap.set(mergeKey, screen);
    return;
  }
  existing.required = mergeRequirements(existing.required, screen.required);
  existing.actions = [...new Set([...(existing.actions || []), ...(screen.actions || [])])];
  existing.sourceRoleIds = [...new Set([...(existing.sourceRoleIds || []), ...(screen.sourceRoleIds || [])])];
  existing.roleIds = [...new Set([...(existing.roleIds || []), ...(screen.roleIds || [])])];
  existing.sources = mergeScreenSources(existing.sources || [], screen.sources || []);
  existing.regions = mergeScreenRegions(existing.regions || [], screen.regions || []);
}

function screenMergeKey(screen = {}) {
  if (screen.template === 'home') return screen.screenKey || screen.id;
  const typeId = screen.typeId;
  if (!String(screen.id || '').startsWith('auto_') || !typeId) return screen.screenKey || screen.id;
  const suffix = screen.template === 'instanceDetail' ? '_detail' : '';
  const scopeValues = Object.values(screen.scope || {}).filter(value => value !== undefined && value !== null && value !== '');
  return [`auto_${typeId}${suffix}`, ...scopeValues].filter(Boolean).map(String).join(':');
}

function mergeScreenSources(existing = [], next = []) {
  const byKey = new Map(existing.map(source => [sourceMergeKey(source), { ...source }]));
  for (const source of next) {
    const key = sourceMergeKey(source);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...source });
      continue;
    }
    current.required = mergeRequirements(current.required, source.required);
    current.filters = { ...(current.filters || {}), ...(source.filters || {}) };
  }
  return [...byKey.values()];
}

function sourceMergeKey(source = {}) {
  return [
    source.typeId || source.typeId || source.id,
    source.mode || '',
    JSON.stringify(source.filters || {}),
    source.identifier || ''
  ].join(':');
}

function mergeScreenRegions(existing = [], next = []) {
  const byKey = new Map(existing.map(region => [regionMergeKey(region), { ...region, actions: [...(region.actions || [])] }]));
  for (const region of next) {
    const key = regionMergeKey(region);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...region, actions: [...(region.actions || [])] });
      continue;
    }
    current.actions = [...new Set([...(current.actions || []), ...(region.actions || [])])];
  }
  return [...byKey.values()];
}

function regionMergeKey(region = {}) {
  return [region.sourceId || region.id, region.slot || '', region.surface || ''].join(':');
}

function mergeRequirements(left = null, right = null) {
  if (!left) return right || null;
  if (!right) return left || null;
  if (left.feature !== right.feature) return left;
  const rules = [left.rule, right.rule].flatMap(flattenRequirementRules).filter(Boolean);
  const scopes = [left.scope, right.scope].filter(Boolean);
  const transitions = [left.transitions, right.transitions].flatMap(item => Array.isArray(item) ? item : [item]).filter(Boolean);
  return {
    feature: left.feature,
    level: 'read',
    ...(rules.length === 1 ? { rule: rules[0] } : {}),
    ...(rules.length > 1 ? { rule: { any: dedupeObjects(rules) } } : {}),
    ...(scopes.length === 1 ? { scope: scopes[0] } : {}),
    ...(transitions.length ? { transitions: dedupeObjects(transitions) } : {})
  };
}

function flattenRequirementRules(rule) {
  if (!rule) return [];
  if (Array.isArray(rule.any)) return rule.any.flatMap(flattenRequirementRules);
  return [rule];
}

function dedupeObjects(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function screenToNavigation(screen = {}) {
  return {
    id: screen.screenKey || screen.id,
    route: screen.route,
    requires: screen.required || null,
    screenId: screen.id,
    screenKey: screen.screenKey
  };
}

export function dedupeNavigation(items = []) {
  const byKey = new Map();
  for (const item of items) {
    if (!item?.route) continue;
    byKey.set(item.id || item.route, item);
  }
  return [...byKey.values()];
}

export function compileFieldPolicies(producerOutputs = {}, domain = {}) {
  const policies = {};
  for (const profile of Object.values(producerOutputs)) {
    policies[profile.producerOutputId] = {
      read: profile.fields?.read || [],
      write: profile.fields?.write || [],
      private: profile.fields?.private || [],
      relations: (domain.relations || []).filter(relation => (
        relation.ownerType === profile.typeId && (profile.relations || []).includes(relation.key)
      ))
    };
  }
  return policies;
}

export function compileServices(services = {}) {
  return Object.fromEntries(Object.entries(services).map(([id, service]) => [id, {
    id: service.id || id,
    enabled: true,
    commandId: service.commandId || null,
    principals: {
      run: service.access?.runPrincipals || [],
      view: service.access?.viewPrincipals || []
    },
    billing: compileServiceBilling(service.billing),
    inputs: service.inputs || [],
    outputs: service.outputs || []
  }]));
}

function compileServiceBilling(billing = {}) {
  const tokenCost = Number(billing.tokenCost);
  if (billing.mode !== 'prepaidTokens' || !Number.isFinite(tokenCost) || tokenCost <= 0) {
    return { mode: 'none', tokenCost: 0, meterKey: null };
  }
  return {
    mode: 'prepaidTokens',
    tokenCost,
    meterKey: billing.meterKey || null
  };
}

export function compileSockets(sockets = {}) {
  return Object.fromEntries(Object.entries(sockets).map(([id, socket]) => [id, {
    id: socket.id || id,
    label: socket.label || socket.id || id,
    direction: socket.direction === 'inbound' ? 'inbound' : 'outbound',
    typeId: socket.typeId || null,
    projection: socket.projection || { fields: [], excludeFields: [] },
    receiverLifecycle: socket.receiverLifecycle || { mode: 'defaultCreated', workflow: null },
    access: {
      sendRoles: socket.access?.sendRoles || [],
      receiveRoles: socket.access?.receiveRoles || []
    },
    inputs: socket.direction === 'inbound'
      ? []
      : [{ id: 'entity', typeId: socket.typeId, required: true }],
    outputs: socket.direction === 'inbound'
      ? [{ id: 'received', typeId: socket.typeId, status: initialSocketStatus(socket) }]
      : [{ id: 'projection', typeId: socket.typeId, projection: true, fields: socket.projection?.fields || [] }]
  }]));
}

function initialSocketStatus(socket = {}) {
  const lifecycle = socket.receiverLifecycle || {};
  if (lifecycle.mode === 'custom' && lifecycle.workflow) {
    const workflow = normalizeWorkflow(lifecycle.workflow);
    const region = workflow.regions?.[workflow.primaryRegion] || Object.values(workflow.regions || {})[0];
    return region?.initial || '';
  }
  return '';
}

export function compileActions(actions = {}, process = {}, domain = {}, lineageBindings = []) {
  const graphContext = buildActionGraphContext(process);
  const actionWindows = compileActionAccessWindows(process, domain, lineageBindings);
  return Object.fromEntries(Object.entries(actions).map(([id, action]) => {
    const parentTypeId = effectiveActionParentTypeId(action, graphContext.parentIncomingByActionId.get(id), lineageBindings);
    const actionWindow = actionWindows.get(id);
    const resolvedTypeId = actionTypeId(action) || actionWindow?.input?.typeId || actionWindow?.outputs?.[0]?.typeId || null;
    if (resolvedTypeId && !action.producerOutputId && action.actionKind === 'createEntity') {
      throw new Error(`Action ${id} requires producerOutputId`);
    }
    const producerOutput = action.producerOutputId ? process.producerOutputs?.[action.producerOutputId] : null;
    if (action.producerOutputId && !producerOutput) throw new Error(`Action ${id} uses unknown producerOutputId ${action.producerOutputId}`);
    if (producerOutput && producerOutput.typeId !== resolvedTypeId) {
      throw new Error(`Action ${id} producerOutputId emits ${producerOutput.typeId}, not ${resolvedTypeId}`);
    }
    const normalizedAction = resolvedTypeId && !action.typeId ? { ...action, typeId: resolvedTypeId } : action;
    let inputs = actionInputsForExposure(normalizedAction, parentTypeId, domain).map(input => (
      input.id === 'entity' && !input.typeId && resolvedTypeId ? { ...input, typeId: resolvedTypeId } : input
    ));
    if ((normalizedAction.actionKind || 'createEntity') === 'runCommand') {
      const inputIds = new Set(inputs.map(input => input.id).filter(Boolean));
      const wired = new Set(wiredHandlePaths(id, process.graph, inputIds));
      inputs = inputs.map(input => {
        const key = input.id || String(input.dataPath || '').replace(/^parameters\./, '');
        return wired.has(key) ? { ...input, prompt: false } : input;
      });
    }
    const outputs = action.outputs || [];
    return [id, {
      id: action.id || id,
      // The domain resolves the target entity's authored render label —
      // raw type ids never reach button captions on this channel either.
      label: displayActionLabel(action, id, process, domain),
      actionKind: action.actionKind || 'createEntity',
      producerOutputId: action.producerOutputId || null,
      typeId: resolvedTypeId,
      parentTypeId: parentTypeId || null,
      parentRevision: resolveParentRevision(action.parentRevision, parentTypeId, domain),
      commandId: action.commandId || null,
      state: compileActionStatus(action, process, wiringArrivalState(id, normalizedAction, resolvedTypeId, graphContext, actionWindows)),
      mutation: action.mutation || { fields: [] },
      relationMutation: action.relationMutation || null,
      projection: action.projection || null,
      // The construction contract is the create form: only create actions
      // carry it. Hydrating the type's default contract onto deletes and
      // transitions opened the create dialog for every non-create action
      // (planActionLaunch keys off construction.inputs).
      construction: (action.actionKind || 'createEntity') === 'createEntity'
        ? normalizeConstruction(action.construction, action.typeId, domain)
        : null,
      inputPolicy: compiledInputPolicy(action, domain),
      stateRef: action.stateRef || null,
      guard: action.guard || null,
      access: normalizeActionAccess(action.access),
      trigger: {
        mode: action.trigger?.mode || 'manual'
      },
      inputs,
      outputs,
      contracts: compileActionEntityContracts(normalizedAction, inputs, outputs, actionWindow, domain),
      events: action.events || []
    }];
  }));
}

export function compileActionEntityContracts(action = {}, inputs = [], outputs = [], actionWindow = null, domain = {}) {
  const inputContracts = inputs
    .filter(input => input.typeId)
    .map(input => ({
      id: input.id || 'entity',
      kind: input.multiple ? 'entity_list' : 'entity',
      typeId: input.typeId,
      required: false,
      state: input.state || null,
      relationKey: input.relationKey || null,
      cardinality: input.cardinality || null
    }));
  const outputContracts = outputs
    .filter(output => output.typeId)
    .map(output => ({
      id: output.id || 'entity',
      kind: output.multiple ? 'entity_list' : 'entity',
      typeId: output.typeId,
      state: output.state || null
    }));
  const typeId = actionTypeId(action);
  if (action.actionKind === 'createEntity' && typeId && !outputContracts.some(contract => contract.typeId === typeId)) {
    outputContracts.push({ id: 'created', kind: 'entity', typeId, state: actionTargetState(action) || null });
  }
  if (action.actionKind === 'updateEntity' && typeId) {
    if (!inputContracts.some(contract => contract.typeId === typeId)) {
      inputContracts.unshift({ id: 'entity', kind: 'entity', typeId, required: false, state: actionWindow?.input?.state || null });
    }
    if (!outputContracts.some(contract => contract.typeId === typeId)) {
      outputContracts.push({ id: 'entity', kind: 'entity', typeId, status: actionTargetState(action) || actionWindow?.outputs?.[0]?.state || null });
    }
  }
  if (action.actionKind === 'runCommand') {
    for (const outputType of commandOutputTypeIds(domain, action.commandId)) {
      if (!outputContracts.some(contract => contract.typeId === outputType)) {
        outputContracts.push({ id: outputType, kind: 'entity_list', typeId: outputType, status: null });
      }
    }
  }
  return { inputs: inputContracts, outputs: outputContracts };
}

function compileActionStatus(action = {}, process = {}, wiredFrom = '') {
  const target = actionTargetState(action, process);
  const metadata = action.stateRef ? stateDefinitionMetadata(process.stateDefinitions?.[action.stateRef]) : {};
  return {
    ...(action.state || {}),
    ...metadata,
    ...(target ? { to: target } : {}),
    // The wiring's arrival state scopes the action to the states its
    // transition is declared from — the same fact the machine edge
    // derives. An authored from wins (legacy reference data); a wiring
    // with several arrival states stays unscoped on the manifest (the
    // machine still guards execution server-side).
    ...(!action.state?.from && wiredFrom ? { from: wiredFrom } : {})
  };
}

// The declared transition sources of a status-mutating action: incoming
// entity-edge status windows, narrowed to an authored `from` when legacy
// reference data carries one. The ONE derivation the machine edges, the
// action window, and run availability consume — no consumer re-derives
// the wiring independently.
export function declaredTransitionSources(actionId, action = {}, typeId = '', graphContext, actionWindows) {
  if ((action.actionKind || 'createEntity') !== 'updateEntity') return [];
  // Every arrival window on the action's entity wires declares an edge —
  // a loop-back wire is as real as the first one — and an authored `from`
  // is a fallback for legacy data without wires, never a filter on the
  // wiring.
  return workflowTransitionSources(actionId, action, typeId, graphContext, actionWindows);
}

// The single arrival state the wiring declares, when unambiguous — the
// manifest's scoping fact. State-bound effects of every kind scope by
// it: a delete wired from one state renders only there (per-state delete
// buttons), exactly like an update's transition window. The machine-edge
// derivation (declaredTransitionSources) stays update-only — deletes
// author no machine edges.
export function wiringArrivalState(actionId, action = {}, typeId = '', graphContext, actionWindows) {
  const sources = workflowTransitionSources(actionId, action, typeId, graphContext, actionWindows);
  return sources.length === 1 ? sources[0].status : '';
}

export function actionTargetState(action = {}, process = {}) {
  const stateRef = action.stateRef;
  const referenced = stateRef ? process.stateDefinitions?.[stateRef] : null;
  return referenced?.stateId
    || action.state?.to
    || action.access?.stateTo
    || action.outputs?.find(output => output.status)?.status
    || '';
}

function stateDefinitionMetadata(definition = {}) {
  if (!definition) return {};
  return {
    ...(definition.label ? { label: definition.label } : {}),
    ...(definition.color || definition.severity ? { color: definition.color || definition.severity } : {}),
    ...(definition.severity || definition.color ? { severity: definition.severity || definition.color } : {}),
    ...(definition.icon ? { icon: definition.icon } : {})
  };
}

export function compileStatusDefinitions(stateDefinitions = {}) {
  return Object.fromEntries(Object.entries(stateDefinitions).map(([id, definition]) => [id, {
    id: definition.id || id,
    typeId: definition.typeId || '',
    stateId: definition.stateId || definition.id || id,
    label: definition.label || definition.stateId || id,
    color: definition.color || '',
    severity: definition.severity || definition.color || '',
    icon: definition.icon || '',
    region: definition.region || '',
    parentStatusId: definition.parentStatusId || '',
    ...(definition.lifecycle ? { lifecycle: clonePlain(definition.lifecycle) } : {})
  }]));
}

export function compileValueInputs(valueInputs = {}) {
  return Object.fromEntries(Object.entries(valueInputs).map(([id, input]) => [id, {
    id: input.id || id,
    label: input.label || input.id || id,
    valueType: input.valueType || 'string',
    structure: input.structure || 'item',
    value: input.value ?? '',
    icon: input.icon || ''
  }]));
}

export function compileProcessNodes(processNodes = {}) {
  return Object.fromEntries(Object.entries(processNodes).map(([id, node]) => [id, {
    id: node.id || id,
    label: node.label || node.kind || id,
    kind: node.kind || 'entityDecompose',
    mode: node.mode || '',
    typeId: node.typeId || '',
    relationTypeId: node.relationTypeId || '',
    relationKey: node.relationKey || '',
    relationCardinality: node.relationCardinality || '',
    block: node.block || '',
    path: Array.isArray(node.path) ? [...node.path] : node.path || '',
    valueType: node.valueType || '',
    structure: node.structure || 'item',
    operation: node.operation || '',
    region: node.region || '',
    archiveIntent: node.archiveIntent || '',
    metadata: node.metadata ? clonePlain(node.metadata) : null,
    lifecycle: node.lifecycle ? clonePlain(node.lifecycle) : null,
    template: node.template || '',
    inputs: Array.isArray(node.inputs) ? node.inputs.map(input => ({ ...input })) : [],
    outputs: Array.isArray(node.outputs) ? node.outputs.map(output => ({ ...output })) : []
  }]));
}

export function normalizeConstruction(construction = {}, typeId = '', domain = {}) {
  const contract = constructionContract(domain, typeId);
  if (!contract) return null;
  const source = construction || {};
  const modes = Array.isArray(contract.modes) ? contract.modes : [];
  const mode = source.mode
    ? source.mode
    : (modes.includes(contract.defaultMode) ? contract.defaultMode : (modes[0] || ''));
  const declaredInputs = Array.isArray(source.inputs) ? source.inputs : [];
  const blocksOwnConstruction = source.blockComposed && mode === 'genericCreate';
  const contractInputsRaw = constructionInputsForContract(contract, mode);
  // Lineage axes are contract vocabulary (the containment declaration
  // owns them): the contract's current lineage set is the addressable
  // set on every construction, block-composed or not.
  const contractLineage = new Set(contractInputsRaw
    .map(input => String(input.id || input.path || ''))
    .filter(path => path.startsWith('lineage.')));
  // An authored row input owns its ref field: the contract's relation
  // twin (`relations.<key>`) would render the same reference twice, so
  // the authored `fields.<key>` input wins.
  const authoredFieldPaths = new Set(declaredInputs
    .map(input => String(input.path || input.id || ''))
    .filter(path => path.startsWith('fields.')));
  const contractInputs = contractInputsRaw
    .filter(input => !blocksOwnConstruction || !isCanonicalBlockConstructionPath(input.path))
    .filter(input => {
      const path = String(input.path || input.id || '');
      return !(path.startsWith('relations.') && authoredFieldPaths.has(`fields.${path.slice('relations.'.length)}`));
    });
  // A declared mode (creation protocols, construct operators) addresses
  // exactly its mode inputs plus edges, and every authored input
  // addresses the current contract (a block-composed construct keeps
  // its canonical block entries): authored inputs outside that set are
  // stale contract stamps, dropped here instead of surviving as prompts.
  const restrictToContract = contract.derived || Object.hasOwn(contract.modeInputs || {}, mode);
  const inputsById = new Map(contractInputs.map(input => {
    const normalizedInput = normalizeConstructionInput(input, domain);
    return [normalizedInput.id || normalizedInput.path, normalizedInput];
  }));
  for (const input of declaredInputs) {
    const key = input.id || input.path;
    if (String(input.path || key || '').startsWith('lineage.') && !contractLineage.has(key)) continue;
    const contractInput = inputsById.get(key);
    const composedBlock = blocksOwnConstruction && isCanonicalBlockConstructionPath(input.path);
    if (!contractInput && (restrictToContract || !composedBlock)) continue;
    inputsById.set(key, contractInput
      ? mergeConstructionInput(contractInput, input)
      : { ...input }
    );
  }
  return {
    mode,
    ...(source.blockComposed ? { blockComposed: true } : {}),
    // Emitted creators stay on the canonical expanded [{ kind, creation }]
    // shape (law: README Create and update effects).
    inputs: [...inputsById.values()].map(input => normalizeConstructionInput(input, domain))
  };
}

function isCanonicalBlockConstructionPath(path = '') {
  return ['fields', 'lineage', 'relations', 'name']
    .some(block => String(path).startsWith(`${block}.`) || String(path) === block);
}

function normalizeConstructionInput(input = {}, domain = {}) {
  if (typeof input.creator?.attachmentKinds !== 'string') {
    return { ...input };
  }
  return {
    ...input,
    creator: {
      ...input.creator,
      attachmentKinds: Object.values(domain.attachmentKinds || {})
        .filter(kind => ['upload', 'capture', 'editor'].includes(kind.creation?.mode))
        .map(kind => ({ kind: kind.kind || kind.id, creation: kind.creation }))
    }
  };
}

export function resolveParentRevision(parentRevision = {}, parentTypeId = '', domain = {}) {
  const contract = domain.revisions?.[parentTypeId] || {};
  const scopes = Array.isArray(contract.scopes) ? contract.scopes : [];
  const requestedScope = parentRevision.scope || contract.defaultScope || scopes[0] || '';
  return {
    enabled: parentRevision.enabled === true,
    scope: scopes.includes(requestedScope) ? requestedScope : (contract.defaultScope || scopes[0] || requestedScope)
  };
}

function mergeConstructionInput(contractInput = {}, declaredInput = {}) {
  return {
    ...declaredInput,
    ...contractInput,
    ...(contractInput.creator || declaredInput.creator ? {
      creator: { ...(contractInput.creator || {}), ...(declaredInput.creator || {}) }
    } : {}),
    default: declaredInput.default ?? contractInput.default,
    value: declaredInput.value ?? contractInput.value,
    prompt: declaredInput.prompt ?? contractInput.prompt,
    required: Boolean(declaredInput.required === true || contractInput.required === true)
  };
}

function normalizeInputPolicy(inputPolicy = {}) {
  return {
    prompt: inputPolicy.prompt !== false,
    fields: Array.isArray(inputPolicy.fields)
      ? inputPolicy.fields.map(field => ({ ...field, required: field.required === true }))
      : []
  };
}

export function normalizeActionInputPolicy(inputPolicy = {}, construction = {}, typeId = '', domain = {}) {
  const normalizedConstruction = normalizeConstruction(construction, typeId, domain) || { inputs: [] };
  const policyFields = Array.isArray(inputPolicy.fields) ? inputPolicy.fields : [];
  const fieldsById = new Map(
    normalizedConstruction.inputs
      .filter(input => input.prompt)
      .map(input => [input.id || input.path, { ...input }])
  );
  // One prompt row per addressed value: a policy field keyed `field:<path>`
  // addresses the same value as the construction input carrying that path,
  // so it merges into that input instead of adding a second row.
  const keyOfConstructionPath = path => {
    const input = normalizedConstruction.inputs.find(candidate => (candidate.id || candidate.path) === path);
    return input ? (input.id || input.path) : null;
  };
  const contract = constructionContract(domain, typeId);
  const restrictToContract = Boolean(contract?.derived)
    || Object.hasOwn(contract?.modeInputs || {}, normalizedConstruction.mode || '');
  for (const field of policyFields) {
    const key = field.id || field.path;
    const constructionKey = keyOfConstructionPath(field.path) || key;
    const constructionField = normalizedConstruction.inputs.find(input => (input.id || input.path) === constructionKey);
    if (restrictToContract && !constructionField) continue;
    const merged = constructionField
      ? mergeConstructionInput(constructionField, field)
      : {
          ...(fieldsById.get(constructionKey) || {}),
          ...field,
          ...(constructionKey !== key ? { id: constructionKey } : {})
        };
    if (merged.prompt || !constructionField) fieldsById.set(constructionKey, { ...merged, ...(constructionKey !== key ? { id: constructionKey } : {}) });
    else fieldsById.delete(constructionKey);
  }
  const fields = [...fieldsById.values()].map(field => normalizeConstructionInput(field, domain));
  return {
    prompt: inputPolicy.prompt !== false && fields.some(field => field.prompt),
    fields
  };
}

export function compiledInputPolicy(action = {}, domain = {}) {
  return (action.actionKind || 'createEntity') === 'createEntity'
    ? normalizeActionInputPolicy(action.inputPolicy, action.construction, action.typeId, domain)
    : normalizeInputPolicy(action.inputPolicy);
}

export function displayActionLabel(action = {}, id = '', process = {}, domain = {}) {
  const explicit = String(action.label || '').trim();
  if (explicit && !isGenericActionLabel(explicit, action.actionKind)) return explicit;

  const typeId = action.typeId
    || action.inputs?.find(input => input.typeId)?.typeId
    || action.outputs?.find(output => output.typeId)?.typeId
    || '';
  if ((action.actionKind || 'createEntity') === 'createEntity') {
    // The create caption names the target class plus a distinguishing
    // construction mode; the initial state is process machinery the surface
    // reveals after creation, never button copy.
    const modeLabel = creationModeLabel(action.construction?.mode);
    return ['Create', typeIdLabel(domain, typeId), modeLabel && `from ${modeLabel}`]
      .filter(Boolean).join(' ');
  }
  if (action.actionKind === 'updateEntity') {
    if (actionTargetState(action, process)) return stateTargetLabel(action, process) || ['Move', typeIdLabel(domain, typeId), action.state?.to].filter(Boolean).join(' ');
    return ['Update', typeIdLabel(domain, typeId)].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'deleteEntity') {
    return ['Delete', typeIdLabel(domain, typeId)].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'runCommand') {
    return ['Run', serviceRenderLabel(domain, action.commandId) || action.commandId].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'sendToOrganization') {
    return ['Send', typeIdLabel(domain, typeId)].filter(Boolean).join(' ');
  }
  return action.actionKind || id;
}

function stateTargetLabel(action = {}, process = {}) {
  const referenced = action.stateRef ? process.stateDefinitions?.[action.stateRef] : null;
  return referenced?.label
    || referenced?.stateId
    || action.state?.label
    || action.state?.to
    || action.access?.stateTo
    || action.outputs?.find(output => output.status)?.status
    || '';
}

// A plugin service's declared render label — the authored caption source
// for its run action (a raw command id never reaches a button).
function serviceRenderLabel(domain = {}, commandId = '') {
  return domain.serviceContracts?.[commandId]?.render?.label || '';
}

function isGenericActionLabel(label, actionKind = '') {
  const normalized = label.trim().toLowerCase();
  // Raw node-kind strings the designer saves as default labels are
  // machinery vocabulary, not captions — every species spelling (v5
  // included: a caption that is just the record's kind derives from the
  // action kind below.
  const generic = new Set([
    'create', 'status', 'service', 'update', 'send', 'action',
    'cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove',
    'cts.read', 'cts.field', 'cts.command', 'cts.service', 'cts.conversion',
    actionKind?.toLowerCase?.()
  ].filter(Boolean));
  return generic.has(normalized);
}

function typeIdLabel(domain = {}, typeId = '') {
  if (!typeId) return '';
  return entityLabelOf(domain, typeId) || typeId.replace(/_/g, ' ');
}

export function normalizeActionAccess(access = {}) {
  const level = normalizeAccessLevel(access.level);
  const grants = Array.isArray(access.grants)
    ? access.grants
        .filter(grant => grant?.roleId)
        .map(grant => ({ ...grant, roleId: grant.roleId, level: normalizeAccessLevel(grant.level || level) }))
    : grantsFromRoleIds(Array.isArray(access.roleIds) ? access.roleIds : [], level);
  return {
    level: maxGrantLevel(grants, level),
    roleIds: [...new Set(grants.map(grant => grant.roleId))],
    grants,
    modified: Boolean(access.modified),
    scope: access.scope && typeof access.scope === 'object' && !Array.isArray(access.scope) ? { ...access.scope } : null,
    stateFrom: typeof access.stateFrom === 'string' ? access.stateFrom : '',
    stateTo: typeof access.stateTo === 'string' ? access.stateTo : ''
  };
}

export function requirementHasAuthoredGrant(required = null, permissions = {}) {
  if (!required?.feature) return true;
  const requiredLevel = normalizeAccessLevel(required.level || 'read');
  return (permissions[required.feature] || []).some(grant => {
    if (ACCESS_ORDER[normalizeAccessLevel(grant.level || 'read')] < ACCESS_ORDER[requiredLevel]) return false;
    if (grant.actions && required.actions && Object.entries(required.actions).some(([action, enabled]) => enabled === true && grant.actions[action] !== true)) return false;
    return true;
  });
}

function normalizeAccessLevel(level) {
  return ['read', 'write', 'admin'].includes(level) ? level : 'write';
}

export function validateAction(actionId, action = {}, { entities, commands, roles, domain, errors, stateDefinitions = {}, process = {}, lineageBindings = [] }) {
  const kind = action.actionKind || 'createEntity';
  const normalizedAccess = normalizeActionAccess(action.access);
  if (!['createEntity', 'updateEntity', 'archiveEntity', 'deleteEntity', 'runCommand', 'sendToOrganization', 'emitEvent'].includes(kind)) {
    errors.push(`Action ${actionId} uses unknown action kind ${kind}`);
    return;
  }
  if (kind === 'runCommand') {
    if (!action.commandId) errors.push(`Action ${actionId} must select a command`);
    if (action.commandId && !commands.has(action.commandId)) errors.push(`Action ${actionId} uses unknown command ${action.commandId}`);
  } else if (!['updateEntity', 'archiveEntity', 'deleteEntity', 'emitEvent'].includes(kind)) {
    if (!action.typeId) errors.push(`Action ${actionId} must select an entity type`);
    if (action.typeId && !entities.has(action.typeId)) errors.push(`Action ${actionId} uses unknown entity type ${action.typeId}`);
  }
  if (action.parentTypeId && !entities.has(action.parentTypeId)) {
    errors.push(`Action ${actionId} uses unknown parent entity type ${action.parentTypeId}`);
  }
  const hasTargetStatus = Boolean(action.state?.to || (action.stateRef && stateDefinitions[action.stateRef]));
  if (kind === 'createEntity') {
    validateConstruction(actionId, action, domain, errors);
    validateParentRevision(actionId, action, domain, errors, process, lineageBindings);
  }
  if (kind === 'updateEntity') {
    const typeId = action.inputs?.find(input => input.typeId)?.typeId || action.typeId || inferConnectedActionTypeId(actionId, process);
    if (!typeId) errors.push(`Action ${actionId} must receive an entity input`);
    if (typeId && !entities.has(typeId)) errors.push(`Action ${actionId} input uses unknown entity type ${typeId}`);
    const processRelationFields = new Set((action.mutation?.relationContracts || []).map(relation => `relations.${relation.key}`));
    const policyFields = (action.mutation?.fields || []).filter(field => !processRelationFields.has(field));
    validateFieldList(
      policyFields,
      domain,
      typeId,
      `action ${actionId} update fields`,
      errors,
      normalizedAccess.level
    );
    validateMutationGrantLevels(actionId, policyFields, domain, typeId, normalizedAccess.grants, errors);
    if (!(action.mutation?.fields || []).length && !hasTargetStatus) {
      errors.push(`Action ${actionId} must connect at least one writable field, relation, or status`);
    }
  }
  if (kind === 'archiveEntity' || kind === 'deleteEntity') {
    const typeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId || inferConnectedActionTypeId(actionId, process);
    if (!typeId) errors.push(`Action ${actionId} must receive an entity input`);
    if (typeId && !entities.has(typeId)) errors.push(`Action ${actionId} input uses unknown entity type ${typeId}`);
    if (kind === 'deleteEntity' && normalizedAccess.level !== 'admin') errors.push(`Action ${actionId} must use admin access for hard deletion`);
    if (kind === 'deleteEntity' && (action.trigger?.mode || 'manual') !== 'manual') errors.push(`Action ${actionId} hard deletion must be manual`);
  }
  const canInheritAccess = kind === 'runCommand' && action.inputs?.some(input => input.typeId);
  if ((!action.access && !canInheritAccess) || !Array.isArray(normalizedAccess.grants) || !['read', 'write', 'admin'].includes(normalizedAccess.level)) {
    errors.push(`Action ${actionId} must define access grants`);
  }
  if (kind === 'sendToOrganization') {
    validateFieldList(action.projection?.fields, domain, action.typeId, `action ${actionId} projection fields`, errors);
    validateFieldList(action.projection?.excludeFields, domain, action.typeId, `action ${actionId} excluded fields`, errors);
  }
  const triggerMode = action.trigger?.mode || 'manual';
  if (!['manual', 'event', 'schedule', 'date', 'entityChanged', 'domainEvent'].includes(triggerMode)) {
    errors.push(`Action ${actionId} uses unknown trigger mode ${triggerMode}`);
  }
  for (const roleId of normalizedAccess.roleIds) {
    if (!roles[roleId]) errors.push(`Action ${actionId} references missing access role ${roleId}`);
  }
  if (action.stateRef && !stateDefinitions[action.stateRef]) {
    errors.push(`Action ${actionId} references missing status definition ${action.stateRef}`);
  }
}

function validateParentRevision(actionId, action = {}, domain = {}, errors = [], process = {}, lineageBindings = []) {
  if (action.parentRevision?.enabled !== true) return;
  const graphContext = buildActionGraphContext(process);
  const parentTypeId = effectiveActionParentTypeId(action, graphContext.parentIncomingByActionId.get(actionId), lineageBindings);
  if (!parentTypeId) {
    errors.push(`Action ${actionId} cannot pin a revision without a declared containment parent`);
    return;
  }
  const contract = domain.revisions?.[parentTypeId];
  if (!contract?.scopes?.length) {
    errors.push(`Action ${actionId} cannot pin ${parentTypeId}; the entity has no revision contract`);
    return;
  }
  const scope = action.parentRevision.scope || contract.defaultScope;
  if (!contract.scopes.includes(scope)) {
    errors.push(`Action ${actionId} uses unknown ${parentTypeId} revision scope ${scope || '(empty)'}`);
  }
}

function inferConnectedActionTypeId(actionId, process = {}) {
  const actionNodeIds = new Set((process.graph?.nodes || [])
    .filter(node => {
      const refId = String(node.data?.refId || node.id);
      const processNode = node.type === 'processNode' ? process.processNodes?.[refId] : null;
      return (node.type === 'action' && refId === String(actionId))
        || (EFFECT_SPECIES_KINDS.has(String(processNode?.kind || '')) && String(processNode.entryTriggerId || processNode.id || refId) === String(actionId));
    })
    .map(node => String(node.id)));
  for (const edge of process.graph?.edges || []) {
    if (!actionNodeIds.has(String(edge.target)) || !isEntityTargetHandle(edge.targetHandle)) continue;
    const sourceNode = (process.graph?.nodes || []).find(node => String(node.id) === String(edge.source));
    const sourceRefId = String(sourceNode?.data?.refId || sourceNode?.id || '');
    const sourceRecord = sourceNode?.type === 'processNode' ? process.processNodes?.[sourceRefId] : null;
    const sourceActionId = sourceNode?.type === 'action'
      ? sourceRefId
      : EFFECT_SPECIES_KINDS.has(String(sourceRecord?.kind || '')) ? String(sourceRecord.id || sourceRefId) : '';
    const sourceAction = process.actions?.[sourceActionId];
    const sourceType = sourceAction && actionTypeId(sourceAction);
    if (sourceType) return sourceType;
  }
  return '';
}

// SPEC §7: machines are graph-derived — the draft's state nodes seed the
// vocabulary for every producer of their type (the same source
// compileWorkflows reads). The domain channel alone never carries an
// org-type machine (the projection emits none), so the capability gate
// reads both: a domain machine or a draft-seeded vocabulary satisfies it.
function processDeclaresStateVocabulary(process = {}, typeId = '') {
  if (!typeId) return false;
  const records = Object.values(process.ctsTypes || {});
  if (records.some(record => record?.kind === 'state' && record.value && record.typeId === typeId)) return true;
  // Unscoped tokens bind through their entry wires into this type's nodes
  // (the designer's connection rule compileWorkflows applies).
  const ctsByNode = new Map((process.graph?.nodes || []).map(node => [
    String(node.id),
    (process.ctsTypes || {})[String(node.data?.refId || node.id)]
  ]));
  const procByNode = new Map((process.graph?.nodes || []).map(node => [
    String(node.id),
    (process.processNodes || {})[String(node.data?.refId || node.id)]
  ]));
  return (process.graph?.edges || []).some(edge => {
    const state = ctsByNode.get(String(edge.source));
    if (!state || state.kind !== 'state' || !state.value || state.typeId) return false;
    const target = procByNode.get(String(edge.target));
    return (target?.typeId || target?.targetTypeId || '') === typeId;
  });
}

export function validateEffectCapabilities(process = {}, domain = {}, capabilities = {}, errors = []) {
  for (const [nodeId, node] of Object.entries(process.processNodes || {})) {
    if (!node.typeId) continue;
    const capability = requiredEffectCapability(node.kind, node);
    if (!capability) continue;
    if (capability === 'statusMutation') {
      if (!domain.workflows?.[node.typeId] && !processDeclaresStateVocabulary(process, node.typeId)) {
        errors.push(`Process node ${nodeId} cannot change ${node.typeId}: entity has no status workflow`);
      }
      continue;
    }
    const record = capabilities[node.typeId];
    if (capability === 'create') {
      const construction = normalizeConstruction(node.construction, node.typeId, domain);
      const mode = construction?.mode || '';
      if (!record || !(Array.isArray(record.createModes) ? record.createModes : []).includes(mode)) {
        errors.push(`Process node ${nodeId} cannot create ${node.typeId} with construction mode ${mode || '(none)'}: no registered runtime handler`);
      }
      continue;
    }
    if (!record || record[capability] !== true) {
      const verb = capability === 'delete' ? 'delete' : capability === 'archive' ? 'archive' : 'update';
      errors.push(`Process node ${nodeId} cannot ${verb} ${node.typeId}: entity service lacks ${capability} support`);
    }
  }
}

export function validateProcessNode(nodeId, node = {}, { entities, domain, errors, partyTypes }) {
  const kind = node.kind || '';
  if (kind.includes('.')) {
    validateDataflowProcessNode(nodeId, node, { entities, domain, errors, partyTypes });
    return;
  }
  const kinds = [
    'entityQuery', 'entityRef', 'entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityCompose', 'entityModify',
    'blockRead', 'blockCompose', 'blockModify',
    'cast', 'fallback', 'stringOp', 'compare', 'logic', 'entityCondition', 'predicateLogic', 'listLength'
  ];
  if (!kinds.includes(kind)) {
    errors.push(`Process node ${nodeId} uses unknown node kind ${kind}`);
    return;
  }
  for (const key of ['typeId', 'relationTypeId']) {
    if (node[key] && !entities.has(node[key])) {
      errors.push(`Process node ${nodeId} uses unknown ${key} ${node[key]}`);
    }
  }
  if ([
    'entityQuery', 'entityRef', 'entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityCompose', 'entityModify', 'entityCondition', 'predicateLogic',
    'blockRead', 'blockCompose', 'blockModify'
  ].includes(kind) && !node.typeId) {
    errors.push(`Process node ${nodeId} must select an entity type`);
  }
  if (['entityModify', 'blockRead', 'blockCompose', 'blockModify'].includes(kind) && !node.block) {
    errors.push(`Process node ${nodeId} must select a canonical block`);
  }
  if (node.block && ['entityModify', 'blockRead', 'blockCompose', 'blockModify'].includes(kind)
    && !entityBlocks(domain, node.typeId).includes(node.block)) {
    errors.push(`Process node ${nodeId} uses block ${node.block} outside ${node.typeId}`);
  }
  if (kind === 'entityRef' && node.mode === 'related') {
    const relation = (domain.relations || []).find(item => item.ownerType === node.typeId && item.key === node.relationKey);
    if (!relation) errors.push(`Process node ${nodeId} must select a declared relation for ${node.typeId}`);
    if (relation && node.relationTypeId && node.relationTypeId !== relation.targetType) {
      errors.push(`Process node ${nodeId} relation ${node.relationKey} must target ${relation.targetType}`);
    }
  }
  if (['entityField', 'blockRead', 'blockCompose', 'blockModify'].includes(kind) && !node.path) errors.push(`Process node ${nodeId} must define a field path`);
  if (node.path && ['entityField', 'blockRead'].includes(kind)) {
    validateFieldList([node.path], domain, node.typeId, `process node ${nodeId} field`, errors, 'read');
  }
  if (node.path && ['blockCompose', 'blockModify'].includes(kind)) {
    validateFieldList([node.path], domain, node.typeId, `process node ${nodeId} field`, errors, 'write');
  }
  if (['stringOp', 'compare', 'logic', 'entityCondition', 'predicateLogic', 'entitySelect'].includes(kind) && !node.operation) {
    errors.push(`Process node ${nodeId} must define an operation`);
  }
  const operations = {
    stringOp: ['concat', 'template', 'replace', 'lower', 'upper', 'trim'],
    compare: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'],
    logic: ['and', 'or', 'xor', 'not'],
    entityCondition: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'],
    predicateLogic: ['and', 'or', 'xor', 'not'],
    entitySelect: ['first', 'last', 'index']
  };
  if (operations[kind] && !operations[kind].includes(node.operation)) {
    errors.push(`Process node ${nodeId} uses unknown ${kind} operation ${node.operation || '(empty)'}`);
  }
  if (kind === 'entityCondition') {
    const allowed = {
      string: ['eq', 'neq', 'contains', 'exists'],
      number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists'],
      date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists'],
      boolean: ['eq', 'neq', 'exists'],
      json: ['exists']
    }[node.valueType] || [];
    if (node.operation && !allowed.includes(node.operation)) {
      errors.push(`Process node ${nodeId} cannot use ${node.operation} with ${node.valueType || 'unknown'} fields`);
    }
  }
  if (kind === 'stringOp' && node.operation === 'template' && !String(node.template || '').includes('{value}')) {
    errors.push(`Process node ${nodeId} template must contain {value}`);
  }
  if (!PROCESS_STRUCTURES.includes(node.structure || 'item')) errors.push(`Process node ${nodeId} uses unknown structure ${node.structure}`);
  if (['cast', 'fallback', 'entityField', 'blockRead', 'blockCompose', 'blockModify', 'compare', 'entityCondition'].includes(kind)
    && !PROCESS_SCALAR_KINDS.includes(node.valueType)) {
    errors.push(`Process node ${nodeId} uses unknown value type ${node.valueType || '(empty)'}`);
  }
  if (kind === 'entityCondition' && !node.path) errors.push(`Process node ${nodeId} must select a field`);
  if (kind === 'entityCondition' && node.path) {
    validateFieldList([node.path], domain, node.typeId, `process node ${nodeId} field`, errors, 'read');
  }
}

function validateDataflowProcessNode(nodeId, node, { entities, domain, errors, partyTypes }) {
  const definition = getProcessNodeDefinition(node.kind);
  if (!definition) {
    errors.push(`Process node ${nodeId} uses unknown node kind ${node.kind}`);
    return;
  }
  const classification = effectKindOf(node);
  if (node.typeId && !entities.has(node.typeId)) {
    errors.push(`Process node ${nodeId} uses unknown typeId ${node.typeId}`);
  }
  // Party types are readable principals (SPEC §13): no effect species may
  // construct, mutate, transition, or remove them — the party services own
  // every mutation path.
  if (['cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove'].includes(node.kind)
    && partyTypes?.has(node.typeId)) {
    errors.push(`Process node ${nodeId} cannot target party type ${node.typeId} — parties are read-only in processes`);
  }
  if (processNodeRequiresTypeId(node.kind) && !node.typeId) {
    errors.push(`Process node ${nodeId} must select an entity type`);
  }
  if (node.kind === 'cts.field') {
    const fieldPath = String(node.path || '');
    if (!fieldPath) errors.push(`Process node ${nodeId} must select a field`);
    if (fieldPath && node.typeId && !entityFieldSchema(domain, node.typeId, fieldPath)) {
      errors.push(`Process node ${nodeId} uses undeclared field ${fieldPath}`);
    }
  }
  if (['cts.construct', 'cts.mutate'].includes(classification)) {
    // A species mutate carries no blocks envelope: its leaves are wired or
    // defaulted field sockets, and required-input availability owns the
    // "at least one input" rule at activation.
    if (classification === 'cts.construct') {
      const construction = normalizeConstruction(node.construction, node.typeId, domain);
      const contract = constructionContract(domain, node.typeId);
      if (!contract || !construction) {
        errors.push(`Process node ${nodeId} cannot create ${node.typeId}: entity has no construction contract`);
      } else {
        if (!contract.modes.includes(construction.mode)) {
          errors.push(`Process node ${nodeId} cannot create ${node.typeId} with construction mode ${construction.mode}`);
        }
        if (contract.derived && construction.mode === 'genericCreate') {
          errors.push(`Process node ${nodeId} must use a typed construction mode for derived entity ${node.typeId}`);
        }
      }
    }
    const allowedBlocks = new Set(entityFieldSchemas(domain, node.typeId)
      .filter(field => classification === 'cts.construct'
        ? field.constructible !== false
        : field.writable !== false)
      .map(field => field.block));
    if (classification === 'cts.construct') {
      for (const block of entityBlocks(domain, node.typeId)) {
        if (domain.blockComposition?.[block] && !['origin', 'status', 'provenance', 'summary'].includes(block)) {
          allowedBlocks.add(block);
        }
      }
    }
    for (const block of node.blocks || []) {
      if (!allowedBlocks.has(block) || ['origin', 'status', 'provenance', 'summary'].includes(block)) {
        errors.push(`Process node ${nodeId} cannot persist block ${block}`);
      }
    }
  }
  if (isEffectRecord(node) && !['manual', 'event', 'schedule'].includes(node.trigger?.mode || 'manual')) {
    errors.push(`Process node ${nodeId} uses unknown trigger mode ${node.trigger?.mode}`);
  }
  if (node.type) {
    try {
      normalizeProcessType(sanitizeProcessType(node.type));
    } catch (error) {
      errors.push(`Process node ${nodeId} has invalid type: ${error.message}`);
    }
  }
  if (node.kind === 'cts.read' && node.select === 'related') {
    const relation = (domain.relations || []).find(item => item.ownerType === node.typeId && item.key === (node.relationKey || node.relation));
    if (!relation) errors.push(`Process node ${nodeId} must select a declared relation for ${node.typeId}`);
  }
  if (classification === 'cts.command' && (!node.commandId || !domain.commands?.[node.commandId])) {
    errors.push(`Process node ${nodeId} must select a registered command`);
  }
  try {
    resolveCatalogNodePorts(node, {
      fieldSchema: entityFieldSchema(domain, node.typeId, node.path),
      fieldSchemas: entityFieldSchemas(domain, node.typeId),
      blockComposition: domain.blockComposition?.[node.block] || null,
      command: domain.commands?.[node.commandId] || null
    });
  } catch (error) {
    errors.push(`Process node ${nodeId} has invalid sockets: ${error.message}`);
  }
}

// Edge diagnostics are structured records so the designer can focus the exact
// graph element; `errors` strings are derived from `message` at the assembly
// boundary.
export function validateDataflowEdges(process, domain) {
  const errors = [];
  const push = (message, anchors = {}) => errors.push({ message, ...anchors });
  const entityEdgesByTarget = new Map();
  const graphNodes = new Map((process.graph?.nodes || []).map(node => [String(node.id), node]));
  for (const edge of process.graph?.edges || []) {
    const sourceNode = graphNodes.get(String(edge.source));
    const targetNode = graphNodes.get(String(edge.target));
    const sourceRecord = process.processNodes?.[String(sourceNode?.data?.refId || sourceNode?.id || '')];
    const targetRecord = process.processNodes?.[String(targetNode?.data?.refId || targetNode?.id || '')];
    if (!sourceRecord || !targetRecord) continue;
    const sourcePorts = resolveCatalogNodePorts(sourceRecord, catalogContext(domain, sourceRecord)).outputs;
    const targetPorts = resolveCatalogNodePorts(targetRecord, catalogContext(domain, targetRecord)).inputs;
    const sourcePort = catalogPortForHandle(sourcePorts, edge.sourceHandle);
    const targetPort = catalogPortForHandle(targetPorts, edge.targetHandle);
    if (!sourcePort) {
      push(`Edge ${edge.id} references missing output ${edge.sourceHandle} on ${sourceRecord.id}`,
        { edgeId: edge.id, nodeId: String(edge.target), socketId: String(edge.sourceHandle || '') });
      continue;
    }
    if (!targetPort) {
      push(`Edge ${edge.id} references missing input ${edge.targetHandle} on ${targetRecord.id}`,
        { edgeId: edge.id, nodeId: String(edge.target), socketId: String(edge.targetHandle || '') });
      continue;
    }
    const edgeSourceTypeId = sourcePort.type?.typeId || sourcePort.type?.itemType?.typeId || '';
    const edgeSourceProducerId = edgeSourceTypeId
      ? resolveSourceProducerOutputId(process, sourceRecord, sourcePort)
      : null;
    const producerLabel = edgeSourceProducerId ? ` from producer output ${edgeSourceProducerId}` : '';
    const compatibility = processSocketsCompatible(sourcePort, targetPort);
    if (!compatibility.ok) {
      push(`Edge ${edge.id}${producerLabel} is incompatible: ${compatibility.reason}`, {
        edgeId: edge.id,
        nodeId: String(edge.target),
        socketId: targetPort.id,
        ...(edgeSourceProducerId ? { producerOutputId: edgeSourceProducerId } : {})
      });
    }
    if (compatibility.ok
      && sourceRecord.kind === 'cts.compose'
      && ['cts.construct', 'cts.mutate'].includes(targetRecord.kind)) {
      const requiredAccess = targetRecord.kind === 'cts.construct' ? 'constructible' : 'writable';
      const targetBlocks = new Set(entityBlocks(domain, targetRecord.typeId));
      const sourcePaths = sourceRecord.compositionMode
        ? (sourceRecord.entries || []).map(entry => `${sourceRecord.block}.${entry.key}`).filter(path => !path.endsWith('.undefined'))
        : (sourceRecord.fields || []);
      for (const path of sourcePaths) {
        const targetSchemas = entityFieldSchemas(domain, targetRecord.typeId)
          .filter(field => field.block === sourceRecord.block);
        const targetSchema = entityFieldSchema(domain, targetRecord.typeId, path);
        const openBlockAccepted = targetRecord.kind === 'cts.construct'
          && Boolean(sourceRecord.compositionMode)
          && targetBlocks.has(sourceRecord.block)
          && !['origin', 'status', 'provenance', 'summary'].includes(sourceRecord.block);
        const openRelationsAccepted = sourceRecord.compositionMode === 'relations'
          && targetSchemas.some(field => field[requiredAccess] !== false);
        const wholeBlockAccepted = path === sourceRecord.block
          && targetSchemas.some(field => field[requiredAccess] !== false);
        if (!openBlockAccepted && !openRelationsAccepted && !wholeBlockAccepted && (!targetSchema || targetSchema[requiredAccess] === false)) {
          push(`Edge ${edge.id} cannot send ${path} to ${targetRecord.typeId}: field is not ${requiredAccess}`,
            { edgeId: edge.id, nodeId: String(edge.target), socketId: targetPort.id });
        }
        if (sourceRecord.compositionMode && sourceRecord.compositionMode !== 'relations' && targetSchema) {
          const key = path.slice(sourceRecord.block.length + 1);
          const entry = (sourceRecord.entries || []).find(item => item.key === key);
          const sourceType = openCompositionEntryType(entry, sourceRecord.compositionMode, sourceRecord.compositionValueBase);
          if (sourceType && !processTypesEquivalent(sourceType, targetSchema.type)) {
            push(`Edge ${edge.id} cannot send ${path} to ${targetRecord.typeId}: composed entry type does not match the entity field`,
              { edgeId: edge.id, nodeId: String(edge.target), socketId: targetPort.id });
          }
        }
      }
    }
    if (compatibility.ok) {
      const portTypeId = sourcePort.type?.typeId || sourcePort.type?.itemType?.typeId || '';
      const portEntityStream = ['entity', 'entityRef'].includes(sourcePort.type?.base)
        || (sourcePort.type?.base === 'array' && ['entity', 'entityRef'].includes(sourcePort.type?.itemType?.base));
      if (portEntityStream && portTypeId) {
        const producerOutputId = resolveSourceProducerOutputId(process, sourceRecord, sourcePort);
        if (producerOutputId) {
          entityEdgesByTarget.set(targetRecord.id, [
            ...(entityEdgesByTarget.get(targetRecord.id) || []),
            { edgeId: edge.id, socketId: targetPort.id, producerOutputId, typeId: portTypeId }
          ]);
        }
      }
    }
  }
  errors.push(...validateProducerJoinAndConvergence(process, domain, entityEdgesByTarget));
  for (const role of ['data', 'control']) {
    const cycle = findGraphCycle(process, role);
    if (cycle.length) push(`${role === 'data' ? 'Data' : 'Control'} graph contains a cycle: ${cycle.join(' → ')}`);
  }
  for (const record of Object.values(process.processNodes || {})) {
    if (!isEffectRecord(record) || !record.trigger?.schedule) continue;
    const { at, interval } = record.trigger.schedule;
    if (at && Number.isNaN(new Date(at).getTime())) {
      push(`Action ${record.id || 'effect'} schedule.at is not a valid date-time`);
    }
    if (interval && !(durationMs(interval) > 0)) {
      push(`Action ${record.id || 'effect'} schedule.interval is not a valid duration`);
    }
    if (!at && !interval) {
      push(`Action ${record.id || 'effect'} schedule declares neither at nor interval`);
    }
  }
  const triggers = (process.graph?.nodes || []).filter(node => {
    const record = process.processNodes?.[String(node.data?.refId || node.id)];
    // Entry points: manual, scheduled, and event-subscribed species
    // effects are reachability roots.
    const mode = record?.trigger?.mode || 'manual';
    return record?.kind?.endsWith('Trigger')
      || (isEffectRecord(record || {}) && (mode === 'manual' || mode === 'schedule' || (mode === 'event' && record.eventId)));
  });
  const reachable = reachableControlNodes(process, triggers.map(node => String(node.id)));
  for (const node of process.graph?.nodes || []) {
    const record = process.processNodes?.[String(node.data?.refId || node.id)];
    if ((isEffectRecord(record || {}) || record?.kind?.startsWith('control.'))
      && !record.kind.endsWith('Trigger') && !reachable.has(String(node.id))) {
      push(`Operational node ${record.id || node.id} is not reachable from a trigger`, { nodeId: String(node.id) });
    }
  }
  return errors;
}

// Same-type producer paths may converge only through an explicit
// `producer.join` whose configuration selects the surviving producer output.
// Every other consumer receiving entity streams from two distinct producer
// outputs of the same entity type is an implicit workflow convergence and is
// rejected with the responsible node, producer outputs, and edges named.
function validateProducerJoinAndConvergence(process, domain, entityEdgesByTarget) {
  const errors = [];
  const push = (message, anchors = {}) => errors.push({ message, ...anchors });
  const recordsById = new Map(Object.entries(process.processNodes || {})
    .map(([id, record]) => [record.id || id, record]));
  const graphIdFor = new Map((process.graph?.nodes || []).map(node => [
    String(node.data?.refId || node.id),
    String(node.id)
  ]));
  for (const [targetId, entries] of entityEdgesByTarget) {
    const record = recordsById.get(targetId);
    if (!record) continue;
    const nodeId = graphIdFor.get(targetId) || targetId;

    const byType = new Map();
    for (const entry of entries) {
      let producers = byType.get(entry.typeId);
      if (!producers) {
        producers = new Map();
        byType.set(entry.typeId, producers);
      }
      producers.set(entry.producerOutputId, entry);
    }
    for (const [typeId, producers] of byType) {
      if (producers.size < 2) continue;
      const [first, second] = [...producers.values()];
      push(
        `${record.kind} node ${record.id || targetId} implicitly converges ${typeId} producer outputs `
        + `${first.producerOutputId} (edge ${first.edgeId}) and ${second.producerOutputId} (edge ${second.edgeId}); `
        + `use an explicit producer join`,
        { nodeId, edgeId: first.edgeId, socketId: first.socketId, producerOutputId: first.producerOutputId }
      );
    }
  }
  return errors;
}

export function catalogContext(domain, record) {
  const fieldPath = record.path || '';
  return {
    // The projected domain rides on the context: the species port
    // projections read construction contracts and service signatures from
    // it (`cts.service` has no persisted fallback), exactly as the runtime
    // catalog contexts do.
    domain,
    fieldSchema: entityFieldSchema(domain, record.typeId, fieldPath),
    fieldSchemas: entityFieldSchemas(domain, record.typeId),
    blockComposition: domain.blockComposition?.[record.block] || null,
    command: domain.commands?.[record.commandId] || null
  };
}

function openCompositionEntryType(entry = {}, mode = '', valueBase = 'json') {
  if (!entry) return null;
  if (mode === 'ancestors' || mode === 'relations') {
    if (entry.type?.base) return processType(entry.type.base, entry.type);
    return processType('entityRef', { typeId: entry.typeId });
  }
  if (mode === 'attachments') {
    return processType('attachmentRef', { attachmentKind: entry.attachmentKind });
  }
  return processType(entry.type?.base || valueBase, entry.type || {});
}

function processTypesEquivalent(left = {}, right = {}) {
  if (left.base !== right.base) return false;
  for (const qualifier of ['typeId', 'attachmentKind', 'enumId', 'unit']) {
    if ((left[qualifier] || '') !== (right[qualifier] || '')) return false;
  }
  if (left.base === 'array') return processTypesEquivalent(left.itemType || {}, right.itemType || {});
  return true;
}

export function catalogPortForHandle(ports, handle) {
  const clean = String(handle || '').replace(/^(input|output|data|control|success|failure):/, '');
  return ports.find(port => port.id === clean)
    || ((!clean || ['input', 'output'].includes(clean)) && ports.length === 1 ? ports[0] : null);
}

function findGraphCycle(process, role) {
  const adjacency = new Map();
  for (const edge of process.graph?.edges || []) {
    const edgeRole = edge.role || (String(edge.sourceHandle || '').startsWith('control:') ? 'control' : 'data');
    if (edgeRole !== role) continue;
    const list = adjacency.get(String(edge.source)) || [];
    list.push(String(edge.target));
    adjacency.set(String(edge.source), list);
  }
  const visiting = new Set();
  const visited = new Set();
  const path = [];
  function visit(node) {
    if (visiting.has(node)) return [...path.slice(path.indexOf(node)), node];
    if (visited.has(node)) return [];
    visiting.add(node);
    path.push(node);
    for (const target of adjacency.get(node) || []) {
      const cycle = visit(target);
      if (cycle.length) return cycle;
    }
    path.pop();
    visiting.delete(node);
    visited.add(node);
    return [];
  }
  for (const node of adjacency.keys()) {
    const cycle = visit(node);
    if (cycle.length) return cycle;
  }
  return [];
}

function reachableControlNodes(process, starts) {
  const reached = new Set(starts);
  const pending = [...starts];
  while (pending.length) {
    const source = pending.shift();
    for (const edge of process.graph?.edges || []) {
      const role = edge.role || (String(edge.sourceHandle || '').startsWith('control:') ? 'control' : 'data');
      if (role !== 'control' || String(edge.source) !== source || reached.has(String(edge.target))) continue;
      reached.add(String(edge.target));
      pending.push(String(edge.target));
    }
  }
  return reached;
}

export function validateProcessNodeConnections(process = {}, errors = [], domain = {}) {
  for (const graphNode of process.graph?.nodes || []) {
    if (graphNode.type !== 'processNode') continue;
    const nodeId = String(graphNode.data?.refId || graphNode.id || '');
    const record = process.processNodes?.[nodeId];
    if (!record) continue;
    const contract = record.kind?.includes('.')
      ? resolveCatalogNodePorts(record, catalogContext(domain, record))
      : resolveProcessNodePorts(record);
    const counts = new Map();
    for (const edge of (process.graph?.edges || []).filter(item => String(item.target) === String(graphNode.id))) {
      const handle = String(edge.targetHandle || '').replace(/^(input|data|control):/, '');
      const inputId = (!handle || handle === 'input') && contract.inputs.length === 1
        ? contract.inputs[0].id
        : handle;
      if (!inputId) continue;
      counts.set(inputId, (counts.get(inputId) || 0) + 1);
    }
    for (const input of contract.inputs) {
      if ((counts.get(input.id) || 0) > 1 && !input.multiple) errors.push(`Process node ${nodeId} input ${input.id} has more than one connected value`);
    }
  }
}

export function entityFieldSchemas(domain = {}, typeId = '') {
  const key = String(typeId || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  return domain.fieldSchemas?.[key] || domain.fieldSchemas?.[camel] || [];
}

export function entityFieldSchema(domain, typeId, path) {
  return entityFieldSchemas(domain, typeId).find(field => field.path === path) || null;
}

function blockFieldSchemas(domain = {}, block = '') {
  if (block) return domain.blockSchemas?.[block] || [];
  return Object.values(domain.blockSchemas || {}).flat();
}

function blockFieldSchema(domain, path) {
  return blockFieldSchemas(domain, String(path || '').split('.')[0])
    .find(field => field.path === path) || null;
}

export function structuralFieldSchema(domain, path) {
  return blockFieldSchema(domain, path)
    || blockFieldSchema(domain, String(path || '').split('.')[0]);
}

function processNodeRequiresTypeId(kind = '') {
  if (kind === 'record.construct') return false;
  return ['cts.construct', 'cts.read'].includes(kind);
}

function validateConstruction(actionId, action = {}, domain = {}, errors = []) {
  const typeId = action.typeId || '';
  const contract = constructionContract(domain, typeId);
  const construction = normalizeConstruction(action.construction, typeId, domain);
  if (!contract || !construction) {
    errors.push(`Action ${actionId} cannot create ${typeId}: entity has no construction contract`);
    return;
  }
  if (!contract.modes.includes(construction.mode)) {
    errors.push(`Action ${actionId} cannot create ${typeId} with construction mode ${construction.mode}`);
  }
  if (contract.derived && construction.mode === 'genericCreate') {
    errors.push(`Action ${actionId} must use a typed construction mode for derived entity ${typeId}`);
  }
  if (construction.blockComposed && construction.mode === 'genericCreate') return;
}

function constructionContract(domain = {}, typeId = '') {
  return domain.construction?.[typeId] || null;
}

export function validateFieldList(fields = [], domain = {}, typeId, label, errors, access = 'read') {
  if (!Array.isArray(fields)) return;
  if (access === 'construct') {
    const schemas = entityFieldSchemas(domain, typeId);
    for (const field of fields) {
      const schema = schemas.find(item => item.path === field);
      if (!schema || schema.constructible === false) {
        errors.push(`${label} contains non-constructible field: ${field}`);
      }
    }
    return;
  }
  const policy = getFieldPolicy(domain.fieldAccess || {}, typeId);
  if (!policy) {
    if (fields.length) errors.push(`${label} cannot be checked because ${typeId} has no field-access policy`);
    return;
  }
  const allowed = access === 'admin'
    ? [...(policy.write || []), ...(policy.admin || [])]
    : access === 'write'
      ? [...(policy.write || [])]
      : [...(policy.read || [])];
  for (const field of fields) {
    if (!fieldPathAllowed(field, allowed)) errors.push(`${label} contains field outside base policy: ${field}`);
  }
}

function validateMutationGrantLevels(actionId, fields = [], domain = {}, typeId = '', grants = [], errors = []) {
  const policy = getFieldPolicy(domain.fieldAccess || {}, typeId);
  if (!policy || !Array.isArray(fields)) return;
  const adminOnly = fields.filter(field => (
    !fieldPathAllowed(field, policy.write || []) && fieldPathAllowed(field, policy.admin || [])
  ));
  if (!adminOnly.length) return;
  for (const grant of grants || []) {
    if (grant.level === 'admin') continue;
    errors.push(`Action ${actionId} grants ${grant.roleId} ${grant.level} access to admin-only field ${adminOnly[0]}`);
  }
}

function fieldPathAllowed(path, allowed = []) {
  if (!path || typeof path !== 'string') return false;
  return allowed.some(pattern => pattern === path || (pattern.endsWith('.*') && (path === pattern.slice(0, -2) || path.startsWith(pattern.slice(0, -1)))));
}

function getByPath(source, path) {
  return String(path).split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

export function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
