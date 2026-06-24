import { createError } from 'h3';
import standardSlugify from 'standard-slugify';
import { ObjectId } from 'mongodb';
import { assertEntityAccess } from '~/server/core/access/service.js';
import { executeCommand } from '~/server/core/commands/service.js';
import { createStatusState } from '~/server/core/blocks/index.js';
import { statusService } from '~/server/core/machines/service.js';
import * as organizationsRepository from '~/server/features/organizations/repository.js';
import * as cassetteService from '~/server/features/cassettes/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { normalizeEntityType } from '~/server/runtime/entities.js';
import {
  compileProcessDefinition,
  createProcessFromTemplate,
  hasCanonicalProcessSource,
  normalizeProcessDefinition,
  validateProcessDefinition,
  validateRoundTrip
} from '~/packages/processes/src/index.js';
import { getEntityFieldAccessPolicy } from '~/packages/domain-cnc/src/index.js';
import { getCutkitRegistry } from '~/server/runtime/cutkit-registry.js';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { hasPermissionGrant, normalizePermissionGrants } from '#shared/access-control.js';
import { ProcessDefinition } from './model.js';
import * as repository from './repository.js';

export async function list(auth) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  const raws = await repository.find({ 'lineage.organizationId': toFlexibleId(organizationId) });
  return raws.map(raw => new ProcessDefinition(raw).toJSON());
}

export async function getActive(auth) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  const raw = await repository.findActiveByOrganization(organizationId);
  return raw ? new ProcessDefinition(raw).toJSON() : null;
}

export async function getById(id, auth) {
  const process = await loadAuthorized(id, auth, 'read');
  return process.toJSON();
}

export async function create(payload = {}, auth) {
  const organizationId = payload.organizationId || resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'write');
  const name = payload.name || payload.identity?.name || 'Organization process';
  const process = new ProcessDefinition({
    identity: {
      uid: `process-${new ObjectId().toString().slice(0, 8)}`,
      name,
      slug: standardSlugify(name, { keepCase: false })
    },
    lineage: { organizationId: toFlexibleId(organizationId) },
    data: normalizeProcessDefinition(payload.data || payload)
  });
  applyProcessStatus(process, 'DRAFT', auth.userId, 'Process draft created');
  const created = await repository.create(process);
  return new ProcessDefinition(created).toJSON();
}

export async function update(id, payload = {}, auth) {
  const process = await loadAuthorized(id, auth, 'write');
  if (process.status?.state?.primary === 'ACTIVE') {
    throw createError({ statusCode: 409, message: 'Active process definitions cannot be edited directly' });
  }
  if (payload.identity?.name || payload.name) {
    process.identity.name = payload.identity?.name || payload.name;
  }
  process.data = {
    ...process.data,
    ...normalizeProcessDefinition(payload.data || payload)
  };
  process.data.compiled = null;
  const updated = await repository.updateById(id, process);
  return new ProcessDefinition(updated).toJSON();
}

export async function validate(id, auth) {
  const process = await loadAuthorized(id, auth, 'write');
  assertCanonicalProcessSource(process.data);
  return validateProcessDefinition(process.data, getDomain());
}

export async function activate(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  assertCanonicalProcessSource(process.data);
  await preserveActiveAssignments(process);
  const validation = validateProcessDefinition(process.data, getDomain());
  if (!validation.ok) {
    throw createError({ statusCode: 400, message: validation.errors.join('; '), data: validation });
  }
  const roundTrip = validateRoundTrip(process.data);
  if (!roundTrip.ok) {
    throw createError({ statusCode: 400, message: roundTrip.errors.join('; '), data: roundTrip });
  }
  process.data = {
    ...process.data,
    compiled: compileProcessDefinition(process.data, getDomain())
  };
  await repository.archiveActiveByOrganization(process.lineage.organizationId, auth.userId);
  applyProcessStatus(process, 'ACTIVE', auth.userId, 'Process activated');
  const updated = await repository.updateById(id, process);
  await organizationsRepository.updateById(process.lineage.organizationId, {
    data: {
      ...(await organizationsRepository.findById(process.lineage.organizationId))?.data,
      activeProcessDefinitionId: updated._id
    }
  });
  return new ProcessDefinition(updated).toJSON();
}

