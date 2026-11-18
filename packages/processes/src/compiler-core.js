import { operationKindOf } from '@perigram/cts';
import { normalizeWorkflow, resolveWorkflowStatePath } from '@perigram/core';
import { HOME_SCREEN_ROUTE } from './screen-contract.js';
import {
  PROCESS_SCALAR_KINDS,
  PROCESS_DATAFLOW_VERSION,
  PROCESS_STRUCTURES,
  inferProcessDataflowContracts,
  resolveProcessNodePorts,
  validateProcessEdges
} from './ports.js';
import { CONSUMER_SPECIES_KINDS, EFFECT_SPECIES_KINDS, getFieldPolicy, getProcessNodeDefinition, resolveCatalogNodePorts } from './node-catalog.js';
import { normalizeStateFieldPolicy } from './designer.js';
import { normalizeDesignerAccess } from './authoring.js';
import { projectUiAction, projectUiContractChannels } from './ui-contract-projection.js';
import { normalizeProcessType, sanitizeProcessType, processSocketsCompatible, processType } from './types.js';
import { createDataTree, isDataTree } from './data-tree.js';
import { normalizeHandle, lineageKeyForTypeId, mergedHierarchyBindings } from './hierarchy-utils.js';
import { actionTargetState, displayActionLabel } from './action-labels.js';
import {
  constructionContract,
  normalizeConstruction,
  resolveParentRevision,
  compiledInputPolicy
} from './construction-compilation.js';
export {
  constructionContract,
  normalizeConstruction,
  resolveParentRevision,
  normalizeActionInputPolicy,
  compiledInputPolicy
} from './construction-compilation.js';

export { actionTargetState, displayActionLabel } from './action-labels.js';
export { entityLabelOf } from './action-labels.js';


/**
 * Normalization for the existing process-definition storage envelope.
 * Kept here as part of process definition semantics; graph structure and
 * execution are owned by the canonical graph document in @perigram/core.
 */
export function normalizeGraph(graph = {}, { includeRefId = false } = {}) {
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map(node => {
      const refId = String(node.data?.refId || node.id || '');
      return {
        id: String(node.id || refId),
        type: node.type || 'default',
        position: { x: Number(node.position?.x || 0), y: Number(node.position?.y || 0) },
        data: { ...(node.data && typeof node.data === 'object' ? node.data : {}), ...(includeRefId ? { refId } : {}) }
      };
    }) : [],
    edges: Array.isArray(graph.edges) ? graph.edges.map(edge => {
      const sourceHandle = edge.sourceHandle || inferStoredEdgeHandle(edge, 'source');
      const targetHandle = edge.targetHandle || inferStoredEdgeHandle(edge, 'target');
      return {
        id: String(edge.id || `${edge.source || ''}-${edge.target || ''}`),
        source: String(edge.source || ''),
        target: String(edge.target || ''),
        sourceHandle,
        targetHandle,
        type: edge.type || 'default',
        ...(edge.role ? { role: edge.role } : {}),
        ...(edge.label ? { label: edge.label } : {}),
        data: edge.data && typeof edge.data === 'object' ? edge.data : {}
      };
    }) : [],
    viewport: { x: Number(graph.viewport?.x || 0), y: Number(graph.viewport?.y || 0), zoom: Number(graph.viewport?.zoom || 1) }
  };
}

function inferStoredEdgeHandle(edge = {}, side = 'source') {
  const dataKey = side === 'source' ? 'sourceHandle' : 'targetHandle';
  if (edge.data?.[dataKey]) return edge.data[dataKey];
  const id = String(edge.id || '');
  const pattern = side === 'source'
    ? /(?:^|[-])((?:output)(?::[A-Za-z0-9_.:]+)?)(?=[-]|$)/
    : /(?:^|[-])((?:input|data)(?::[A-Za-z0-9_.:]+)?)(?=[-]|$)/;
  return id.match(pattern)?.[1] || null;
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
  if (!inputs.some(input => input.id === 'entity')) inputs.unshift({ id: 'entity', kind: 'entity', typeId, required: false });
  if (!inputs.some(input => input.id === 'state')) inputs.push({
    id: 'state', kind: 'state', stateRef: action.stateRef || null,
    state: action.state?.to || action.access?.stateTo || '', required: false
  });
  return {
    ...action, actionKind: 'updateEntity', typeId, inputs,
    mutation: action.mutation || { fields: [] },
    access: { ...(action.access || {}), stateFrom: action.access?.stateFrom || action.state?.from || '', stateTo: action.access?.stateTo || action.state?.to || '' }
  };
}

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

export function replacePlaceholders(value, bindings, incomplete) {
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

export function parentRelationForChild(childTypeId = '', parentTypeId = '', lineageBindings = []) {
  const binding = lineageBindings.find(binding =>
    binding.childTypeId === childTypeId
    && (!parentTypeId || binding.parentTypeId === parentTypeId)
    && binding.lineageKey
  );
  if (!binding) return null;
  return { childType: binding.childTypeId, parentType: binding.parentTypeId, lineageKey: binding.lineageKey };
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

export function catalogPortForHandle(ports, handle) {
  const clean = String(handle || '').replace(/^(input|output|data|control|success|failure):/, '');
  return ports.find(port => port.id === clean)
    || ((!clean || ['input', 'output'].includes(clean)) && ports.length === 1 ? ports[0] : null);
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


export function getByPath(source, path) {
  return String(path).split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

export function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
