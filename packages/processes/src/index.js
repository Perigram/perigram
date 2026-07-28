import { normalizeWorkflow } from '../../workflows/src/index.js';
import {
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
export { migrateProcessDataflowDefinition } from './dataflow-migration.js';

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
  return inferProcessDataflowContracts({
    schemaVersion: data.schemaVersion || PROCESS_SCHEMA_VERSION,
    dataflowVersion: data.dataflowVersion || 1,
    sourceTemplateId: data.sourceTemplateId || null,
    sourceProcessDefinitionId: data.sourceProcessDefinitionId || null,
    graph: normalizeGraph(data.graph),
    roles: normalizeRecord(data.roles),
    servicePrincipals: normalizeRecord(data.servicePrincipals),
    entityProfiles: normalizeRecord(data.entityProfiles),
    actions: normalizeActions(data.actions),
    services: normalizeRecord(data.services),
    sockets: normalizeRecord(data.sockets),
    statusDefinitions: normalizeRecord(data.statusDefinitions),
    valueInputs: normalizeRecord(data.valueInputs),
    processNodes: normalizeRecord(data.processNodes),
    screens: normalizeRecord(data.screens),
    assignments: normalizeRecord(data.assignments),
    compiled: data.compiled || null
  });
}

export function requiredEntityProfileTypes(definition = {}, domain = {}) {
  const process = normalizeProcessDefinition(definition);
  const commandIds = [
    ...Object.values(process.actions)
      .filter(action => action?.actionKind === 'runCommand')
      .map(action => action.commandId),
    ...Object.values(process.services).map(service => service?.commandId)
  ].filter(Boolean);

  return [...new Set(commandIds.flatMap(commandId =>
    domain.commands?.[commandId]?.requiredEntityProfiles || []
  ))];
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
  errors.push(...validateProcessEdges(process));

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
    if (node.type === 'processNode' && !process.processNodes[refId]) errors.push(`Process node ${node.id} references missing process node ${refId}`);
    if (node.type === 'user' && !process.assignments[refId]) errors.push(`User node ${node.id} references missing assignment ${refId}`);
  }

  for (const [profileId, profile] of Object.entries(process.entityProfiles)) {
    if (!entities.has(profile.entityType)) errors.push(`Entity profile ${profileId} uses unknown entity type ${profile.entityType}`);
    validateFieldList(profile.fields?.read, domain, profile.entityType, `entity profile ${profileId} read fields`, errors, 'read');
    validateFieldList(profile.fields?.write, domain, profile.entityType, `entity profile ${profileId} write fields`, errors, 'write');
    validateFieldList(profile.fields?.private, domain, profile.entityType, `entity profile ${profileId} private fields`, errors, 'admin');
    for (const relationKey of profile.relations || []) {
      if (!(domain.relations || []).some(relation => relation.ownerType === profile.entityType && relation.key === relationKey)) {
        errors.push(`Entity profile ${profileId} uses undeclared relation ${profile.entityType}.${relationKey}`);
      }
    }
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
    validateAction(actionId, action, { entities, commands, roles: process.roles, domain, errors, statusDefinitions: process.statusDefinitions, process });
  }

  for (const [nodeId, node] of Object.entries(process.processNodes)) {
    validateProcessNode(nodeId, node, { entities, domain, errors });
  }
  for (const [inputId, input] of Object.entries(process.valueInputs)) {
    if (!PROCESS_SCALAR_KINDS.includes(input.valueType)) errors.push(`Value input ${inputId} uses unknown type ${input.valueType || '(empty)'}`);
    if (!PROCESS_STRUCTURES.includes(input.structure || 'item')) errors.push(`Value input ${inputId} uses unknown structure ${input.structure}`);
  }
  validateProcessNodeConnections(process, errors);

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
    if (!screen || typeof screen !== 'object' || Array.isArray(screen)) {
      validateScreenContract(screen, { screenId, entities, actions: process.actions, errors });
      continue;
    }
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
    userAccess[userId] = compileAssignmentAccess({ assignment, roles: compiledRoles, screens: compiledScreens, domain });
  }

  return {
    schemaVersion: PROCESS_SCHEMA_VERSION,
    activatedAt: new Date().toISOString(),
    roles: compiledRoles,
    servicePrincipals: process.servicePrincipals,
    userAccess,
    workflows,
    fieldPolicies: compileFieldPolicies(process.entityProfiles, domain),
    actions: compileActions(process.actions, process, domain),
    statusDefinitions: compileStatusDefinitions(process.statusDefinitions),
    valueInputs: compileValueInputs(process.valueInputs),
    processNodes: compileProcessNodes(process.processNodes),
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
  const sourceHandle = edge.sourceHandle || inferEdgeHandle(edge, 'source');
  const targetHandle = edge.targetHandle || inferEdgeHandle(edge, 'target');
  return {
    id: String(edge.id || `${edge.source || ''}-${edge.target || ''}`),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    sourceHandle,
    targetHandle,
    type: edge.type || 'default',
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

function normalizeRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeActions(value) {
  return Object.fromEntries(Object.entries(normalizeRecord(value)).map(([id, action]) => [id, normalizeActionRecord(action)]));
}

function normalizeActionRecord(action = {}) {
  if (action.actionKind !== 'changeStatus') return { ...action };
  const entityType = action.entityType || action.inputs?.find(input => input.entityType)?.entityType || '';
  const inputs = [...(action.inputs || [])];
  if (!inputs.some(input => input.id === 'entity')) {
    inputs.unshift({ id: 'entity', kind: 'entity', entityType, required: true });
  }
  if (!inputs.some(input => input.id === 'status')) {
    inputs.push({
      id: 'status',
      kind: 'status',
      statusRef: action.statusRef || null,
      status: action.status?.to || action.access?.statusTo || '',
      required: false
    });
  }
  return {
    ...action,
    actionKind: 'updateEntity',
    entityType,
    inputs,
    mutation: action.mutation || { fields: [] },
    access: {
      ...(action.access || {}),
      statusFrom: action.access?.statusFrom || action.status?.from || '',
      statusTo: action.access?.statusTo || action.status?.to || ''
    }
  };
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
  const actionWindows = compileActionAccessWindows(process, domain);
  const graphContext = buildActionGraphContext(process);
  for (const profile of Object.values(process.entityProfiles || {})) {
    workflows[profile.entityType] = compileLifecycle(profile, domain);
  }

  const builders = new Map(Object.entries(workflows).map(([entityType, workflow]) => [
    entityType,
    workflowBuilderFromWorkflow(workflow)
  ]));

  for (const [actionId, action] of Object.entries(process.actions || {})) {
    const kind = action.actionKind || 'createEntity';
    if (!['createEntity', 'updateEntity'].includes(kind)) continue;
    const entityType = actionEntityType(action) || actionWindows.get(actionId)?.outputs?.[0]?.entityType || actionWindows.get(actionId)?.input?.entityType;
    if (!entityType) continue;
    const builder = ensureWorkflowBuilder(builders, entityType);

    if (kind === 'createEntity') {
      const targetState = actionTargetState(action, process);
      if (targetState) addWorkflowState(builder, targetState);
      continue;
    }

    const to = actionTargetState(action, process);
    const access = normalizeActionAccess(action.access);
    if (!to) continue;

    for (const source of workflowTransitionSources(actionId, action, entityType, graphContext, actionWindows)) {
      const from = source.status;
      if (!from) continue;
      addWorkflowState(builder, from);
      addWorkflowState(builder, to);
      upsertWorkflowTransition(builder, {
        from,
        to,
        processRoleIds: actionExposureRoleIdsForInput(action, access, source.window)
      });
    }
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

function workflowTransitionSources(actionId, action = {}, entityType = '', graphContext, actionWindows) {
  const sources = [];
  const edges = graphContext.incomingByActionId.get(actionId) || [];

  for (const edge of edges) {
    if (!isEntityTargetHandle(edge.targetHandle)) continue;
    const sourceWindow = outputWindowForHandle(actionWindows.get(edge.sourceActionId), edge.sourceHandle);
    if (!sourceWindow?.status) continue;
    if (entityType && sourceWindow.entityType && sourceWindow.entityType !== entityType) continue;
    sources.push({ status: sourceWindow.status, window: sourceWindow });
  }

  const fallbackStatus = action.status?.from
    || action.access?.statusFrom
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
      icon: definition.icon || '',
      ...(definition.lifecycle ? { lifecycle: clonePlain(definition.lifecycle) } : {})
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

function compileAssignmentAccess({ assignment = {}, roles = {}, screens = {}, domain = {} } = {}) {
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
  const homeScreen = compileHomeScreenForAssignment({ assignment, screens: screensList, domain });
  const userScreens = homeScreen ? [homeScreen, ...screensList] : screensList;
  const screenNavigation = userScreens.map(screenToNavigation);
  return {
    roleIds,
    permissions,
    navigation: dedupeNavigation(screenNavigation),
    screens: userScreens,
    actions: [...actionMap.values()],
    incompleteBindings
  };
}

function compileHomeScreenForAssignment({ assignment = {}, screens = [], domain = {} } = {}) {
  const sections = topLevelHomeSections(screens, domain);
  if (!sections.length) return null;
  const screenKey = `home_${assignment.userId || assignment.id || 'user'}`;
  return {
    id: screenKey,
    screenKey,
    label: 'Home',
    kind: 'home',
    template: 'home',
    placement: 'home',
    route: generatedScreenRoute(screenKey),
    sourceRoute: generatedScreenRoute(screenKey),
    roleIds: assignment.roleIds || [],
    sources: sections.map(section => ({
      id: section.sourceId,
      label: section.label,
      entityType: section.entityType,
      mode: 'list',
      required: section.required || null,
      filters: section.filters || {},
      rootLineageKeys: section.rootLineageKeys || []
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

function topLevelHomeSections(screens = [], domain = {}) {
  const listScreens = screens.filter(screen => screen.template === 'entityList' && screen.entityType && screen.sources?.some(source => source.mode === 'list'));
  const sectionsByEntity = new Map();
  for (const screen of listScreens) {
    if (sectionsByEntity.has(screen.entityType)) {
      const existing = sectionsByEntity.get(screen.entityType);
      existing.actions = [...new Set([...(existing.actions || []), ...(screen.actions || [])])];
      continue;
    }
    const source = screen.sources.find(item => item.mode === 'list') || {};
    sectionsByEntity.set(screen.entityType, {
      entityType: screen.entityType,
      sourceId: `home_${screen.entityType}`,
      label: screen.label || screen.entityType,
      required: source.required || screen.required || null,
      filters: source.filters || {},
      rootLineageKeys: source.rootLineageKeys || [],
      actions: screen.actions || [],
      screenKey: screen.screenKey,
      route: screen.route
    });
  }
  return [...sectionsByEntity.values()];
}

function compileRoles(process = {}, domain = {}) {
  const graphContext = buildActionGraphContext(process);
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
    const exposedRoleIds = actionExposureRoleIds(action, access, actionWindow);
    for (const roleId of exposedRoleIds) {
      if (!roles[roleId]) continue;
      const feature = exposedActionFeature(action, actionWindow, access, domain);
      const parentEntityType = effectiveActionParentEntityType(action, domain, graphContext.parentIncomingByActionId.get(actionId));
      const resolvedEntityType = action.entityType || action.inputs?.find(input => input.entityType)?.entityType || actionWindow?.outputs?.[0]?.entityType || null;
      const exposedAction = resolvedEntityType && !action.entityType ? { ...action, entityType: resolvedEntityType } : action;
      const inputs = actionInputsForExposure(exposedAction, parentEntityType, domain).map(input => (
        input.id === 'entity' && !input.entityType && resolvedEntityType ? { ...input, entityType: resolvedEntityType } : input
      ));
      const outputs = action.outputs || [];
      roles[roleId].actions.push({
        actionId: action.id || actionId,
        label: displayActionLabel(action, actionId, process),
        level: 'run',
        actionKind: action.actionKind || 'createEntity',
        commandId: action.commandId || null,
        feature,
        entityType: resolvedEntityType,
        parentEntityType: parentEntityType || null,
        parentRevision: normalizeParentRevision(action.parentRevision, parentEntityType, domain),
        status: actionStatusForExposure(action, actionWindow, access, process),
        construction: normalizeConstruction(action.construction, action.entityType, domain),
        inputPolicy: normalizeActionInputPolicy(action.inputPolicy, action.construction, action.entityType, domain),
        inputs,
        outputs,
        contracts: compileActionEntityContracts(exposedAction, inputs, outputs, actionWindow, domain)
      });
    }
  }
  return roles;
}

function exposedActionFeature(action = {}, actionWindow = null, access = {}, domain = {}) {
  const kind = action.actionKind || 'createEntity';
  if (kind === 'runCommand' && actionWindow?.input?.feature) {
    return actionWindow.input.feature;
  }
  return actionWindow?.primaryGrant?.feature || grantFromAction(action, access, domain)?.feature || null;
}

function actionExposureRoleIds(action = {}, access = {}, actionWindow = null) {
  const kind = action.actionKind || 'createEntity';
  if (kind === 'updateEntity' && actionTargetState(action)) {
    const executable = executableRoleIdsForWindow(actionWindow?.input, access);
    if (executable.length) return [...new Set(executable)];
  }
  const explicitGrants = access.grants?.length ? access.grants : grantsFromRoleIds(access.roleIds || [], access.level);
  const explicit = explicitGrants
    .filter(grant => ACCESS_ORDER[normalizeAccessLevel(grant.level)] >= ACCESS_ORDER.write)
    .map(grant => grant.roleId)
    .filter(Boolean);
  if (explicit.length) return explicit;
  return [...new Set((actionWindow?.outputs || []).flatMap(output => {
    const grants = output.roleGrants || grantsFromRoleIds(output.roleIds || [], output.level || access.level);
    return grants
      .filter(grant => ACCESS_ORDER[normalizeAccessLevel(grant.level)] >= ACCESS_ORDER.write)
      .map(grant => grant.roleId);
  }))];
}

function actionExposureRoleIdsForInput(action = {}, access = {}, inputWindow = null) {
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

function actionStatusForExposure(action = {}, actionWindow = null, access = {}, process = {}) {
  const status = compileActionStatus(action, process);
  const inputStatus = actionWindow?.input?.status || '';
  if (!status.from && inputStatus) status.from = inputStatus;
  const targetStatus = actionTargetState(action, process) || access.statusTo || actionWindow?.outputs?.[0]?.status || '';
  if (!status.to && targetStatus) status.to = targetStatus;
  return status;
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
  if (action.actionKind === 'updateEntity' && actionTargetState(action)) {
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
      if (parentOutput?.entityType) {
        parentIncomingByActionId.set(targetActionId, {
          entityType: parentOutput.entityType,
          status: parentOutput.status || '',
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

function isEntityTargetHandle(targetHandle = '') {
  const handle = String(targetHandle || '');
  return !handle || handle === 'input' || handle === 'entity' || handle === 'input:entity' || handle.endsWith(':entity');
}

function actionOutputForHandle(action = {}, sourceHandle = '') {
  const outputs = action?.outputs || [];
  if (!outputs.length) return null;
  if (!sourceHandle || sourceHandle === 'output') return outputs.find(output => output.entityType) || outputs[0] || null;
  const id = String(sourceHandle).replace(/^output:/, '');
  return outputs.find(output => output.id === id || output.handleId === sourceHandle)
    || outputs.find(output => output.entityType)
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
  const input = action.inputs?.find(item => item.entityType);
  if (!input) return null;
  return {
    entityType: input.entityType,
    status: input.status || '',
    level: normalizeActionAccess(action.access).level,
    roleIds: [],
    roleGrants: [],
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
  const inheritedRoleGrants = incoming?.roleGrants || grantsFromRoleIds(incoming?.roleIds || [], incoming?.level || access.level);
  const explicitRoleGrants = access.grants || grantsFromRoleIds(access.roleIds || [], access.level);
  const hasExplicitRoleGrants = hasExplicitActionRoleGrants(action.access);
  const useInherited = inheritedRoleGrants.length && (
    (kind === 'updateEntity' && Boolean(actionTargetState(action, process)) && !access.modified) ||
    (kind === 'runCommand' && !hasExplicitRoleGrants && !access.modified)
  );
  const roleGrants = useInherited ? inheritedRoleGrants : explicitRoleGrants;
  const roleIds = [...new Set(roleGrants.map(grant => grant.roleId).filter(Boolean))];
  const level = maxGrantLevel(roleGrants, useInherited ? (incoming.level || access.level) : access.level);
  const scope = deriveActionWindowScope(action, incoming, domain);
  const outputs = [];
  const grants = [];

  if (['createEntity', 'updateEntity'].includes(kind) && feature && entityType) {
    const status = kind === 'updateEntity'
      ? (actionTargetState(action, process) || incoming?.status || action.inputs?.find(input => input.status)?.status || '')
      : statusTo;
    const window = {
      id: outputSocketId(action, kind),
      handleId: outputHandleId(action, kind),
      entityType,
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
    const commandOutputs = commandOutputEntityTypes(domain, action.commandId);
    for (const outputEntityType of commandOutputs) {
      const outputFeature = resolveEntityFeature(domain, outputEntityType);
      if (!outputFeature) continue;
      const outputScope = deriveCommandOutputScope(outputEntityType, incoming, domain);
      const window = {
        id: outputEntityType,
        handleId: `output:${outputEntityType}`,
        entityType: outputEntityType,
        feature: outputFeature,
        status: '',
        level,
        roleIds,
        roleGrants,
        scope: outputScope,
        sourcePath: [incoming?.sourcePath, actionId, outputEntityType].filter(Boolean).join('>')
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

function effectiveActionParentEntityType(action = {}, domain = {}, incoming = null) {
  const entityType = action.entityType || action.outputs?.find(output => output.entityType)?.entityType || '';
  const candidates = [
    incoming?.parentInput ? incoming.entityType : '',
    action.parentEntityType,
    action.inputs?.find(input => input.id === 'parent' && input.entityType)?.entityType,
    !incoming?.parentInput ? incoming?.entityType : ''
  ].filter(Boolean);

  for (const parentType of candidates) {
    if (parentType === entityType && !parentRelationForChild(domain, entityType, parentType)) continue;
    if (!parentSupportedByDomain(domain, entityType, parentType)) continue;
    return parentType;
  }
  return '';
}

function parentSupportedByDomain(domain = {}, entityType = '', parentType = '') {
  if (!entityType || !parentType) return false;
  return Boolean(parentRelationForChild(domain, entityType, parentType));
}

function actionInputsForExposure(action = {}, parentEntityType = '', domain = {}) {
  if (action.actionKind === 'runCommand') {
    return commandActionInputs(domain.commands?.[action.commandId] || {});
  }
  if ((action.actionKind || 'createEntity') !== 'createEntity') return action.inputs || [];
  const inputs = (action.inputs || []).map(input => {
    if (input.id !== 'parent') return input;
    return {
      ...input,
      label: parentEntityType || 'Parent entity',
      entityType: parentEntityType || '',
      required: Boolean(parentEntityType),
      status: parentEntityType ? input.status || '' : ''
    };
  });
  if (parentEntityType && !inputs.some(input => input.id === 'parent')) {
    inputs.unshift({
      id: 'parent',
      label: parentEntityType,
      entityType: parentEntityType,
      required: true
    });
  }
  const construction = normalizeConstruction(action.construction, action.entityType, domain);
  const constructionInputs = new Map((construction.inputs || []).map(input => [input.id || input.path, input]));
  return inputs.map(input => {
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
      entityType: input.type || '',
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
        entityType: input.type,
        kind: 'entity',
        required: Boolean(input.required),
        prompt: true,
        path: `entities.${input.name || input.type}`
      })),
    ...(command.input?.parameters || []).map(input => ({
      id: input.name,
      label: input.label || input.name,
      kind: input.type === 'object' ? 'json' : input.type || 'data',
      type: input.type || 'string',
      options: input.options || [],
      default: input.default ?? null,
      required: Boolean(input.required),
      prompt: input.display !== 'hidden',
      path: `parameters.${input.name}`,
      dataPath: `parameters.${input.name}`,
      entityType: input.entityType || '',
      editor: input.editor || '',
      templateFieldId: input.templateFieldId || ''
    }))
  ];
}

function deriveActionWindowScope(action = {}, incoming = null, domain = {}) {
  const access = normalizeActionAccess(action.access);
  if (access.scope) return { ...access.scope };
  const inheritedScope = incoming?.scope ? { ...incoming.scope } : null;
  if ((action.actionKind || 'createEntity') !== 'createEntity') return inheritedScope;
  const parentType = effectiveActionParentEntityType(action, domain, incoming);
  if (!parentType || !incoming) return inheritedScope;
  const parentKey = `${parentType}Id`;
  if (inheritedScope?.entityId && !inheritedScope[parentKey]) {
    const { entityId, ...lineageScope } = inheritedScope;
    return { ...lineageScope, [parentKey]: entityId };
  }
  return inheritedScope;
}

function commandOutputEntityTypes(domain = {}, commandId = '') {
  const output = domain.commands?.[commandId]?.output || {};
  return [...new Set(output.entities || [])].filter(Boolean);
}

function deriveCommandOutputScope(outputEntityType = '', incoming = null, domain = {}) {
  const inheritedScope = incoming?.scope ? { ...incoming.scope } : null;
  if (!incoming?.entityType) return inheritedScope;
  const relation = parentRelationForChild(domain, outputEntityType, incoming.entityType);
  if (!relation) return inheritedScope;
  if (inheritedScope?.entityId && !inheritedScope[relation.lineageKey]) {
    const { entityId, ...lineageScope } = inheritedScope;
    return { ...lineageScope, [relation.lineageKey]: entityId };
  }
  return inheritedScope;
}

function windowGrants(window = {}, action = {}, access = {}) {
  const byLevel = new Map();
  for (const roleGrant of window.roleGrants || grantsFromRoleIds(window.roleIds || [], window.level)) {
    if (!roleGrant.roleId) continue;
    const level = normalizeAccessLevel(roleGrant.level || window.level);
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(roleGrant.roleId);
  }
  return [...byLevel.entries()].map(([level, roleIds]) => windowGrant(window, action, access, level, [...new Set(roleIds)]));
}

function windowGrant(window = {}, action = {}, access = {}, level = window.level, roleIds = window.roleIds || []) {
  const grant = {
    feature: window.feature,
    level: normalizeAccessLevel(level || window.level || 'read'),
    roleIds,
    sourceActionId: action.id,
    sourcePath: window.sourcePath
  };
  if (window.scope) grant.scope = window.scope;
  if (window.status) grant.rule = { fact: 'primaryStatus', equals: window.status };
  if ((action.actionKind || 'createEntity') === 'updateEntity' && actionTargetState(action)) {
    const from = access.statusFrom || action.status?.from || '';
    const to = access.statusTo || action.status?.to || window.status || '';
    if (from || to) grant.transitions = [{ from: from || undefined, to: to || undefined }];
  }
  return grant;
}

function resolveEntityFeature(domain = {}, entityType) {
  const entity = (domain.entities || []).find(item => item.type === entityType);
  if (entity?.collection) return entity.collection;
  const fieldPolicy = getFieldPolicy(domain.fieldAccess || {}, entityType);
  if (fieldPolicy?.feature) return fieldPolicy.feature;
  return entityType;
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
    entityProfiles: processOrScreens.entityProfiles || {},
    actions: processOrScreens.actions || {},
    graph: processOrScreens.graph || {}
  });
  return Object.fromEntries(Object.entries({ ...screens, ...inferredScreens }).map(([id, screen]) => {
    const normalized = normalizeScreenContract(screen);
    const sources = normalized.sources.map(source => withRootEntityScope(source, normalized, domain));
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
      sources,
      regions: normalized.regions,
      actions: normalized.actions || []
    }];
  }));
}

function withRootEntityScope(source = {}, screen = {}, domain = {}) {
  if (screen.template !== 'entityList' || source.mode !== 'list' || source.entityType !== screen.entityType) return source;
  const lineageKeys = [...new Set((domain.containment || [])
    .filter(relation => relation.childType === source.entityType && relation.lineageKey)
    .map(relation => relation.lineageKey))];
  if (!lineageKeys.length || lineageKeys.some(key => hasScopedFilter(source.filters, key))) return source;
  return { ...source, rootLineageKeys: lineageKeys };
}

function hasScopedFilter(filters = {}, lineageKey = '') {
  return Object.prototype.hasOwnProperty.call(filters || {}, lineageKey)
    || Object.prototype.hasOwnProperty.call(filters || {}, `lineage.${lineageKey}`);
}

function inferScreensFromRoleGrants({ screens = {}, roles = {}, domain = {}, entityProfiles = {}, actions = {}, graph = {} } = {}) {
  const inferred = {};
  const graphContext = buildActionGraphContext({ actions, graph });
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
      const detailId = `${id}_detail`;
      const required = aggregateScreenRequirement(feature, grants);
      const directActions = inferredScreenActions(role.actions || [], feature);
      const detailDirectActions = inferredDetailScreenActions(role.actions || [], feature);
      const childRegions = childRegionsForParentDetail({
        role,
        parentEntityType: entityType,
        domain,
        actions,
        graphContext
      });
      const contextualActions = contextualParentActions(role.actions || [], entityType, domain, actions, graphContext);
      inferred[id] = {
        id,
        label: `${role.label || roleId} ${entityType}`,
        kind: 'entityList',
        template: 'entityList',
        placement: 'hub',
        entityType,
        required,
        roleIds: [roleId],
        actions: directActions
      };
      inferred[detailId] = {
        id: detailId,
        label: `${role.label || roleId} ${entityType} detail`,
        kind: 'entityDetail',
        template: 'entityDetail',
        placement: 'detail',
        entityType,
        required,
        roleIds: [roleId],
        sources: [{
          id: entityType,
          entityType,
          mode: 'single',
          required,
          identifier: '$screen.scope.entityId'
        }, ...childRegions.sources],
        regions: [{
          id: 'main',
          slot: 'main',
          sourceId: entityType,
          surface: 'detail',
          actions: [...new Set([...detailDirectActions, ...contextualActions])]
        }, ...childRegions.regions],
        actions: [...new Set([...detailDirectActions, ...contextualActions, ...childRegions.actionIds])]
      };
      existingKeys.add(`${roleId}:${feature}`);
    }
  }

  return inferred;
}

function inferredScreenActions(roleActions = [], feature) {
  return roleActions
    .filter(action => action.feature === feature)
    .map(action => action.actionId);
}

function inferredDetailScreenActions(roleActions = [], feature) {
  return roleActions
    .filter(action => action.feature === feature)
    .filter(action => (action.actionKind || 'createEntity') !== 'createEntity')
    .map(action => action.actionId);
}

function contextualParentActions(roleActions = [], parentEntityType = '', domain = {}, processActions = {}, graphContext = buildActionGraphContext({ actions: processActions })) {
  return roleActions
    .filter((roleAction) => {
      const actionId = roleAction.actionId || roleAction.id;
      const processAction = processActions[actionId] || {};
      const parentIncoming = graphContext.parentIncomingByActionId.get(actionId);
      if (!isParentBoundCreateAction(roleAction, processAction, domain, parentIncoming)) return false;
      const actionParent = effectiveActionParentEntityType({ ...processAction, ...roleAction }, domain, parentIncoming);
      if (actionParent !== parentEntityType) return false;
      const childEntityType = roleAction.entityType || processAction.entityType || '';
      return !parentRelationForChild(domain, childEntityType, parentEntityType);
    })
    .map(action => action.actionId);
}

function isParentBoundCreateAction(roleAction = {}, processAction = {}, domain = {}, parentIncoming = null) {
  const kind = roleAction.actionKind || processAction.actionKind || 'createEntity';
  const parentEntityType = effectiveActionParentEntityType({ ...processAction, ...roleAction }, domain, parentIncoming);
  return kind === 'createEntity' && Boolean(parentEntityType);
}

function childRegionsForParentDetail({ role = {}, parentEntityType = '', domain = {}, actions = {}, graphContext = buildActionGraphContext({ actions }) } = {}) {
  const sourcesByEntity = new Map();
  const regions = [];
  const actionIds = [];
  const grantsByFeature = groupGrantsByFeature(role.grants || []);

  for (const relation of domain.containment || []) {
    if (relation.parentType !== parentEntityType || !relation.childType || !relation.lineageKey) continue;
    const childFeature = featureFromEntityType(domain, relation.childType);
    if (!childFeature) continue;
    const childGrants = grantsByFeature.get(childFeature) || [];
    if (!childGrants.length) continue;
    ensureChildRegion({
      sourcesByEntity,
      regions,
      childEntityType: relation.childType,
      childFeature,
      childGrants,
      parentIdKey: relation.lineageKey
    });
  }

  for (const action of role.actions || []) {
    const actionId = action.actionId || action.id;
    const processAction = actions[actionId] || {};
    const kind = action.actionKind || processAction.actionKind || 'createEntity';
    const actionParent = effectiveActionParentEntityType({ ...processAction, ...action }, domain, graphContext.parentIncomingByActionId.get(actionId));
    if (kind !== 'createEntity' || actionParent !== parentEntityType) continue;
    const childEntityType = action.entityType || processAction.entityType || '';
    if (!childEntityType) continue;
    const parentRelation = parentRelationForChild(domain, childEntityType, parentEntityType);
    if (!parentRelation) continue;
    const childFeature = featureFromEntityType(domain, childEntityType);
    if (!childFeature) continue;
    const childGrants = grantsByFeature.get(childFeature) || [];
    const region = ensureChildRegion({
      sourcesByEntity,
      regions,
      childEntityType,
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

function ensureChildRegion({ sourcesByEntity, regions, childEntityType, childFeature, childGrants = [], parentIdKey } = {}) {
  const sourceId = `${childEntityType}_children`;
  if (!sourcesByEntity.has(sourceId)) {
    sourcesByEntity.set(sourceId, {
      id: sourceId,
      label: childEntityType,
      entityType: childEntityType,
      mode: 'list',
      required: aggregateScreenRequirement(childFeature, childGrants),
      filters: { [parentIdKey]: '$screen.scope.entityId' }
    });
  }
  let region = regions.find(item => item.sourceId === sourceId);
  if (!region) {
    region = {
      id: `${sourceId}_region`,
      slot: 'main',
      sourceId,
      surface: 'card',
      actions: []
    };
    regions.push(region);
  }
  return region;
}

function parentRelationForChild(domain = {}, childEntityType = '', parentEntityType = '') {
  return (domain.containment || []).find(relation => (
    relation.childType === childEntityType
    && (!parentEntityType || relation.parentType === parentEntityType)
    && relation.lineageKey
  )) || null;
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
      level: 'read',
      scope: grant.scope,
      transitions: grant.transitions,
      rule: grant.rule
    };
  }
  const rules = grants.map(grant => grant.rule).filter(Boolean);
  const scopes = grants.map(grant => grant.scope).filter(Boolean);
  return {
    feature,
    level: 'read',
    ...(rules.length ? { rule: { any: rules } } : {}),
    ...(scopes.length === 1 ? { scope: scopes[0] } : {})
  };
}

function entityTypeFromFeature(domain = {}, feature) {
  return (domain.entities || []).find(entity => !entity.meta && (
    entity.collection === feature ||
    entity.type === feature ||
    `${entity.type}s` === feature
  ))?.type || null;
}

function entityTypeFromProfiles(entityProfiles = {}, domain = {}, feature) {
  const entityType = Object.values(entityProfiles)
    .find(profile => resolveEntityFeature(domain, profile.entityType) === feature)
    ?.entityType || null;
  const definition = (domain.entities || []).find(entity => entity.type === entityType);
  return definition?.meta ? null : entityType;
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
  if (!String(screen.id || '').startsWith('auto_') || !screen.entityType) return screen.screenKey || screen.id;
  const suffix = screen.template === 'entityDetail' ? '_detail' : '';
  const scopeValues = Object.values(screen.scope || {}).filter(value => value !== undefined && value !== null && value !== '');
  return [`auto_${screen.entityType}${suffix}`, ...scopeValues].filter(Boolean).map(String).join(':');
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
    source.entityType || source.id,
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

function compileFieldPolicies(entityProfiles = {}, domain = {}) {
  const policies = {};
  for (const profile of Object.values(entityProfiles)) {
    policies[profile.entityType] = {
      read: profile.fields?.read || [],
      write: profile.fields?.write || [],
      private: profile.fields?.private || [],
      relations: (domain.relations || []).filter(relation => (
        relation.ownerType === profile.entityType && (profile.relations || []).includes(relation.key)
      ))
    };
  }
  return policies;
}

function compileServices(services = {}) {
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

function compileActions(actions = {}, process = {}, domain = {}) {
  const graphContext = buildActionGraphContext(process);
  const actionWindows = compileActionAccessWindows(process, domain);
  return Object.fromEntries(Object.entries(actions).map(([id, action]) => {
    const parentEntityType = effectiveActionParentEntityType(action, domain, graphContext.parentIncomingByActionId.get(id));
    const actionWindow = actionWindows.get(id);
    const resolvedEntityType = actionEntityType(action) || actionWindow?.input?.entityType || actionWindow?.outputs?.[0]?.entityType || null;
    const normalizedAction = resolvedEntityType && !action.entityType ? { ...action, entityType: resolvedEntityType } : action;
    const inputs = actionInputsForExposure(normalizedAction, parentEntityType, domain).map(input => (
      input.id === 'entity' && !input.entityType && resolvedEntityType ? { ...input, entityType: resolvedEntityType } : input
    ));
    const outputs = action.outputs || [];
    return [id, {
      id: action.id || id,
      label: displayActionLabel(action, id, process),
      actionKind: action.actionKind || 'createEntity',
      entityType: resolvedEntityType,
      parentEntityType: parentEntityType || null,
      parentRevision: normalizeParentRevision(action.parentRevision, parentEntityType, domain),
      commandId: action.commandId || null,
      status: compileActionStatus(action, process),
      mutation: action.mutation || { fields: [] },
      projection: action.projection || null,
      construction: normalizeConstruction(action.construction, action.entityType, domain),
      inputPolicy: normalizeActionInputPolicy(action.inputPolicy, action.construction, action.entityType, domain),
      statusRef: action.statusRef || null,
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

function compileActionEntityContracts(action = {}, inputs = [], outputs = [], actionWindow = null, domain = {}) {
  const inputContracts = inputs
    .filter(input => input.entityType)
    .map(input => ({
      id: input.id || 'entity',
      kind: input.multiple ? 'entity_list' : 'entity',
      entityType: input.entityType,
      required: input.required !== false,
      status: input.status || null,
      relationKey: input.relationKey || null,
      cardinality: input.cardinality || null
    }));
  const outputContracts = outputs
    .filter(output => output.entityType)
    .map(output => ({
      id: output.id || 'entity',
      kind: output.multiple ? 'entity_list' : 'entity',
      entityType: output.entityType,
      status: output.status || null
    }));
  const entityType = actionEntityType(action);
  if (action.actionKind === 'createEntity' && entityType && !outputContracts.some(contract => contract.entityType === entityType)) {
    outputContracts.push({ id: 'created', kind: 'entity', entityType, status: actionTargetState(action) || null });
  }
  if (action.actionKind === 'updateEntity' && entityType) {
    if (!inputContracts.some(contract => contract.entityType === entityType)) {
      inputContracts.unshift({ id: 'entity', kind: 'entity', entityType, required: true, status: actionWindow?.input?.status || null });
    }
    if (!outputContracts.some(contract => contract.entityType === entityType)) {
      outputContracts.push({ id: 'entity', kind: 'entity', entityType, status: actionTargetState(action) || actionWindow?.outputs?.[0]?.status || null });
    }
  }
  if (action.actionKind === 'runCommand') {
    for (const outputType of commandOutputEntityTypes(domain, action.commandId)) {
      if (!outputContracts.some(contract => contract.entityType === outputType)) {
        outputContracts.push({ id: outputType, kind: 'entity_list', entityType: outputType, status: null });
      }
    }
  }
  return { inputs: inputContracts, outputs: outputContracts };
}

function compileActionStatus(action = {}, process = {}) {
  const target = actionTargetState(action, process);
  const metadata = action.statusRef ? statusDefinitionMetadata(process.statusDefinitions?.[action.statusRef]) : {};
  return {
    ...(action.status || {}),
    ...metadata,
    ...(target ? { to: target } : {})
  };
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

function statusDefinitionMetadata(definition = {}) {
  if (!definition) return {};
  return {
    ...(definition.label ? { label: definition.label } : {}),
    ...(definition.color || definition.severity ? { color: definition.color || definition.severity } : {}),
    ...(definition.severity || definition.color ? { severity: definition.severity || definition.color } : {}),
    ...(definition.icon ? { icon: definition.icon } : {})
  };
}

function compileStatusDefinitions(statusDefinitions = {}) {
  return Object.fromEntries(Object.entries(statusDefinitions).map(([id, definition]) => [id, {
    id: definition.id || id,
    entityType: definition.entityType || '',
    statusId: definition.statusId || definition.id || id,
    label: definition.label || definition.statusId || id,
    color: definition.color || '',
    severity: definition.severity || definition.color || '',
    icon: definition.icon || '',
    ...(definition.lifecycle ? { lifecycle: clonePlain(definition.lifecycle) } : {})
  }]));
}

function compileValueInputs(valueInputs = {}) {
  return Object.fromEntries(Object.entries(valueInputs).map(([id, input]) => [id, {
    id: input.id || id,
    label: input.label || input.id || id,
    valueType: input.valueType || 'string',
    structure: input.structure || 'item',
    value: input.value ?? '',
    icon: input.icon || ''
  }]));
}

function compileProcessNodes(processNodes = {}) {
  return Object.fromEntries(Object.entries(processNodes).map(([id, node]) => [id, {
    id: node.id || id,
    label: node.label || node.kind || id,
    kind: node.kind || 'entityDecompose',
    mode: node.mode || '',
    entityType: node.entityType || '',
    relationEntityType: node.relationEntityType || '',
    relationKey: node.relationKey || '',
    relationCardinality: node.relationCardinality || '',
    block: node.block || '',
    path: node.path || '',
    valueType: node.valueType || '',
    structure: node.structure || 'item',
    operation: node.operation || '',
    template: node.template || '',
    inputs: Array.isArray(node.inputs) ? node.inputs.map(input => ({ ...input })) : [],
    outputs: Array.isArray(node.outputs) ? node.outputs.map(output => ({ ...output })) : []
  }]));
}

function normalizeConstruction(construction = {}, entityType = '', domain = {}) {
  const contract = constructionContract(domain, entityType);
  const requestedMode = construction.mode || contract.defaultMode || defaultConstructionMode(entityType);
  const modes = Array.isArray(contract.modes) ? contract.modes : [];
  const mode = modes.includes(requestedMode)
    ? requestedMode
    : (contract.defaultMode || modes[0] || defaultConstructionMode(entityType));
  const declaredInputs = Array.isArray(construction.inputs) ? construction.inputs : [];
  const contractInputs = contract.modeInputs?.[mode] || contract.inputs || [];
  const inputsById = new Map(contractInputs.map(input => [input.id || input.path, { ...input }]));
  for (const input of declaredInputs) {
    const key = input.id || input.path;
    const contractInput = inputsById.get(key);
    inputsById.set(key, contractInput
      ? mergeConstructionInput(contractInput, input)
      : { ...input }
    );
  }
  return {
    mode,
    inputs: [...inputsById.values()]
  };
}

function normalizeParentRevision(parentRevision = {}, parentEntityType = '', domain = {}) {
  const contract = domain.revisions?.[parentEntityType] || {};
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
    default: declaredInput.default ?? contractInput.default,
    value: declaredInput.value ?? contractInput.value,
    prompt: declaredInput.prompt ?? contractInput.prompt
  };
}

function normalizeInputPolicy(inputPolicy = {}) {
  return {
    prompt: inputPolicy.prompt !== false,
    fields: Array.isArray(inputPolicy.fields) ? inputPolicy.fields : []
  };
}

function normalizeActionInputPolicy(inputPolicy = {}, construction = {}, entityType = '', domain = {}) {
  const normalizedConstruction = normalizeConstruction(construction, entityType, domain);
  const policyFields = Array.isArray(inputPolicy.fields) ? inputPolicy.fields : [];
  const fieldsById = new Map(
    normalizedConstruction.inputs
      .filter(input => input.prompt || input.required)
      .map(input => [input.id || input.path, { ...input }])
  );
  for (const field of policyFields) {
    const key = field.id || field.path;
    const constructionField = normalizedConstruction.inputs.find(input => (input.id || input.path) === key);
    const merged = constructionField
      ? mergeConstructionInput(constructionField, field)
      : {
          ...(fieldsById.get(key) || {}),
          ...field
        };
    if (merged.prompt || merged.required || !constructionField) fieldsById.set(key, merged);
    else fieldsById.delete(key);
  }
  const fields = [...fieldsById.values()];
  return {
    prompt: inputPolicy.prompt !== false && fields.some(field => field.prompt || field.required),
    fields
  };
}

function defaultConstructionMode() {
  return 'genericCreate';
}

function displayActionLabel(action = {}, id = '', process = {}) {
  const explicit = String(action.label || '').trim();
  if (explicit && !isGenericActionLabel(explicit, action.actionKind)) return explicit;

  const entityType = action.entityType
    || action.inputs?.find(input => input.entityType)?.entityType
    || action.outputs?.find(output => output.entityType)?.entityType
    || '';
  if ((action.actionKind || 'createEntity') === 'createEntity') {
    return ['Create', entityTypeLabel(entityType), action.status?.to].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'updateEntity') {
    if (actionTargetState(action, process)) return statusTargetLabel(action, process) || ['Move', entityTypeLabel(entityType), action.status?.to].filter(Boolean).join(' ');
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

function statusTargetLabel(action = {}, process = {}) {
  const referenced = action.statusRef ? process.statusDefinitions?.[action.statusRef] : null;
  return referenced?.label
    || referenced?.statusId
    || action.status?.label
    || action.status?.to
    || action.access?.statusTo
    || action.outputs?.find(output => output.status)?.status
    || '';
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
  const level = normalizeAccessLevel(access.level);
  const grants = Array.isArray(access.grants)
    ? access.grants
        .filter(grant => grant?.roleId)
        .map(grant => ({ roleId: grant.roleId, level: normalizeAccessLevel(grant.level || level) }))
    : grantsFromRoleIds(Array.isArray(access.roleIds) ? access.roleIds : [], level);
  return {
    level: maxGrantLevel(grants, level),
    roleIds: [...new Set(grants.map(grant => grant.roleId))],
    grants,
    modified: Boolean(access.modified),
    scope: access.scope && typeof access.scope === 'object' && !Array.isArray(access.scope) ? { ...access.scope } : null,
    statusFrom: typeof access.statusFrom === 'string' ? access.statusFrom : '',
    statusTo: typeof access.statusTo === 'string' ? access.statusTo : ''
  };
}

function normalizeAccessLevel(level) {
  return ['read', 'write', 'admin'].includes(level) ? level : 'write';
}

function validateAction(actionId, action = {}, { entities, commands, roles, domain, errors, statusDefinitions = {}, process = {} }) {
  const kind = action.actionKind || 'createEntity';
  const normalizedAccess = normalizeActionAccess(action.access);
  if (!['createEntity', 'updateEntity', 'runCommand', 'sendToOrganization'].includes(kind)) {
    errors.push(`Action ${actionId} uses unknown action kind ${kind}`);
    return;
  }
  if (kind === 'runCommand') {
    if (!action.commandId) errors.push(`Action ${actionId} must select a command`);
    if (action.commandId && !commands.has(action.commandId)) errors.push(`Action ${actionId} uses unknown command ${action.commandId}`);
  } else if (kind !== 'updateEntity') {
    if (!action.entityType) errors.push(`Action ${actionId} must select an entity type`);
    if (action.entityType && !entities.has(action.entityType)) errors.push(`Action ${actionId} uses unknown entity type ${action.entityType}`);
  }
  if (action.parentEntityType && !entities.has(action.parentEntityType)) {
    errors.push(`Action ${actionId} uses unknown parent entity type ${action.parentEntityType}`);
  }
  const hasTargetStatus = Boolean(action.status?.to || (action.statusRef && statusDefinitions[action.statusRef]));
  if (kind === 'createEntity' && !hasTargetStatus) {
    errors.push(`Action ${actionId} must define target status`);
  }
  if (kind === 'createEntity') {
    validateConstruction(actionId, action, domain, errors);
    validateParentRevision(actionId, action, domain, errors, process);
  }
  if (kind === 'updateEntity') {
    const entityType = action.inputs?.find(input => input.entityType)?.entityType || action.entityType || inferConnectedActionEntityType(actionId, process);
    if (!entityType) errors.push(`Action ${actionId} must receive an entity input`);
    if (entityType && !entities.has(entityType)) errors.push(`Action ${actionId} input uses unknown entity type ${entityType}`);
    validateFieldList(
      action.mutation?.fields,
      domain,
      entityType,
      `action ${actionId} update fields`,
      errors,
      normalizedAccess.level
    );
    validateMutationGrantLevels(actionId, action.mutation?.fields, domain, entityType, normalizedAccess.grants, errors);
    if (!(action.mutation?.fields || []).length && !hasTargetStatus) {
      errors.push(`Action ${actionId} must connect at least one writable field, relation, or status`);
    }
  }
  const canInheritAccess = kind === 'runCommand' && action.inputs?.some(input => input.entityType);
  if ((!action.access && !canInheritAccess) || !Array.isArray(normalizedAccess.grants) || !['read', 'write', 'admin'].includes(normalizedAccess.level)) {
    errors.push(`Action ${actionId} must define access grants`);
  }
  if (kind === 'sendToOrganization') {
    validateFieldList(action.projection?.fields, domain, action.entityType, `action ${actionId} projection fields`, errors);
    validateFieldList(action.projection?.excludeFields, domain, action.entityType, `action ${actionId} excluded fields`, errors);
  }
  const triggerMode = action.trigger?.mode || 'manual';
  if (!['manual', 'event'].includes(triggerMode)) {
    errors.push(`Action ${actionId} uses unknown trigger mode ${triggerMode}`);
  }
  for (const roleId of normalizedAccess.roleIds) {
    if (!roles[roleId]) errors.push(`Action ${actionId} references missing access role ${roleId}`);
  }
  if (action.statusRef && !statusDefinitions[action.statusRef]) {
    errors.push(`Action ${actionId} references missing status definition ${action.statusRef}`);
  }
}

function validateParentRevision(actionId, action = {}, domain = {}, errors = [], process = {}) {
  if (action.parentRevision?.enabled !== true) return;
  const graphContext = buildActionGraphContext(process);
  const parentEntityType = effectiveActionParentEntityType(action, domain, graphContext.parentIncomingByActionId.get(actionId));
  if (!parentEntityType) {
    errors.push(`Action ${actionId} cannot pin a revision without a declared containment parent`);
    return;
  }
  const contract = domain.revisions?.[parentEntityType];
  if (!contract?.scopes?.length) {
    errors.push(`Action ${actionId} cannot pin ${parentEntityType}; the entity has no revision contract`);
    return;
  }
  const scope = action.parentRevision.scope || contract.defaultScope;
  if (!contract.scopes.includes(scope)) {
    errors.push(`Action ${actionId} uses unknown ${parentEntityType} revision scope ${scope || '(empty)'}`);
  }
}

function inferConnectedActionEntityType(actionId, process = {}) {
  const actionNodeIds = new Set((process.graph?.nodes || [])
    .filter(node => node.type === 'action' && String(node.data?.refId || node.id) === String(actionId))
    .map(node => String(node.id)));
  for (const edge of process.graph?.edges || []) {
    if (!actionNodeIds.has(String(edge.target)) || !isEntityTargetHandle(edge.targetHandle)) continue;
    const sourceNode = (process.graph?.nodes || []).find(node => String(node.id) === String(edge.source));
    const sourceActionId = sourceNode?.type === 'action' ? String(sourceNode.data?.refId || sourceNode.id) : '';
    const sourceAction = process.actions?.[sourceActionId];
    const sourceType = sourceAction && actionEntityType(sourceAction);
    if (sourceType) return sourceType;
  }
  return '';
}

function validateProcessNode(nodeId, node = {}, { entities, domain, errors }) {
  const kind = node.kind || 'entityDecompose';
  const kinds = [
    'entityQuery', 'entityRef', 'entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityCompose', 'entityModify',
    'blockRead', 'blockCompose', 'blockModify',
    'cast', 'fallback', 'stringOp', 'compare', 'logic', 'entityCondition', 'predicateLogic', 'listLength'
  ];
  if (!kinds.includes(kind)) {
    errors.push(`Process node ${nodeId} uses unknown node kind ${kind}`);
    return;
  }
  for (const key of ['entityType', 'relationEntityType']) {
    if (node[key] && !entities.has(node[key])) {
      errors.push(`Process node ${nodeId} uses unknown ${key} ${node[key]}`);
    }
  }
  if ([
    'entityQuery', 'entityRef', 'entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityCompose', 'entityModify', 'entityCondition', 'predicateLogic',
    'blockRead', 'blockCompose', 'blockModify'
  ].includes(kind) && !node.entityType) {
    errors.push(`Process node ${nodeId} must select an entity type`);
  }
  if (['entityModify', 'blockRead', 'blockCompose', 'blockModify'].includes(kind) && !node.block) {
    errors.push(`Process node ${nodeId} must select a canonical block`);
  }
  if (node.block && ['entityModify', 'blockRead', 'blockCompose', 'blockModify'].includes(kind)
    && !entityBlocks(domain, node.entityType).includes(node.block)) {
    errors.push(`Process node ${nodeId} uses block ${node.block} outside ${node.entityType}`);
  }
  if (kind === 'entityRef' && node.mode === 'related') {
    const relation = (domain.relations || []).find(item => item.ownerType === node.entityType && item.key === node.relationKey);
    if (!relation) errors.push(`Process node ${nodeId} must select a declared relation for ${node.entityType}`);
    if (relation && node.relationEntityType && node.relationEntityType !== relation.targetType) {
      errors.push(`Process node ${nodeId} relation ${node.relationKey} must target ${relation.targetType}`);
    }
  }
  if (['entityField', 'blockRead', 'blockCompose', 'blockModify'].includes(kind) && !node.path) errors.push(`Process node ${nodeId} must define a field path`);
  if (node.path && ['entityField', 'blockRead'].includes(kind)) {
    validateFieldList([node.path], domain, node.entityType, `process node ${nodeId} field`, errors, 'read');
  }
  if (node.path && ['blockCompose', 'blockModify'].includes(kind)) {
    validateFieldList([node.path], domain, node.entityType, `process node ${nodeId} field`, errors, 'write');
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
    validateFieldList([node.path], domain, node.entityType, `process node ${nodeId} field`, errors, 'read');
  }
}

function validateProcessNodeConnections(process = {}, errors = []) {
  for (const graphNode of process.graph?.nodes || []) {
    if (graphNode.type !== 'processNode') continue;
    const nodeId = String(graphNode.data?.refId || graphNode.id || '');
    const record = process.processNodes?.[nodeId];
    if (!record) continue;
    const contract = resolveProcessNodePorts(record);
    const counts = new Map();
    for (const edge of (process.graph?.edges || []).filter(item => String(item.target) === String(graphNode.id))) {
      const handle = String(edge.targetHandle || '').replace(/^(input|data):/, '');
      const inputId = (!handle || handle === 'input') && contract.inputs.length === 1
        ? contract.inputs[0].id
        : handle;
      if (!inputId) continue;
      counts.set(inputId, (counts.get(inputId) || 0) + 1);
    }
    for (const input of contract.inputs) {
      if (input.required && !counts.has(input.id)) errors.push(`Process node ${nodeId} requires input ${input.id}`);
      if ((counts.get(input.id) || 0) > 1) errors.push(`Process node ${nodeId} input ${input.id} has more than one connected value`);
    }
  }
}

function validateConstruction(actionId, action = {}, domain = {}, errors = []) {
  const entityType = action.entityType || '';
  const contract = constructionContract(domain, entityType);
  const construction = normalizeConstruction(action.construction, entityType, domain);
  if (!contract.modes.includes(construction.mode)) {
    errors.push(`Action ${actionId} cannot create ${entityType} with construction mode ${construction.mode}`);
  }
  if (contract.derived && construction.mode === 'genericCreate') {
    errors.push(`Action ${actionId} must use a typed construction mode for derived entity ${entityType}`);
  }
  const contractInputs = contract.modeInputs?.[construction.mode] || contract.inputs || [];
  const requiredIds = new Set(contractInputs.filter(input => input.required).map(input => input.id));
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

function validateFieldList(fields = [], domain = {}, entityType, label, errors, access = 'read') {
  if (!Array.isArray(fields)) return;
  const policy = getFieldPolicy(domain.fieldAccess || {}, entityType);
  if (!policy) {
    if (fields.length) errors.push(`${label} cannot be checked because ${entityType} has no field-access policy`);
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

function validateMutationGrantLevels(actionId, fields = [], domain = {}, entityType = '', grants = [], errors = []) {
  const policy = getFieldPolicy(domain.fieldAccess || {}, entityType);
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

function getFieldPolicy(fieldAccess, entityType) {
  const key = String(entityType || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return fieldAccess[key] || fieldAccess[camel] || fieldAccess[snake] || null;
}

function entityBlocks(domain = {}, entityType = '') {
  const entity = (domain.entities || []).find(item => item.type === entityType);
  const policy = getFieldPolicy(domain.fieldAccess || {}, entityType) || {};
  const policyBlocks = ['read', 'write', 'admin']
    .flatMap(access => policy[access] || [])
    .map(path => String(path).split('.')[0])
    .filter(Boolean);
  return [...new Set([...(entity?.blocks || []), ...policyBlocks])];
}

function getByPath(source, path) {
  return String(path).split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