async function preserveActiveAssignments(process) {
  const activeRaw = await repository.findActiveByOrganization(process.lineage.organizationId);
  if (!activeRaw || String(activeRaw._id) === String(process.id)) return;
  const active = new ProcessDefinition(activeRaw);
  process.data.assignments = { ...(active.data?.assignments || {}) };
}

export async function createActiveFromTemplate({ organizationId, userId, templateId, actorId } = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization id is required' });

  const process = new ProcessDefinition(createProcessFromTemplate({
    templateId,
    organizationId: toFlexibleId(organizationId),
    userId
  }));

  const validation = validateProcessDefinition(process.data, getDomain());
  if (!validation.ok) {
    throw createError({ statusCode: 400, message: validation.errors.join('; '), data: validation });
  }

  process.data = {
    ...process.data,
    compiled: compileProcessDefinition(process.data, getDomain())
  };
  applyProcessStatus(process, 'ACTIVE', actorId || userId || 'SYSTEM', 'Process activated from starter template');

  await repository.archiveActiveByOrganization(organizationId, actorId || userId || 'SYSTEM');
  const created = await repository.create(process);
  await organizationsRepository.updateById(organizationId, {
    data: {
      ...(await organizationsRepository.findById(organizationId))?.data,
      activeProcessDefinitionId: created._id
    }
  });

  return new ProcessDefinition(created).toJSON();
}

export async function assignUserToActiveProcess({ userId, roleIds = [], bindings = {}, status = 'active' } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'admin');
  return await assignUserToActiveProcessInternal({
    organizationId,
    userId,
    roleIds,
    bindings,
    status,
    actorId: auth.userId
  });
}

export async function assignUserToActiveProcessInternal({
  organizationId,
  userId,
  roleIds = [],
  bindings = {},
  status = 'active',
  actorId = 'SYSTEM'
} = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization id is required' });
  if (!userId) throw createError({ statusCode: 400, message: 'User id is required' });

  const raw = await repository.findActiveByOrganization(organizationId);
  if (!raw) throw createError({ statusCode: 404, message: 'Active process definition not found' });

  const process = new ProcessDefinition(raw);
  const normalizedRoleIds = normalizeRoleIds(roleIds, process.data.roles);
  process.data.assignments = {
    ...(process.data.assignments || {}),
    [String(userId)]: {
      userId: String(userId),
      roleIds: normalizedRoleIds,
      bindings: bindings && typeof bindings === 'object' ? bindings : {},
      status
    }
  };
  process.data.compiled = compileProcessDefinition(process.data, getDomain());
  touchProcessStatus(process, actorId, `Assigned process roles to ${userId}`);

  const updated = await repository.updateById(process.id, process);
  return new ProcessDefinition(updated).toJSON();
}

export async function archive(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  applyProcessStatus(process, 'ARCHIVED', auth.userId, 'Process archived');
  const updated = await repository.updateById(id, process);
  return new ProcessDefinition(updated).toJSON();
}

export async function projectEntityThroughSocket({ socketId, entityId, targetOrganizationId } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  if (!socketId) throw createError({ statusCode: 400, message: 'Socket id is required' });
  if (!entityId) throw createError({ statusCode: 400, message: 'Entity id is required' });

  const raw = await repository.findActiveByOrganization(organizationId);
  if (!raw) throw createError({ statusCode: 404, message: 'Active process definition not found' });
  const process = new ProcessDefinition(raw);
  const socket = process.data.sockets?.[socketId];
  if (!socket) throw createError({ statusCode: 404, message: 'Socket not found in active process' });
  if (socket.direction === 'inbound') {
    throw createError({ statusCode: 400, message: 'Inbound sockets receive projected entities and cannot project source entities' });
  }

  const registry = getCutkitRegistry();
  const service = registry.getEntityService(socket.entityType);
  if (!service?.getById) throw createError({ statusCode: 500, message: `Entity service missing for ${socket.entityType}` });
  const entity = await service.getById(entityId);
  if (!entity) throw createError({ statusCode: 404, message: `${socket.entityType} not found` });

  const domainEntity = (getDomain().entities || []).find(item => item.type === socket.entityType);
  assertEntityAccess({
    entity,
    entityType: socket.entityType,
    feature: socket.feature || domainEntity?.collection || `${socket.entityType}s`,
    level: 'read',
    auth
  });

  return {
    socketId,
    entityType: socket.entityType,
    sourceOrganizationId: organizationId,
    targetOrganizationId: targetOrganizationId || null,
    projection: projectEntityFields(entity.toJSON ? entity.toJSON() : entity, socket.projection || {}),
    receiverLifecycle: socket.receiverLifecycle || { mode: 'defaultCreated' },
    visibility: socket.visibility || {}
  };
}

