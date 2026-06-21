import { normalizeWorkflow } from '../../workflows/src/index.js';

export const PROCESS_SCHEMA_VERSION = 1;
const ACCESS_ORDER = { none: 0, read: 1, write: 2, admin: 3 };

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
    graph: normalizeGraph(data.graph),
    roles: normalizeRecord(data.roles),
    entityProfiles: normalizeRecord(data.entityProfiles),
    actions: normalizeRecord(data.actions),
    services: normalizeRecord(data.services),
    sockets: normalizeRecord(data.sockets),
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
    for (const input of service.inputs || []) {
      if (input.entityType && !entities.has(input.entityType)) errors.push(`Service ${serviceId} input ${input.id} uses unknown entity type ${input.entityType}`);
    }
    for (const output of service.outputs || []) {
      if (output.entityType && !entities.has(output.entityType)) errors.push(`Service ${serviceId} output ${output.id} uses unknown entity type ${output.entityType}`);
    }
  }

  for (const [actionId, action] of Object.entries(process.actions)) {
    validateAction(actionId, action, { entities, commands, roles: process.roles, domain, errors });
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
  const workflows = {};
  for (const profile of Object.values(process.entityProfiles)) {
    workflows[profile.entityType] = compileLifecycle(profile, domain);
  }

  const userAccess = {};
  for (const [userId, assignment] of Object.entries(process.assignments)) {
    if (assignment.status && assignment.status !== 'active') continue;
    userAccess[userId] = compileAssignmentAccess({ assignment, roles: compiledRoles });
  }

  return {
    schemaVersion: PROCESS_SCHEMA_VERSION,
    activatedAt: new Date().toISOString(),
    roles: compiledRoles,
    userAccess,
    workflows,
    fieldPolicies: compileFieldPolicies(process.entityProfiles),
    actions: compileActions(process.actions),
    services: compileServices(process.services),
    sockets: process.sockets,
    warnings: validation.warnings
  };
}

export function resolveEffectiveAccess({ compiled, userId } = {}) {
  return compiled?.userAccess?.[String(userId)]?.permissions || {};
}

export function resolveNavigation({ compiled, userId } = {}) {
  return compiled?.userAccess?.[String(userId)]?.navigation || [];
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

function compileAssignmentAccess({ assignment = {}, roles = {} } = {}) {
  const permissions = {};
  const navigation = [];
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
    for (const item of role.navigation || []) {
      navigation.push({ ...item, roleId });
    }
  }
  return { roleIds, permissions, navigation, incompleteBindings };
}

function compileRoles(process = {}, domain = {}) {
  const roles = JSON.parse(JSON.stringify(process.roles || {}));
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
  for (const service of Object.values(process.services || {})) {
    for (const roleId of service.access?.runRoles || []) {
      if (!roles[roleId]) continue;
      roles[roleId].serviceAccess ||= [];
      upsertServiceAccess(roles[roleId].serviceAccess, { serviceId: service.id, commandId: service.commandId, level: 'run' });
    }
    for (const roleId of service.access?.viewRoles || []) {
      if (!roles[roleId]) continue;
      roles[roleId].serviceAccess ||= [];
      upsertServiceAccess(roles[roleId].serviceAccess, { serviceId: service.id, commandId: service.commandId, level: 'view' });
    }
  }
  return roles;
}

function upsertGrant(grants, next) {
  const existing = grants.find(grant => grant.feature === next.feature && !grant.rule && !grant.scope && !grant.transitions);
  if (!existing) {
    grants.push(next);
    return;
  }
  if (ACCESS_ORDER[next.level] > ACCESS_ORDER[existing.level || 'read']) existing.level = next.level;
}

function upsertServiceAccess(items, next) {
  const exists = items.some(item => item.serviceId === next.serviceId && item.level === next.level);
  if (!exists) items.push(next);
}

function resolveEntityFeature(domain = {}, entityType) {
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
  if (typeof value !== 'string' || !value.startsWith('$assignment.')) return value;
  const binding = value.slice('$assignment.'.length);
  const resolved = getByPath(bindings, binding);
  if (resolved === undefined || resolved === null || resolved === '') incomplete.push(binding);
  return resolved;
}

function collectIncompleteBindingWarnings(process) {
  const warnings = [];
  for (const [userId, assignment] of Object.entries(process.assignments)) {
    const access = compileAssignmentAccess({ assignment, roles: process.roles });
    for (const item of access.incompleteBindings) {
      warnings.push(`Assignment ${userId} role ${item.roleId} missing binding ${item.binding}`);
    }
  }
  return warnings;
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
    roles: {
      run: service.access?.runRoles || [],
      view: service.access?.viewRoles || []
    },
    inputs: service.inputs || [],
    outputs: service.outputs || []
  }]));
}

function compileActions(actions = {}) {
  return Object.fromEntries(Object.entries(actions).map(([id, action]) => [id, {
    id: action.id || id,
    label: action.label || action.actionKind || id,
    actionKind: action.actionKind || 'createEntity',
    entityType: action.entityType || null,
    parentEntityType: action.parentEntityType || null,
    commandId: action.commandId || null,
    status: action.status || {},
    projection: action.projection || null,
    trigger: {
      mode: action.trigger?.mode || 'user',
      roleIds: action.trigger?.roleIds || []
    },
    inputs: action.inputs || [],
    outputs: action.outputs || []
  }]));
}

function validateAction(actionId, action = {}, { entities, commands, roles, domain, errors }) {
  const kind = action.actionKind || 'createEntity';
  if (!['createEntity', 'changeStatus', 'archiveEntity', 'runCommand', 'sendToOrganization'].includes(kind)) {
    errors.push(`Action ${actionId} uses unknown action kind ${kind}`);
    return;
  }
  if (kind === 'runCommand') {
    if (!action.commandId) errors.push(`Action ${actionId} must select a command`);
    if (action.commandId && !commands.has(action.commandId)) errors.push(`Action ${actionId} uses unknown command ${action.commandId}`);
  } else {
    if (!action.entityType) errors.push(`Action ${actionId} must select an entity type`);
    if (action.entityType && !entities.has(action.entityType)) errors.push(`Action ${actionId} uses unknown entity type ${action.entityType}`);
  }
  if (action.parentEntityType && !entities.has(action.parentEntityType)) {
    errors.push(`Action ${actionId} uses unknown parent entity type ${action.parentEntityType}`);
  }
  if (kind === 'changeStatus' && (!action.status?.from || !action.status?.to)) {
    errors.push(`Action ${actionId} must define source and target statuses`);
  }
  if (['createEntity', 'archiveEntity'].includes(kind) && !action.status?.to) {
    errors.push(`Action ${actionId} must define target status`);
  }
  if (kind === 'sendToOrganization') {
    validateFieldList(action.projection?.fields, domain, action.entityType, `action ${actionId} projection fields`, errors);
    validateFieldList(action.projection?.excludeFields, domain, action.entityType, `action ${actionId} excluded fields`, errors);
  }
  if ((action.trigger?.mode || 'user') === 'user') {
    for (const roleId of action.trigger?.roleIds || []) {
      if (!roles[roleId]) errors.push(`Action ${actionId} references missing trigger role ${roleId}`);
    }
  }
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
