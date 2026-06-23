import { normalizeWorkflow } from '../../workflows/src/index.js';
import {
  generatedScreenRoute,
  normalizeScreenContract,
  validateScreenContract
} from './screen-contract.js';

export const PROCESS_SCHEMA_VERSION = 1;
const ACCESS_ORDER = { none: 0, read: 1, write: 2, admin: 3 };

export {
  canvasToDefinition,
  definitionToCanvas,
  hasCanonicalProcessSource,
  validateCanvasSemantics,
  validateRoundTrip
} from './transpiler.js';

export {
  PROCESS_TEMPLATES,
  createProcessFromTemplate,
  getProcessTemplate,
  legacyTypeToTemplateId
} from './templates.js';

export function createDefaultCreatedWorkflow(label = 'Lifecycle') {
  return normalizeWorkflow({
    schemaVersion: 2,
    primaryRegion: 'main',
    regions: {
      main: {
        label,
        initial: 'CREATED',
        states: { CREATED: { canUpdateMeta: true } },
        transitions: []
      }
    }
  });
}

export function normalizeProcessDefinition(definition = {}) {
  const data = definition.data || definition;
  return {
    schemaVersion: data.schemaVersion || PROCESS_SCHEMA_VERSION,
    sourceTemplateId: data.sourceTemplateId || null,
    sourceProcessDefinitionId: data.sourceProcessDefinitionId || null,
    graph: normalizeGraph(data.graph),
    roles: normalizeRecord(data.roles),
    servicePrincipals: normalizeRecord(data.servicePrincipals),
    entityProfiles: normalizeRecord(data.entityProfiles),
    actions: normalizeRecord(data.actions),
    services: normalizeRecord(data.services),
    sockets: normalizeRecord(data.sockets),
    statusDefinitions: normalizeRecord(data.statusDefinitions),
    valueInputs: normalizeRecord(data.valueInputs),
    screens: normalizeRecord(data.screens),
    assignments: normalizeRecord(data.assignments),
    compiled: data.compiled || null
  };
}