export async function executeActiveProcessAction({ actionId, entityId, data = {}, parameters = {}, entities = {}, targetOrganizationId = null } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  if (!actionId) throw createError({ statusCode: 400, message: 'Action id is required' });
  const raw = await repository.findActiveByOrganization(organizationId);
  if (!raw) throw createError({ statusCode: 404, message: 'Active process definition not found' });

  const process = new ProcessDefinition(raw);
  const action = process.data.compiled?.actions?.[actionId] || process.data.actions?.[actionId];
  if (!action) throw createError({ statusCode: 404, message: 'Action not found in active process' });
  assertCompiledActionAvailable(actionId, auth);

  if (action.actionKind === 'runCommand') {
    if (!action.commandId) throw createError({ statusCode: 400, message: `Action ${actionId} has no command` });
    return await executeCommand(action.commandId, { entities, parameters }, auth);
  }

  if (action.actionKind === 'changeStatus') {
    const targetId = entityId || entities?.entity || entities?.[action.entityType];
    if (!targetId) throw createError({ statusCode: 400, message: 'Entity id is required' });
    const targetState = action.status?.to || action.access?.statusTo;
    if (!targetState) throw createError({ statusCode: 400, message: `Action ${actionId} has no target status` });
    return await statusService.transitionWithResult({
      entityType: resolveActionEntityType(action),
      targetId,
      targetState,
      auth,
      context: processTransitionContext(action, data)
    });
  }

  if (action.actionKind === 'sendToOrganization') {
    return await projectEntityThroughSocket({
      socketId: action.socketId || action.projection?.socketId || action.targetSocketId,
      entityId,
      targetOrganizationId
    }, auth);
  }

  if (action.actionKind === 'createEntity') {
    const entityType = resolveActionEntityType(action);
    if (entityType === 'cassette_design' && action.construction?.mode === 'bakeCassetteDesignFromTemplate') {
      return await executeBakeCassetteDesign(action, data, organizationId, auth);
    }
    if (entityType === 'cassette' && action.construction?.mode === 'createDefaultOccsTemplate') {
      return await executeCreateDefaultCassetteTemplate(action, data, organizationId, auth);
    }
    if (entityType === 'cassette_design') {
      throw createError({ statusCode: 400, message: 'cassette_design requires typed construction' });
    }
    const service = getEntityServiceForAction(action);
    if (!service.create) throw createError({ statusCode: 500, message: `Entity service cannot create ${action.entityType}` });
    const created = await service.create(createActionPayload(action, data, entities), auth.userId, organizationId, auth.role, createActionExecutionAuth(auth, action));
    const targetState = action.status?.to;
    if (!targetState) return created;
    const createdDto = created?.toJSON ? created.toJSON() : created;
    const targetId = createdDto?._id || createdDto?.identity?.uid;
    if (!targetId) return created;
    const status = await statusService.setInitialStateForOrganization(
      entityType,
      targetId,
      targetState,
      organizationId,
      auth.userId,
      processStatusMetadata(action, `Created by process action ${action.id || actionId}`)
    );
    return {
      ...createdDto,
      status
    };
  }

  if (action.actionKind === 'updateEntity') {
    const targetId = entityId || entities?.entity || entities?.[action.entityType];
    if (!targetId) throw createError({ statusCode: 400, message: 'Entity id is required' });
    const service = getEntityServiceForAction(action);
    if (!service.update) throw createError({ statusCode: 500, message: `Entity service cannot update ${resolveActionEntityType(action)}` });
    return await service.update(targetId, pickMutationData(data, action), auth.userId, organizationId, auth.role, auth);
  }

  throw createError({ statusCode: 400, message: `Unsupported action kind ${action.actionKind}` });
}

