import { cncCommands, cncWorkflows } from '#packages/domain-cnc/src/index.js';
import { compileWorkflowDraft } from '#utils/workflow-compiler.js';
import { createCncFixtureScenario, validateCncFixtureScenario } from './scenarios.js';

export const WORKBENCH_CONTEXT_ID = 'cnc-workbench-context';

export function createWorkbenchContext({ workflows = cncWorkflows, entities = [], commands = cncCommands } = {}) {
  const compiled = compileWorkflowDraft({ entities, workflows });
  const scenario = createCncFixtureScenario({
    workflows: compiled.machines,
    commands
  });
  const context = normalizeWorkbenchContext({
    id: WORKBENCH_CONTEXT_ID,
    label: 'CNC workbench context',
    workflows: compiled,
    entities: scenario.entities,
    refs: scenario.refs,
    access: scenario.access,
    commandBindings: scenario.manifests?.commandDefaults || {},
    relationships: scenario.relationships || [],
    validation: validateCncFixtureScenario(scenario, compiled.machines)
  });
  return toPlainObject(context);
}

export function normalizeWorkbenchContext(context = {}) {
  const entities = normalizeEntityMap(context.entities || {});
  const manifests = context.manifests || {};
  return {
    id: context.id || WORKBENCH_CONTEXT_ID,
    label: context.label || 'Workbench context',
    workflows: context.workflows || context.workflowCompile || null,
    entities,
    refs: context.refs || buildRefsFromEntities(entities),
    access: normalizeAccess(context.access),
    commandBindings: context.commandBindings || manifests.commandDefaults || {},
    relationships: context.relationships || buildRelationships(entities),
    validation: context.validation || validateContextEntities(entities),
    persisted: Boolean(context.persisted)
  };
}

export function contextToScenario(context = {}) {
  const normalized = normalizeWorkbenchContext(context);
  return toPlainObject({
    id: normalized.id,
    label: normalized.label,
    refs: normalized.refs,
    entities: Object.fromEntries(Object.entries(normalized.entities).map(([type, byId]) => [type, Object.values(byId)])),
    relationships: normalized.relationships,
    access: normalized.access,
    manifests: {
      commandDefaults: normalized.commandBindings,
      entityOptions: contextEntityOptions(normalized)
    },
    validation: normalized.validation
  });
}

export function upsertContextEntities(context, entries = []) {
  const next = normalizeWorkbenchContext(context);
  for (const entry of entries) {
    const type = entry.type;
    const entity = entry.entity;
    if (!type || !entity?._id) continue;
    next.entities[type] ||= {};
    next.entities[type][entity._id.toString()] = toPlainObject(entity);
  }
  next.relationships = buildRelationships(next.entities);
  next.validation = validateContextEntities(next.entities);
  next.persisted = false;
  return next;
}

export function transitionContextInstanceStatus(context, { type, id, state, userId = 'SYSTEM', metadata = {}, lifecycle = null } = {}) {
  const next = normalizeWorkbenchContext(context);
  const entity = type && id ? next.entities?.[type]?.[id.toString()] : null;
  if (!entity || !state) return next;

  const status = {
    ...(entity.status || {}),
    state,
    userId,
    timestamp: new Date().toISOString(),
    metadata,
    eventId: `workbench-status-${Date.now().toString(36)}`,
    lifecycle: lifecycle || entity.status?.lifecycle || { actors: [], attachments: {}, data: {} }
  };
  if (!entity.origin) entity.origin = status;
  entity.status = status;
  next.persisted = false;
  return next;
}

export function contextEntityOptions(context = {}) {
  const normalized = normalizeWorkbenchContext(context);
  return Object.fromEntries(Object.entries(normalized.entities).map(([type, byId]) => [type, Object.values(byId).map(entity => ({
    label: entity.identity?.name || entity.identity?.uid || entity._id,
    value: entity._id,
    entity
  }))]));
}

export function findContextEntity(context, type, id) {
  if (!type || !id) return null;
  return normalizeWorkbenchContext(context).entities?.[type]?.[id.toString()] || null;
}

function normalizeEntityMap(source) {
  const normalized = {};
  for (const [type, value] of Object.entries(source || {})) {
    const items = Array.isArray(value) ? value : Object.values(value || {});
    normalized[type] = Object.fromEntries(items
      .filter(entity => entity?._id)
      .map(entity => [entity._id.toString(), toPlainObject(entity)]));
  }
  return normalized;
}

function normalizeAccess(access = {}) {
  const permissions = access.permissions || {};
  return {
    userId: access.userId || 'user-demo',
    organizationId: access.organizationId || 'org-demo-acme',
    role: access.role || 'WorkbenchUser',
    permissions,
    memberships: access.memberships || [{ organizationId: access.organizationId || 'org-demo-acme', permissions, status: 'active' }],
    restrictedTo: access.restrictedTo || null
  };
}

function buildRefsFromEntities(entities) {
  return Object.fromEntries(Object.entries(entities).flatMap(([type, byId]) => Object.values(byId).map(entity => [`${type}:${entity._id}`, entity._id])));
}

function buildRelationships(entities) {
  const ids = new Set(Object.values(entities).flatMap(byId => Object.keys(byId)));
  return Object.entries(entities).flatMap(([type, byId]) => Object.values(byId).flatMap(entity => Object.entries(entity.lineage || {})
    .filter(([key, value]) => key.endsWith('Id') && value && ids.has(value.toString()))
    .map(([key, value]) => ({ from: `${type}:${entity._id}`, key, to: value.toString() }))));
}

function validateContextEntities(entities) {
  const ids = new Set(Object.values(entities).flatMap(byId => Object.keys(byId)));
  const issues = [];
  for (const [type, byId] of Object.entries(entities)) {
    for (const entity of Object.values(byId)) {
      if (!entity.identity?.uid) issues.push(`${type}:${entity._id} missing identity.uid`);
      if (entity.identity?.name && entity.identity.name === entity._id) issues.push(`${type}:${entity._id} uses display name as id`);
      for (const [key, value] of Object.entries(entity.lineage || {})) {
        if (key.endsWith('Id') && value && !isExternalRef(value) && !ids.has(value.toString())) {
          issues.push(`${type}:${entity._id} lineage ${key} references missing ${value}`);
        }
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

function isExternalRef(value) {
  return String(value).startsWith('file-') || String(value).startsWith('dxf-') || String(value).startsWith('svg-');
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