export function validateProcessDefinition(definition = {}, domain = {}) {
  const process = normalizeProcessDefinition(definition);
  const errors = [];
  const warnings = [];
  const nodeIds = new Set(process.graph.nodes.map(node => node.id));
  const entities = new Set((domain.entities || []).map(entity => entity.type));
  const commands = new Set(Object.keys(domain.commands || {}));

  for (const edge of process.graph.edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Edge ${edge.id} references missing source node ${edge.source}`);
    if (!nodeIds.has(edge.target)) errors.push(`Edge ${edge.id} references missing target node ${edge.target}`);
  }

  for (const node of process.graph.nodes) {
    const refId = node.data?.refId;
    if (!refId) continue;
    if (node.type === 'role' && !process.roles[refId]) errors.push(`Role node ${node.id} references missing role ${refId}`);
    if (node.type === 'entity' && !process.entityProfiles[refId]) errors.push(`Entity node ${node.id} references missing entity profile ${refId}`);
    if (node.type === 'action' && !process.actions[refId]) errors.push(`Action node ${node.id} references missing action ${refId}`);
    if (node.type === 'service' && !process.services[refId]) errors.push(`Service node ${node.id} references missing service ${refId}`);
    if (node.type === 'socket' && !process.sockets[refId]) errors.push(`Socket node ${node.id} references missing socket ${refId}`);
    if (node.type === 'statusDefinition' && !process.statusDefinitions[refId]) errors.push(`Status node ${node.id} references missing status definition ${refId}`);
    if (node.type === 'valueInput' && !process.valueInputs[refId]) errors.push(`Value node ${node.id} references missing value input ${refId}`);
    if (node.type === 'user' && !process.assignments[refId]) errors.push(`User node ${node.id} references missing assignment ${refId}`);
  }

  for (const [profileId, profile] of Object.entries(process.entityProfiles)) {
    if (!entities.has(profile.entityType)) errors.push(`Entity profile ${profileId} uses unknown entity type ${profile.entityType}`);
    validateFieldList(profile.fields?.read, domain, profile.entityType, `entity profile ${profileId} read fields`, errors);
    validateFieldList(profile.fields?.write, domain, profile.entityType, `entity profile ${profileId} write fields`, errors);
    validateFieldList(profile.fields?.private, domain, profile.entityType, `entity profile ${profileId} private fields`, errors);
    try {
      compileLifecycle(profile, domain);
    } catch (error) {
      errors.push(`Entity profile ${profileId} lifecycle is invalid: ${error.message}`);
    }
  }

  for (const [serviceId, service] of Object.entries(process.services)) {
    if (service.commandId && !commands.has(service.commandId)) errors.push(`Service ${serviceId} uses unknown command ${service.commandId}`);
    for (const principalId of [...(service.access?.runPrincipals || []), ...(service.access?.viewPrincipals || [])]) {
      if (!process.servicePrincipals[principalId]) errors.push(`Service ${serviceId} references missing service principal ${principalId}`);
    }
    for (const input of service.inputs || []) {
      if (input.entityType && !entities.has(input.entityType)) errors.push(`Service ${serviceId} input ${input.id} uses unknown entity type ${input.entityType}`);
    }
    for (const output of service.outputs || []) {
      if (output.entityType && !entities.has(output.entityType)) errors.push(`Service ${serviceId} output ${output.id} uses unknown entity type ${output.entityType}`);
    }
  }

  for (const [actionId, action] of Object.entries(process.actions)) {
    validateAction(actionId, action, { entities, commands, roles: process.roles, domain, errors, statusDefinitions: process.statusDefinitions });
  }

  for (const [statusId, status] of Object.entries(process.statusDefinitions)) {
    if (!status.statusId) errors.push(`Status definition ${statusId} must define statusId`);
    if (status.entityType && !entities.has(status.entityType)) errors.push(`Status definition ${statusId} uses unknown entity type ${status.entityType}`);
  }

  for (const [socketId, socket] of Object.entries(process.sockets)) {
    if (!entities.has(socket.entityType)) errors.push(`Socket ${socketId} uses unknown entity type ${socket.entityType}`);
    validateFieldList(socket.projection?.fields, domain, socket.entityType, `socket ${socketId} projection fields`, errors);
    validateFieldList(socket.projection?.excludeFields, domain, socket.entityType, `socket ${socketId} excluded fields`, errors);
    if (socket.receiverLifecycle?.mode === 'custom') {
      try {
        compileLifecycle({ entityType: socket.entityType, lifecycle: socket.receiverLifecycle }, domain);
      } catch (error) {
        errors.push(`Socket ${socketId} receiver lifecycle is invalid: ${error.message}`);
      }
    }
  }

  for (const [screenId, screen] of Object.entries(process.screens)) {
    if (!screen.route) errors.push(`Screen ${screenId} must define a route`);
    for (const roleId of screen.roleIds || []) {
      if (!process.roles[roleId]) errors.push(`Screen ${screenId} references missing role ${roleId}`);
    }
    validateScreenContract(screen, { screenId, entities, actions: process.actions, errors });
  }

  for (const [userId, assignment] of Object.entries(process.assignments)) {
    for (const roleId of assignment.roleIds || []) {
      if (!process.roles[roleId]) errors.push(`Assignment ${userId} references missing role ${roleId}`);
    }
  }

  const bindingWarnings = collectIncompleteBindingWarnings(process);
  warnings.push(...bindingWarnings);

  return { ok: errors.length === 0, errors, warnings, definition: process };
}

export function compileProcessDefinition(definition = {}, domain = {}) {
  const validation = validateProcessDefinition(definition, domain);
  if (!validation.ok) {
    const error = new Error(validation.errors.join('; '));
    error.validation = validation;
    throw error;
  }

  const process = validation.definition;
  const compiledRoles = compileRoles(process, domain);
  const compiledScreens = compileScreens(process, domain, compiledRoles);
  const workflows = compileWorkflows(process, domain);

  const userAccess = {};
  for (const [userId, assignment] of Object.entries(process.assignments)) {
    if (assignment.status && assignment.status !== 'active') continue;
    userAccess[userId] = compileAssignmentAccess({ assignment, roles: compiledRoles, screens: compiledScreens });
  }

  return {
    schemaVersion: PROCESS_SCHEMA_VERSION,
    activatedAt: new Date().toISOString(),
    roles: compiledRoles,
    servicePrincipals: process.servicePrincipals,
    userAccess,
    workflows,
    fieldPolicies: compileFieldPolicies(process.entityProfiles),
    actions: compileActions(process.actions, process),
    statusDefinitions: compileStatusDefinitions(process.statusDefinitions),
    valueInputs: compileValueInputs(process.valueInputs),
    services: compileServices(process.services),
    sockets: compileSockets(process.sockets),
    screens: compiledScreens,
    warnings: validation.warnings
  };
}

export function resolveEffectiveAccess({ compiled, userId } = {}) {
  return compiled?.userAccess?.[String(userId)]?.permissions || {};
}

export function resolveNavigation({ compiled, userId } = {}) {
  return compiled?.userAccess?.[String(userId)]?.navigation || [];
}

export function resolveScreens({ compiled, userId } = {}) {
  const access = compiled?.userAccess?.[String(userId)] || {};
  return access.screens || [];
}

export function resolveWorkflow({ compiled, entityType, fallbackWorkflow = null } = {}) {
  return compiled?.workflows?.[entityType] || fallbackWorkflow;
}

export function resolveFieldPolicy({ compiled, entityType, basePolicy = null } = {}) {
  const processPolicy = compiled?.fieldPolicies?.[entityType];
  if (!processPolicy) return basePolicy;
  return {
    ...(basePolicy || {}),
    ...processPolicy
  };
}

function normalizeGraph(graph = {}) {
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map(normalizeNode) : [],
    edges: Array.isArray(graph.edges) ? graph.edges.map(normalizeEdge) : [],
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
  return {
    id: String(edge.id || `${edge.source || ''}-${edge.target || ''}`),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    sourceHandle: edge.sourceHandle || null,
    targetHandle: edge.targetHandle || null,
    type: edge.type || 'default',
    data: edge.data && typeof edge.data === 'object' ? edge.data : {}
  };
}

function normalizeRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function compileLifecycle(profile = {}, domain = {}) {
  const lifecycle = profile.lifecycle || {};
  if (lifecycle.mode === 'defaultCreated' || !lifecycle.mode) return createDefaultCreatedWorkflow(profile.label || profile.entityType);
  if (lifecycle.mode === 'domainDefault') {
    const workflow = domain.workflows?.[profile.entityType];
    if (!workflow) return createDefaultCreatedWorkflow(profile.label || profile.entityType);
    return normalizeWorkflow(workflow);
  }
  if (lifecycle.mode === 'custom') return normalizeWorkflow(lifecycle.workflow);
  throw new Error(`Unknown lifecycle mode ${lifecycle.mode}`);
}

function compileWorkflows(process = {}, domain = {}) {
  const workflows = {};
  for (const profile of Object.values(process.entityProfiles || {})) {
    workflows[profile.entityType] = compileLifecycle(profile, domain);
  }

  const builders = new Map(Object.entries(workflows).map(([entityType, workflow]) => [
    entityType,
    workflowBuilderFromWorkflow(workflow)
  ]));

  for (const action of Object.values(process.actions || {})) {
    const kind = action.actionKind || 'createEntity';
    if (!['createEntity', 'changeStatus'].includes(kind)) continue;
    const entityType = actionEntityType(action);
    if (!entityType) continue;
    const builder = ensureWorkflowBuilder(builders, entityType);

    if (kind === 'createEntity') {
      const targetState = actionTargetState(action, process);
      if (targetState) addWorkflowState(builder, targetState);
      continue;
    }

    const from = action.status?.from || action.access?.statusFrom || action.inputs?.find(input => input.status)?.status || '';
    const to = actionTargetState(action, process);
    if (!from || !to) continue;
    addWorkflowState(builder, from);
    addWorkflowState(builder, to);
    const access = normalizeActionAccess(action.access);
    const transition = {
      from,
      to,
      processRoleIds: [...(access.roleIds || [])]
    };
    const feature = resolveEntityFeature(domain, entityType);
    if (feature && access.roleIds?.length) {
      transition.access = {
        permissions: [{ feature, entityType, level: access.level || 'write' }]
      };
    }
    upsertWorkflowTransition(builder, transition);
  }

  for (const [entityType, builder] of builders) {
    if (!Object.keys(builder.states).length) continue;
    applyStatusDefinitionMetadata(builder, entityType, process.statusDefinitions);
    workflows[entityType] = normalizeWorkflow({
      schemaVersion: 2,
      primaryRegion: 'main',
      regions: {
        main: {
          initial: builder.initial || Object.keys(builder.states)[0],
          states: builder.states,
          transitions: builder.transitions
        }
      }
    });
  }

  return workflows;
}

function applyStatusDefinitionMetadata(builder, entityType, statusDefinitions = {}) {
  for (const definition of Object.values(statusDefinitions || {})) {
    if (definition.entityType && definition.entityType !== entityType) continue;
    const statusId = definition.statusId || definition.id;
    if (!statusId || !builder.states[statusId]) continue;
    builder.states[statusId] = {
      ...(builder.states[statusId] || {}),
      label: definition.label || statusId,
      color: definition.color || definition.severity || '',
      severity: definition.severity || definition.color || '',
      icon: definition.icon || ''
    };
  }
}

function workflowBuilderFromWorkflow(workflow = {}) {
  const regionId = workflow.primaryRegion || 'main';
  const region = workflow.regions?.[regionId] || {};
  return {
    initial: region.initial || '',
    states: { ...(region.states || {}) },
    transitions: [...(region.transitions || [])]
  };
}

function ensureWorkflowBuilder(builders, entityType) {
  if (!builders.has(entityType)) {
    builders.set(entityType, { initial: '', states: {}, transitions: [] });
  }
  return builders.get(entityType);
}

function addWorkflowState(builder, state) {
  if (!state) return;
  builder.states[state] ||= { canUpdateMeta: true };
  builder.initial ||= state;
}

function upsertWorkflowTransition(builder, transition) {
  const existing = builder.transitions.find(item => item.from === transition.from && item.to === transition.to);
  if (existing) {
    existing.processRoleIds = [...new Set([...(existing.processRoleIds || []), ...(transition.processRoleIds || [])])];
    if (transition.access?.permissions?.length) {
      existing.access ||= {};
      existing.access.permissions = mergeTransitionPermissions(existing.access.permissions || [], transition.access.permissions);
    }
    return;
  }
  builder.transitions.push(transition);
}

function mergeTransitionPermissions(existing = [], next = []) {
  const merged = [...existing];
  for (const permission of next) {
    if (merged.some(item => item.feature === permission.feature && item.level === permission.level && item.entityType === permission.entityType)) continue;
    merged.push(permission);
  }
  return merged;
}

function actionEntityType(action = {}) {
  return action.entityType
    || action.inputs?.find(input => input.entityType)?.entityType
    || action.outputs?.find(output => output.entityType)?.entityType
    || '';
}

function compileAssignmentAccess({ assignment = {}, roles = {}, screens = {} } = {}) {
  const permissions = {};
  const screenMap = new Map();
  const actionMap = new Map();
  const incompleteBindings = [];
  const roleIds = assignment.roleIds || [];
  for (const roleId of roleIds) {
    const role = roles[roleId];
    if (!role) continue;
    for (const grant of role.grants || []) {
      const compiledGrant = compileGrantForAssignment(grant, assignment);
      if (compiledGrant.incomplete.length) {
        incompleteBindings.push(...compiledGrant.incomplete.map(binding => ({ roleId, feature: grant.feature, binding })));
        continue;
      }
      permissions[grant.feature] ||= [];
      permissions[grant.feature].push(compiledGrant.grant);
    }
    for (const action of role.actions || []) {
      const existing = actionMap.get(action.actionId) || {};
      actionMap.set(action.actionId, {
        ...existing,
        ...action,
        sourceRoleIds: [...new Set([...(existing.sourceRoleIds || []), roleId])]
      });
    }
    for (const screen of Object.values(screens)) {
      if (!screenAppliesToRole(screen, roleId)) continue;
      const compiledScreen = compileScreenForAssignment(screen, assignment, roleId);
      if (compiledScreen.incomplete.length) {
        incompleteBindings.push(...compiledScreen.incomplete.map(binding => ({ roleId, screenId: screen.id, binding })));
        continue;
      }
      mergeCompiledScreen(screenMap, compiledScreen.screen);
    }
  }
  const screensList = [...screenMap.values()];
  const screenNavigation = screensList.map(screenToNavigation);
  return {
    roleIds,
    permissions,
    navigation: dedupeNavigation(screenNavigation),
    screens: screensList,
    actions: [...actionMap.values()],
    incompleteBindings
  };
}

function compileRoles(process = {}, domain = {}) {
  const roles = Object.fromEntries(Object.entries(process.roles || {}).map(([roleId, role]) => [roleId, {
    id: role.id || roleId,
    label: role.label || role.id || roleId,
    grants: Array.isArray(role.grants) ? [...role.grants] : [],
    actions: Array.isArray(role.actions) ? [...role.actions] : []
  }]));
  for (const profile of Object.values(process.entityProfiles || {})) {
    const feature = resolveEntityFeature(domain, profile.entityType);
    for (const level of ['read', 'write', 'admin']) {
      for (const roleId of profile.allowedRoles?.[level] || []) {
        if (!roles[roleId]) continue;
        roles[roleId].grants ||= [];
        upsertGrant(roles[roleId].grants, { feature, level });
      }
    }
  }
  for (const screen of Object.values(process.screens || {})) {
    const grant = grantFromScreenRequired(screen.required);
    if (!grant) continue;
    for (const roleId of screen.roleIds || []) {
      if (!roles[roleId]) continue;
      upsertGrant(roles[roleId].grants, grant);
    }
  }
  const actionWindows = compileActionAccessWindows(process, domain);
  for (const [actionId, action] of Object.entries(process.actions || {})) {
    const access = normalizeActionAccess(action.access);
    const actionWindow = actionWindows.get(actionId);
    for (const grant of actionWindow?.grants || []) {
      for (const roleId of grant.roleIds || []) {
        if (!roles[roleId]) continue;
        roles[roleId].grants ||= [];
        upsertGrant(roles[roleId].grants, grant);
      }
    }
    if ((action.trigger?.mode || 'manual') !== 'manual') continue;
    for (const roleId of access.roleIds || []) {
      if (!roles[roleId]) continue;
      const feature = actionWindow?.primaryGrant?.feature || grantFromAction(action, access, domain)?.feature || null;
      roles[roleId].actions.push({
        actionId: action.id || actionId,
        label: displayActionLabel(action, actionId),
        level: 'run',
        actionKind: action.actionKind || 'createEntity',
        feature,
        entityType: action.entityType || action.inputs?.find(input => input.entityType)?.entityType || null,
        status: action.status || {},
        construction: normalizeConstruction(action.construction, action.entityType),
        inputPolicy: normalizeInputPolicy(action.inputPolicy),
        inputs: action.inputs || []
      });
    }
  }
  return roles;
}

function grantFromScreenRequired(required = null) {
  if (!required?.feature || !required?.level) return null;
  return {
    feature: required.feature,
    level: required.level,
    actions: required.actions,
    scope: required.scope,
    transitions: required.transitions,
    rule: required.rule
  };
}

function grantFromAction(action = {}, access = {}, domain = {}) {
  const entityType = action.entityType || action.inputs?.find(input => input.entityType)?.entityType;
  const feature = entityType ? resolveEntityFeature(domain, entityType) : null;
  if (!feature || !access.roleIds?.length) return null;
  const grant = {
    feature,
    level: access.level || 'write'
  };
  if (action.actionKind === 'createEntity') {
    const to = action.status?.to || '';
    if (to) grant.rule = { fact: 'primaryStatus', equals: to };
  }
  if (action.actionKind === 'changeStatus') {
    const from = access.statusFrom || action.status?.from || '';
    const to = access.statusTo || action.status?.to || '';
    if (from || to) grant.transitions = [{ from: from || undefined, to: to || undefined }];
    if (to) grant.rule = { fact: 'primaryStatus', equals: to };
  }
  return grant;
}

function upsertGrant(grants, next) {
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
    scope: grant.scope || null,
    transitions: grant.transitions || null,
    rule: grant.rule || null,
    actions: grant.actions || null
  });
}

function compileActionAccessWindows(process = {}, domain = {}) {
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
      const window = compileActionWindow(actionId, action, incoming, domain, process);
      windows.set(actionId, window);
      pending.delete(actionId);
      progressed = true;
    }
    if (!progressed) {
      for (const [actionId, action] of pending) {
        windows.set(actionId, compileActionWindow(actionId, action, null, domain, process));
      }
      break;
    }
  }

  return windows;
}

function buildActionGraphContext(process = {}) {
  const actionNodeById = new Map();
  const actionIdByNodeId = new Map();
  for (const node of process.graph?.nodes || []) {
    if (node.type !== 'action') continue;
    const actionId = String(node.data?.refId || node.id || '');
    if (!actionId) continue;
    actionNodeById.set(actionId, node);
    actionIdByNodeId.set(String(node.id), actionId);
  }

  const incomingByActionId = new Map();
  for (const edge of process.graph?.edges || []) {
    const targetActionId = actionIdByNodeId.get(String(edge.target));
    const sourceActionId = actionIdByNodeId.get(String(edge.source));
    if (!targetActionId || !sourceActionId) continue;
    incomingByActionId.set(targetActionId, {
      sourceActionId,
      sourceHandle: edge.sourceHandle || null,
      targetHandle: edge.targetHandle || null
    });
  }

  return { actionNodeById, actionIdByNodeId, incomingByActionId };
}

function incomingWindowForAction(actionId, action = {}, graphContext, windows) {
  const edge = graphContext.incomingByActionId.get(actionId);
  if (edge) return outputWindowForHandle(windows.get(edge.sourceActionId), edge.sourceHandle);
  const input = action.inputs?.find(item => item.entityType);
  if (!input) return null;
  return {
    entityType: input.entityType,
    status: input.status || '',
    level: normalizeActionAccess(action.access).level,
    roleIds: [],
    scope: null,
    sourcePath: `input:${actionId}:${input.id || 'entity'}`
  };
}

function outputWindowForHandle(actionWindow, sourceHandle) {
  if (!actionWindow) return null;
  if (!sourceHandle || sourceHandle === 'output') return actionWindow.outputs[0] || null;
  const id = String(sourceHandle).replace(/^output:/, '');
  return actionWindow.outputs.find(output => output.handleId === sourceHandle || output.id === id) || actionWindow.outputs[0] || null;
}

function compileActionWindow(actionId, action = {}, incoming = null, domain = {}, process = {}) {
  const kind = action.actionKind || 'createEntity';
  const access = normalizeActionAccess(action.access);
  const entityType = actionEntityType(action) || incoming?.entityType || '';
  const statusTo = actionTargetState(action, process) || access.statusTo || incoming?.status || '';
  const feature = entityType ? resolveEntityFeature(domain, entityType) : null;
  const inheritedRoles = incoming?.roleIds || [];
  const explicitRoles = access.roleIds || [];
  const useInherited = kind === 'changeStatus' && !access.modified && inheritedRoles.length;
  const roleIds = useInherited ? inheritedRoles : explicitRoles;
  const level = useInherited ? (incoming.level || access.level) : access.level;
  const scope = deriveActionWindowScope(action, incoming);
  const outputs = [];
  const grants = [];

  if (['createEntity', 'changeStatus', 'updateEntity'].includes(kind) && feature && entityType) {
    const status = kind === 'updateEntity' ? (incoming?.status || action.inputs?.find(input => input.status)?.status || '') : statusTo;
    const window = {
      id: outputSocketId(action, kind),
      handleId: outputHandleId(action, kind),
      entityType,
      feature,
      status,
      level,
      roleIds: [...new Set(roleIds)],
      scope,
      sourcePath: [incoming?.sourcePath, actionId, status].filter(Boolean).join('>')
    };
    outputs.push(window);
    if (window.roleIds.length) {
      grants.push(windowGrant(window, action, access));
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

function outputSocketId(action = {}, kind = '') {
  return action.outputs?.find(output => output.entityType)?.id || (kind === 'createEntity' ? 'created' : 'entity');
}

function outputHandleId(action = {}, kind = '') {
  const outputs = action.outputs || [];
  if (outputs.length <= 1) return 'output';
  const id = outputSocketId(action, kind);
  const index = outputs.findIndex(output => output.id === id);
  return `output:${id || Math.max(index, 0)}`;
}

function deriveActionWindowScope(action = {}, incoming = null) {
  const access = normalizeActionAccess(action.access);
  if (access.scope) return { ...access.scope };
  const inheritedScope = incoming?.scope ? { ...incoming.scope } : null;
  if ((action.actionKind || 'createEntity') !== 'createEntity') return inheritedScope;
  const parentType = action.parentEntityType || action.inputs?.find(input => input.id === 'parent')?.entityType || incoming?.entityType || '';
  if (!parentType || !incoming) return inheritedScope;
  const parentKey = `${parentType}Id`;
  if (inheritedScope?.entityId && !inheritedScope[parentKey]) {
    const { entityId, ...lineageScope } = inheritedScope;
    return { ...lineageScope, [parentKey]: entityId };
  }
  return inheritedScope;
}

function windowGrant(window = {}, action = {}, access = {}) {
  const grant = {
    feature: window.feature,
    level: window.level || 'read',
    roleIds: window.roleIds || [],
    sourceActionId: action.id,
    sourcePath: window.sourcePath
  };
  if (window.scope) grant.scope = window.scope;
  if (window.status) grant.rule = { fact: 'primaryStatus', equals: window.status };
  if ((action.actionKind || 'createEntity') === 'changeStatus') {
    const from = access.statusFrom || action.status?.from || '';
    const to = access.statusTo || action.status?.to || window.status || '';
    if (from || to) grant.transitions = [{ from: from || undefined, to: to || undefined }];
  }
  return grant;
}

function resolveEntityFeature(domain = {}, entityType) {
  const fieldPolicy = getFieldPolicy(domain.fieldAccess || {}, entityType);
  if (fieldPolicy?.feature) return fieldPolicy.feature;
  const entity = (domain.entities || []).find(item => item.type === entityType);
  return entity?.collection || entityType;
}

function compileGrantForAssignment(grant = {}, assignment = {}) {
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

function collectIncompleteBindingWarnings(process) {
  const warnings = [];
  const compiledRoles = compileRoles(process);
  const compiledScreens = compileScreens(process, {}, compiledRoles);
  for (const [userId, assignment] of Object.entries(process.assignments)) {
    const access = compileAssignmentAccess({ assignment, roles: compiledRoles, screens: compiledScreens });
    for (const item of access.incompleteBindings) {
      warnings.push(`Assignment ${userId} role ${item.roleId}${item.screenId ? ` screen ${item.screenId}` : ''} missing binding ${item.binding}`);
    }
  }
  return warnings;
}

function compileScreens(processOrScreens = {}, domain = {}, compiledRoles = {}) {
  const screens = processOrScreens.screens || processOrScreens;
  const inferredScreens = inferScreensFromRoleGrants({
    screens,
    roles: compiledRoles,
    domain,
    entityProfiles: processOrScreens.entityProfiles || {}
  });
  return Object.fromEntries(Object.entries({ ...screens, ...inferredScreens }).map(([id, screen]) => {
    const normalized = normalizeScreenContract(screen);
    return [id, {
      id: normalized.id || id,
      label: normalized.label || normalized.id || id,
      labelKey: normalized.labelKey || null,
      kind: normalized.kind || 'route',
      template: normalized.template,
      route: normalized.route || '',
      sourceRoute: normalized.sourceRoute || normalized.route || '',
      placement: normalized.placement || 'hub',
      entityType: normalized.entityType || null,
      required: normalized.required || null,
      roleIds: normalized.roleIds || [],
      bindings: normalized.bindings || {},
      sources: normalized.sources,
      regions: normalized.regions,
      actions: normalized.actions || []
    }];
  }));
}

function inferScreensFromRoleGrants({ screens = {}, roles = {}, domain = {}, entityProfiles = {} } = {}) {
  const inferred = {};
  const existingKeys = new Set(Object.values(screens).flatMap(screen => {
    const roleIds = screen.roleIds?.length ? screen.roleIds : Object.keys(roles);
    const feature = screen.required?.feature || featureFromEntityType(domain, screen.entityType);
    return roleIds.map(roleId => `${roleId}:${feature || ''}`).filter(key => !key.endsWith(':'));
  }));

  for (const [roleId, role] of Object.entries(roles)) {
    const grantsByFeature = groupGrantsByFeature(role.grants || []);
    for (const [feature, grants] of grantsByFeature) {
      const entityType = entityTypeFromFeature(domain, feature)
        || entityTypeFromProfiles(entityProfiles, domain, feature);
      if (!entityType || existingKeys.has(`${roleId}:${feature}`)) continue;
      const id = `auto_${roleId}_${entityType}`;
      const required = aggregateScreenRequirement(feature, grants);
      inferred[id] = {
        id,
        label: `${role.label || roleId} ${entityType}`,
        kind: 'entityList',
        template: 'entityList',
        placement: 'hub',
        entityType,
        required,
        roleIds: [roleId],
        actions: (role.actions || [])
          .filter(action => action.feature === feature)
          .map(action => action.actionId)
      };
      existingKeys.add(`${roleId}:${feature}`);
    }
  }

  return inferred;
}

function groupGrantsByFeature(grants = []) {
  const map = new Map();
  for (const grant of grants) {
    if (!grant?.feature) continue;
    if (!map.has(grant.feature)) map.set(grant.feature, []);
    map.get(grant.feature).push(grant);
  }
  return map;
}

function aggregateScreenRequirement(feature, grants = []) {
  if (grants.length === 1) {
    const grant = grants[0];
    return {
      feature,
      level: grant.level || 'read',
      scope: grant.scope,
      transitions: grant.transitions,
      rule: grant.rule
    };
  }
  const rules = grants.map(grant => grant.rule).filter(Boolean);
  const scopes = grants.map(grant => grant.scope).filter(Boolean);
  return {
    feature,
    level: maxAccessLevel(grants.map(grant => grant.level || 'read')),
    ...(rules.length ? { rule: { any: rules } } : {}),
    ...(scopes.length === 1 ? { scope: scopes[0] } : {})
  };
}

function maxAccessLevel(levels = []) {
  return levels.reduce((current, level) => (
    ACCESS_ORDER[level] > ACCESS_ORDER[current] ? level : current
  ), 'read');
}

function entityTypeFromFeature(domain = {}, feature) {
  return (domain.entities || []).find(entity =>
    entity.collection === feature ||
    entity.type === feature ||
    `${entity.type}s` === feature
  )?.type || null;
}

function entityTypeFromProfiles(entityProfiles = {}, domain = {}, feature) {
  return Object.values(entityProfiles).find(profile => resolveEntityFeature(domain, profile.entityType) === feature)?.entityType || null;
}

function featureFromEntityType(domain = {}, entityType) {
  if (!entityType) return null;
  return resolveEntityFeature(domain, entityType);
}

function screenAppliesToRole(screen = {}, roleId) {
  return !screen.roleIds?.length || screen.roleIds.includes(roleId);
}

function compileScreenForAssignment(screen = {}, assignment = {}, roleId = null) {
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
    entityType: screen.entityType,
    required: screen.required,
    scope: screen.bindings || {},
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

function mergeCompiledScreen(screenMap, screen) {
  const existing = screenMap.get(screen.screenKey);
  if (!existing) {
    screenMap.set(screen.screenKey, screen);
    return;
  }
  existing.actions = [...new Set([...(existing.actions || []), ...(screen.actions || [])])];
  existing.sourceRoleIds = [...new Set([...(existing.sourceRoleIds || []), ...(screen.sourceRoleIds || [])])];
}

function screenToNavigation(screen = {}) {
  return {
    id: screen.screenKey || screen.id,
    route: screen.route,
    requires: screen.required || null,
    screenId: screen.id,
    screenKey: screen.screenKey
  };
}

function dedupeNavigation(items = []) {
  const byKey = new Map();
  for (const item of items) {
    if (!item?.route) continue;
    byKey.set(item.id || item.route, item);
  }
  return [...byKey.values()];
}

function compileFieldPolicies(entityProfiles = {}) {
  const policies = {};
  for (const profile of Object.values(entityProfiles)) {
    policies[profile.entityType] = {
      read: profile.fields?.read || [],
      write: profile.fields?.write || [],
      private: profile.fields?.private || []
    };
  }
  return policies;
}

function compileServices(services = {}) {
  return Object.fromEntries(Object.entries(services).map(([id, service]) => [id, {
    enabled: true,
    commandId: service.commandId || null,
    principals: {
      run: service.access?.runPrincipals || [],
      view: service.access?.viewPrincipals || []
    },
    inputs: service.inputs || [],
    outputs: service.outputs || []
  }]));
}

function compileSockets(sockets = {}) {
  return Object.fromEntries(Object.entries(sockets).map(([id, socket]) => [id, {
    id: socket.id || id,
    label: socket.label || socket.id || id,
    direction: socket.direction === 'inbound' ? 'inbound' : 'outbound',
    entityType: socket.entityType || null,
    projection: socket.projection || { fields: [], excludeFields: [] },
    receiverLifecycle: socket.receiverLifecycle || { mode: 'defaultCreated', workflow: null },
    access: {
      sendRoles: socket.access?.sendRoles || [],
      receiveRoles: socket.access?.receiveRoles || []
    },
    inputs: socket.direction === 'inbound'
      ? []
      : [{ id: 'entity', entityType: socket.entityType, required: true }],
    outputs: socket.direction === 'inbound'
      ? [{ id: 'received', entityType: socket.entityType, status: initialSocketStatus(socket) }]
      : [{ id: 'projection', entityType: socket.entityType, projection: true, fields: socket.projection?.fields || [] }]
  }]));
}

function initialSocketStatus(socket = {}) {
  const lifecycle = socket.receiverLifecycle || {};
  if (lifecycle.mode === 'custom') {
    const workflow = normalizeWorkflow(lifecycle.workflow || createDefaultCreatedWorkflow(socket.entityType));
    const region = workflow.regions?.[workflow.primaryRegion] || Object.values(workflow.regions || {})[0];
    return region?.initial || '';
  }
  return '';
}

function compileActions(actions = {}, process = {}) {
  return Object.fromEntries(Object.entries(actions).map(([id, action]) => [id, {
    id: action.id || id,
    label: displayActionLabel(action, id),
    actionKind: action.actionKind || 'createEntity',
    entityType: action.entityType || null,
    parentEntityType: action.parentEntityType || null,
    commandId: action.commandId || null,
    status: {
      ...(action.status || {}),
      ...(actionTargetState(action, process) ? { to: actionTargetState(action, process) } : {})
    },
    mutation: action.mutation || { fields: [] },
    projection: action.projection || null,
    construction: normalizeConstruction(action.construction, action.entityType),
    inputPolicy: normalizeInputPolicy(action.inputPolicy),
    statusRef: action.statusRef || null,
    access: normalizeActionAccess(action.access),
    trigger: {
      mode: action.trigger?.mode || 'manual'
    },
    inputs: action.inputs || [],
    outputs: action.outputs || [],
    events: action.events || []
  }]));
}

function actionTargetState(action = {}, process = {}) {
  const statusRef = action.statusRef;
  const referenced = statusRef ? process.statusDefinitions?.[statusRef] : null;
  return referenced?.statusId
    || action.status?.to
    || action.access?.statusTo
    || action.outputs?.find(output => output.status)?.status
    || '';
}

function compileStatusDefinitions(statusDefinitions = {}) {
  return Object.fromEntries(Object.entries(statusDefinitions).map(([id, definition]) => [id, {
    id: definition.id || id,
    entityType: definition.entityType || '',
    statusId: definition.statusId || definition.id || id,
    label: definition.label || definition.statusId || id,
    color: definition.color || '',
    severity: definition.severity || definition.color || '',
    icon: definition.icon || ''
  }]));
}

function compileValueInputs(valueInputs = {}) {
  return Object.fromEntries(Object.entries(valueInputs).map(([id, input]) => [id, {
    id: input.id || id,
    label: input.label || input.id || id,
    valueType: input.valueType || 'string',
    path: input.path || '',
    value: input.value ?? ''
  }]));
}

function normalizeConstruction(construction = {}, entityType = '') {
  return {
    mode: construction.mode || defaultConstructionMode(entityType),
    inputs: Array.isArray(construction.inputs) ? construction.inputs : []
  };
}

function normalizeInputPolicy(inputPolicy = {}) {
  return {
    prompt: inputPolicy.prompt !== false,
    fields: Array.isArray(inputPolicy.fields) ? inputPolicy.fields : []
  };
}

function defaultConstructionMode(entityType = '') {
  if (entityType === 'cassette_design') return 'bakeCassetteDesignFromTemplate';
  return 'genericCreate';
}

function displayActionLabel(action = {}, id = '') {
  const explicit = String(action.label || '').trim();
  if (explicit && !isGenericActionLabel(explicit, action.actionKind)) return explicit;

  const entityType = action.entityType
    || action.inputs?.find(input => input.entityType)?.entityType
    || action.outputs?.find(output => output.entityType)?.entityType
    || '';
  if ((action.actionKind || 'createEntity') === 'createEntity') {
    return ['Create', entityTypeLabel(entityType), action.status?.to].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'changeStatus') {
    return ['Move', entityTypeLabel(entityType), action.status?.to].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'updateEntity') {
    return ['Update', entityTypeLabel(entityType)].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'runCommand') {
    return ['Run', action.commandId].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'sendToOrganization') {
    return ['Send', entityTypeLabel(entityType)].filter(Boolean).join(' ');
  }
  return action.actionKind || id;
}

function isGenericActionLabel(label, actionKind = '') {
  const normalized = label.trim().toLowerCase();
  const generic = new Set(['create', 'status', 'service', 'update', 'send', 'action', actionKind?.toLowerCase?.()].filter(Boolean));
  return generic.has(normalized);
}

function entityTypeLabel(entityType = '') {
  return entityType ? entityType.replace(/_/g, ' ') : '';
}

function normalizeActionAccess(access = {}) {
  return {
    level: ['read', 'write', 'admin'].includes(access.level) ? access.level : 'write',
    roleIds: Array.isArray(access.roleIds) ? access.roleIds : [],
    modified: Boolean(access.modified),
    scope: access.scope && typeof access.scope === 'object' && !Array.isArray(access.scope) ? { ...access.scope } : null,
    statusFrom: typeof access.statusFrom === 'string' ? access.statusFrom : '',
    statusTo: typeof access.statusTo === 'string' ? access.statusTo : ''
  };
}

function validateAction(actionId, action = {}, { entities, commands, roles, domain, errors, statusDefinitions = {} }) {
  const kind = action.actionKind || 'createEntity';
  if (!['createEntity', 'updateEntity', 'changeStatus', 'runCommand', 'sendToOrganization'].includes(kind)) {
    errors.push(`Action ${actionId} uses unknown action kind ${kind}`);
    return;
  }
  if (kind === 'runCommand') {
    if (!action.commandId) errors.push(`Action ${actionId} must select a command`);
    if (action.commandId && !commands.has(action.commandId)) errors.push(`Action ${actionId} uses unknown command ${action.commandId}`);
  } else if (!['changeStatus', 'updateEntity'].includes(kind)) {
    if (!action.entityType) errors.push(`Action ${actionId} must select an entity type`);
    if (action.entityType && !entities.has(action.entityType)) errors.push(`Action ${actionId} uses unknown entity type ${action.entityType}`);
  }
  if (action.parentEntityType && !entities.has(action.parentEntityType)) {
    errors.push(`Action ${actionId} uses unknown parent entity type ${action.parentEntityType}`);
  }
  const hasTargetStatus = Boolean(action.status?.to || (action.statusRef && statusDefinitions[action.statusRef]));
  if (kind === 'changeStatus' && !hasTargetStatus) {
    errors.push(`Action ${actionId} must define a target status`);
  }
  if (kind === 'createEntity' && !hasTargetStatus) {
    errors.push(`Action ${actionId} must define target status`);
  }
  if (kind === 'createEntity') {
    validateConstruction(actionId, action, domain, errors);
  }
  if (kind === 'updateEntity') {
    const entityType = action.inputs?.find(input => input.entityType)?.entityType || action.entityType;
    if (!entityType) errors.push(`Action ${actionId} must receive an entity input`);
    if (entityType && !entities.has(entityType)) errors.push(`Action ${actionId} input uses unknown entity type ${entityType}`);
    validateFieldList(action.mutation?.fields, domain, entityType, `action ${actionId} update fields`, errors);
  }
  if (!action.access || !Array.isArray(action.access.roleIds) || !['read', 'write', 'admin'].includes(action.access.level)) {
    errors.push(`Action ${actionId} must define access with level and roleIds`);
  }
  if (kind === 'sendToOrganization') {
    validateFieldList(action.projection?.fields, domain, action.entityType, `action ${actionId} projection fields`, errors);
    validateFieldList(action.projection?.excludeFields, domain, action.entityType, `action ${actionId} excluded fields`, errors);
  }
  const triggerMode = action.trigger?.mode || 'manual';
  if (!['manual', 'event'].includes(triggerMode)) {
    errors.push(`Action ${actionId} uses unknown trigger mode ${triggerMode}`);
  }
  for (const roleId of normalizeActionAccess(action.access).roleIds) {
    if (!roles[roleId]) errors.push(`Action ${actionId} references missing access role ${roleId}`);
  }
  if (action.statusRef && !statusDefinitions[action.statusRef]) {
    errors.push(`Action ${actionId} references missing status definition ${action.statusRef}`);
  }
}

function validateConstruction(actionId, action = {}, domain = {}, errors = []) {
  const entityType = action.entityType || '';
  const contract = constructionContract(domain, entityType);
  const construction = normalizeConstruction(action.construction, entityType);
  if (!contract.modes.includes(construction.mode)) {
    errors.push(`Action ${actionId} cannot create ${entityType} with construction mode ${construction.mode}`);
  }
  if (contract.derived && construction.mode === 'genericCreate') {
    errors.push(`Action ${actionId} must use a typed construction mode for derived entity ${entityType}`);
  }
  const requiredIds = new Set((contract.inputs || []).filter(input => input.required).map(input => input.id));
  const presentIds = new Set([...(construction.inputs || []), ...(action.inputs || [])].map(input => input.id));
  for (const inputId of requiredIds) {
    if (!presentIds.has(inputId)) errors.push(`Action ${actionId} missing construction input ${inputId}`);
  }
}

function constructionContract(domain = {}, entityType = '') {
  return domain.construction?.[entityType] || {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: []
  };
}

function validateFieldList(fields = [], domain = {}, entityType, label, errors) {
  if (!Array.isArray(fields)) return;
  const policy = getFieldPolicy(domain.fieldAccess || {}, entityType);
  if (!policy) {
    if (fields.length) errors.push(`${label} cannot be checked because ${entityType} has no field-access policy`);
    return;
  }
  const allowed = [...(policy.read || []), ...(policy.write || []), ...(policy.admin || [])];
  for (const field of fields) {
    if (!fieldPathAllowed(field, allowed)) errors.push(`${label} contains field outside base policy: ${field}`);
  }
}

function fieldPathAllowed(path, allowed = []) {
  if (!path || typeof path !== 'string') return false;
  return allowed.some(pattern => pattern === path || (pattern.endsWith('.*') && (path === pattern.slice(0, -2) || path.startsWith(pattern.slice(0, -1)))));
}

function getFieldPolicy(fieldAccess, entityType) {
  const key = String(entityType || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return fieldAccess[key] || fieldAccess[camel] || fieldAccess[snake] || null;
}

function getByPath(source, path) {
  return String(path).split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}