function createActionPayload(action = {}, data = {}, entities = {}) {
  const payload = { ...(data || {}) };
  if (action.parentEntityType && entities?.[action.parentEntityType]) {
    payload[`${camelCase(action.parentEntityType)}Id`] ||= entities[action.parentEntityType];
  }
  return normalizeCreationPayload(payload);
}

function normalizeCreationPayload(payload = {}) {
  const normalized = { ...payload };
  if (normalized.identity?.name && !normalized.name) normalized.name = normalized.identity.name;
  if (normalized.identity?.slug && !normalized.slug) normalized.slug = normalized.identity.slug;
  for (const block of ['data', 'specs', 'summary']) {
    if (!normalized[block] || typeof normalized[block] !== 'object' || Array.isArray(normalized[block])) continue;
    for (const [key, value] of Object.entries(normalized[block])) {
      if (normalized[key] === undefined) normalized[key] = value;
    }
  }
  return normalized;
}

function camelCase(value = '') {
  return String(value).replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

async function executeBakeCassetteDesign(action = {}, data = {}, organizationId, auth = {}) {
  const templateId = data.templateId || data.cassetteId || data.data?.derivedFrom?.templateId
    || await defaultCassetteTemplateId(auth, organizationId, action);
  if (!templateId) throw createError({ statusCode: 400, message: 'Cassette template is required' });
  const created = await cassetteService.createDesignFromTemplate(
    templateId,
    data.parameters || {},
    auth.userId,
    organizationId,
    auth.role,
    createActionExecutionAuth(auth, action),
    { name: data.name || data.identity?.name || '' }
  );
  const targetState = action.status?.to;
  if (!targetState) return created;
  const targetId = created?._id || created?.identity?.uid;
  if (!targetId) return created;
  const status = await statusService.setInitialStateForOrganization(
    resolveActionEntityType(action),
    targetId,
    targetState,
    organizationId,
    auth.userId,
    processStatusMetadata(action, `Created by process action ${action.id}`)
  );
  return { ...created, status };
}

async function executeCreateDefaultCassetteTemplate(action = {}, data = {}, organizationId, auth = {}) {
  const created = await cassetteService.createDefaultOccsTemplate(
    createActionPayload(action, data, {}),
    auth.userId,
    organizationId,
    auth.role,
    createActionExecutionAuth(auth, action)
  );
  const targetState = action.status?.to;
  if (!targetState) return created;
  const targetId = created?._id || created?.identity?.uid;
  if (!targetId) return created;
  const status = await statusService.setInitialStateForOrganization(
    'cassette',
    targetId,
    targetState,
    organizationId,
    auth.userId,
    processStatusMetadata(action, `Created by process action ${action.id}`)
  );
  return { ...created, status };
}

function processStatusMetadata(action = {}, note = '') {
  const display = statusDisplayMetadata(action.status);
  return {
    note,
    ...(display ? { display } : {})
  };
}

function processTransitionContext(action = {}, data = {}) {
  const source = data?.statusMeta || data?.context || {};
  const display = statusDisplayMetadata(action.status);
  if (!display) return source;
  if (source?.metadata || source?.lifecycle) {
    return {
      ...source,
      metadata: {
        ...(source.metadata || {}),
        display
      }
    };
  }
  return {
    ...source,
    display
  };
}

function statusDisplayMetadata(status = {}) {
  const display = {
    ...(status.label ? { label: status.label } : {}),
    ...(status.color || status.severity ? { color: status.color || status.severity } : {}),
    ...(status.severity || status.color ? { severity: status.severity || status.color } : {}),
    ...(status.icon ? { icon: status.icon } : {})
  };
  return Object.keys(display).length ? display : null;
}

async function defaultCassetteTemplateId(auth = {}, organizationId, action = {}) {
  const template = await cassetteService.findDefaultConstructableTemplate?.(
    auth.userId,
    organizationId,
    auth.role,
    createActionExecutionAuth(auth, action)
  );
  return template?._id || template?.identity?.uid || null;
}

export async function getByIdInternal(id) {
  const raw = await repository.findById(id);
  return raw ? new ProcessDefinition(raw).toJSON() : null;
}

function applyProcessStatus(process, primary, userId, note) {
  process.applyStatus(createStatusState(primary), userId || 'SYSTEM', { note });
}

function touchProcessStatus(process, userId, note) {
  if (!process.status?.toJSON) {
    applyProcessStatus(process, 'ACTIVE', userId, note);
    return;
  }
  process.status.userId = userId || 'SYSTEM';
  process.status.timestamp = new Date();
  process.status.metadata = {
    ...(process.status.metadata || {}),
    note
  };
}

function assertCompiledActionAvailable(actionId, auth = {}) {
  const available = auth.roleAssignments?.actions || [];
  if (!available.some(action => action.actionId === actionId)) {
    throw createError({ statusCode: 403, message: `Action ${actionId} is not available to the current process role` });
  }
}

function resolveActionEntityType(action = {}) {
  return normalizeEntityType(action.entityType || action.inputs?.find(input => input.entityType)?.entityType || '');
}

function getEntityServiceForAction(action = {}) {
  const entityType = resolveActionEntityType(action);
  if (!entityType) throw createError({ statusCode: 400, message: `Action ${action.id} has no entity type` });
  const service = getAppRegistry().getEntityService(entityType);
  if (!service) throw createError({ statusCode: 500, message: `Entity service missing for ${entityType}` });
  return service;
}

function createActionExecutionAuth(auth = {}, action = {}) {
  const feature = resolveActionFeature(action);
  if (!feature) return auth;
  const permissions = {
    ...(auth.effectivePermissions || {})
  };
  appendExecutionGrant(permissions, feature, {
    level: action.access?.level || 'write',
    actions: { create: true }
  });
  for (const source of constructionSourceGrants(action)) {
    appendExecutionGrant(permissions, source.feature, {
      level: source.level,
      actions: source.actions
    });
  }
  return {
    ...auth,
    effectivePermissions: permissions
  };
}

function appendExecutionGrant(permissions, feature, grant) {
  if (!feature) return;
  permissions[feature] = [
    ...normalizePermissionGrants(permissions[feature]),
    grant
  ];
}

function constructionSourceGrants(action = {}) {
  const sources = [];
  if (action.construction?.mode === 'bakeCassetteDesignFromTemplate') {
    sources.push({ entityType: 'cassette', level: 'write', actions: { view: true, update: true } });
  }
  for (const field of [
    ...(action.construction?.inputs || []),
    ...(action.inputPolicy?.fields || []),
    ...(action.inputs || [])
  ]) {
    if (field?.type === 'entity' && field.entityType) {
      sources.push({ entityType: field.entityType, level: field.access?.level || 'read', actions: { view: true } });
    }
  }
  const seen = new Set();
  return sources.flatMap(source => {
    const feature = resolveEntityFeature(source.entityType);
    const key = `${feature}:${source.level}`;
    if (!feature || seen.has(key)) return [];
    seen.add(key);
    return [{ ...source, feature }];
  });
}

function resolveActionFeature(action = {}) {
  return resolveEntityFeature(resolveActionEntityType(action));
}

function resolveEntityFeature(entityType = '') {
  entityType = normalizeEntityType(entityType);
  const domain = getDomain();
  const entity = (domain?.entities || []).find(item => item.type === entityType);
  if (entity?.collection) return entity.collection;
  const fieldPolicy = getEntityFieldAccessPolicy(entityType) || domain?.fieldAccess?.[entityType];
  if (fieldPolicy?.feature) return fieldPolicy.feature;
  return entityType;
}

function pickMutationData(data = {}, action = {}) {
  const fields = action.mutation?.fields || [];
  if (!fields.length) return data || {};
  const picked = {};
  for (const field of fields) {
    const value = getByPath(data, field);
    if (value !== undefined) setByPath(picked, field, value);
  }
  if (picked.identity?.name && !picked.name) picked.name = picked.identity.name;
  return picked;
}

function getByPath(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

function setByPath(target, path, value) {
  const parts = String(path || '').split('.').filter(Boolean);
  let cursor = target;
  while (parts.length > 1) {
    const key = parts.shift();
    cursor[key] ||= {};
    cursor = cursor[key];
  }
  if (parts[0]) cursor[parts[0]] = value;
}

async function loadAuthorized(id, auth, level) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Process definition not found' });
  const process = new ProcessDefinition(raw);
  await assertOrgAccess(auth, process.lineage.organizationId, level);
  return process;
}

async function assertOrgAccess(auth, organizationId, level) {
  try {
    assertEntityAccess({
      entity: { lineage: { organizationId } },
      entityType: 'organization',
      feature: 'organizations',
      level,
      auth
    });
  } catch (error) {
    if (await hasProcessDefinitionMembershipAccess(auth, organizationId, level)) return;
    throw error;
  }
}

export async function hasProcessDefinitionMembershipAccess(auth = {}, organizationId, level = 'read') {
  if (!['read', 'write', 'admin'].includes(level)) return false;
  const membership = findOrganizationMembership(auth, organizationId);
  if (!membership || membership.status === 'pending' || membership.status === 'rejected') return false;
  if (hasPermissionGrant({ permissions: membership.permissions || {}, feature: 'organizations', level })) return true;
  return false;
}

function findOrganizationMembership(auth = {}, organizationId) {
  const target = organizationId?.toString();
  return (auth.memberships || []).find(item => item.organizationId?.toString() === target);
}

function resolveOrganizationId(auth = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId;
  if (!organizationId) throw createError({ statusCode: 403, message: 'Organization membership is required' });
  return organizationId;
}

function getDomain() {
  return getCutkitRegistry().getDomain('cnc');
}

function assertCanonicalProcessSource(data = {}) {
  if (data.compiled && !hasCanonicalProcessSource(data)) {
    throw createError({
      statusCode: 409,
      message: 'Process definition has only a compiled runtime contract; canonical semantic records are required for editing'
    });
  }
}

function normalizeRoleIds(roleIds, roles = {}) {
  const list = Array.isArray(roleIds) ? roleIds : [roleIds].filter(Boolean);
  const valid = list.filter(roleId => roles[roleId]);
  if (valid.length) return [...new Set(valid)];
  throw createError({ statusCode: 400, message: 'At least one valid process role is required' });
}

function projectEntityFields(entity, projection = {}) {
  const fields = projection.fields?.length ? projection.fields : ['identity.*', 'status.*'];
  const excluded = projection.excludeFields || [];
  const projected = {};
  for (const field of fields) copyProjectionPath(entity, projected, field);
  for (const field of excluded) deleteProjectionPath(projected, field);
  return projected;
}

function copyProjectionPath(source, target, path) {
  const sourcePath = path.endsWith('.*') ? path.slice(0, -2) : path;
  const value = sourcePath.split('.').reduce((current, segment) => current?.[segment], source);
  if (value === undefined) return;
  const segments = sourcePath.split('.');
  const last = segments.pop();
  const parent = segments.reduce((current, segment) => {
    if (!current[segment] || typeof current[segment] !== 'object') current[segment] = {};
    return current[segment];
  }, target);
  parent[last] = value;
}

function deleteProjectionPath(target, path) {
  const sourcePath = path.endsWith('.*') ? path.slice(0, -2) : path;
  const segments = sourcePath.split('.');
  const last = segments.pop();
  const parent = segments.reduce((current, segment) => current?.[segment], target);
  if (parent && Object.prototype.hasOwnProperty.call(parent, last)) delete parent[last];
}
