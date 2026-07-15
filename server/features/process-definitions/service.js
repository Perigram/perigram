import { createError } from 'h3';
import standardSlugify from 'standard-slugify';
import { ObjectId } from 'mongodb';
import { normalizeEntityRef } from '~/packages/core/src/index.js';
import { assertEntityAccess } from '~/server/core/access/service.js';
import { executeCommand } from '~/server/core/commands/service.js';
import { createStatusState } from '~/server/core/blocks/index.js';
import { statusService } from '~/server/core/machines/service.js';
import * as organizationsRepository from '~/server/features/organizations/repository.js';
import * as cassetteService from '~/server/features/cassettes/service.js';
import * as entityRevisionsService from '~/server/features/entity-revisions/service.js';
import * as entityEventService from '~/server/features/entity-events/service.js';
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
  return validateActivatableProcess(process.data, getDomain());
}

export async function activate(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  assertCanonicalProcessSource(process.data);
  await preserveActiveAssignments(process);
  const validation = validateActivatableProcess(process.data, getDomain());
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

  const validation = validateActivatableProcess(process.data, getDomain());
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

function validateActivatableProcess(data = {}, domain = {}) {
  const validation = validateProcessDefinition(data, domain);
  const process = validation.definition || normalizeProcessDefinition(data);
  const exposesNesting = Object.values(process.actions || {}).some(action => (
    action.actionKind === 'runCommand' && action.commandId === 'solveNesting'
  )) || Object.values(process.services || {}).some(service => service.commandId === 'solveNesting');
  if (!exposesNesting) return validation;

  const profiledTypes = new Set(Object.values(process.entityProfiles || {}).map(profile => profile.entityType));
  const missing = ['nesting_run', 'sheet_design', 'sheet'].filter(entityType => !profiledTypes.has(entityType));
  if (!missing.length) return validation;
  const errors = [
    ...(validation.errors || []),
    `Nesting exposure requires entity profiles and workflows for: ${missing.join(', ')}`
  ];
  return { ...validation, ok: false, errors };
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
    const result = await executeCommand(action.commandId, { entities, parameters }, createActionExecutionAuth(auth, action));
    if (!hasAsyncOutputBoundary(result)) {
      await applyProcessOutputStatuses({ actionId, result, processData: process.data, organizationId, auth });
    }
    return result;
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
      const created = await executeBakeCassetteDesign(action, data, organizationId, auth, process.data, entities);
      await appendProducedCassetteDesignToQueue({ action, data, entities, design: created, auth });
      await publishActionEntityEvent(auth, entityType, created, 'created', 'process-create');
      return created;
    }
    if (entityType === 'cassette_design' && action.construction?.mode === 'importCassetteDesignFromArtifact') {
      const imported = await cassetteService.importFromArtifact(
        data.artifactId,
        data.name,
        auth.userId,
        organizationId,
        auth.role,
        createActionExecutionAuth(auth, action),
        data.layerMapping || null,
        data.parameters || null
      );
      await appendProducedCassetteDesignToQueue({ action, data, entities, design: imported.design, auth });
      await publishActionEntityEvent(auth, entityType, imported.design, 'created', 'process-create');
      return imported.design;
    }
    if (entityType === 'cassette' && action.construction?.mode === 'createDefaultOccsTemplate') {
      const created = await executeCreateDefaultCassetteTemplate(action, data, organizationId, auth, process.data, entities);
      await publishActionEntityEvent(auth, entityType, created, 'created', 'process-create');
      return created;
    }
    if (entityType === 'cassette_design') {
      throw createError({ statusCode: 400, message: 'cassette_design requires typed construction' });
    }
    const service = getEntityServiceForAction(action);
    if (!service.create) throw createError({ statusCode: 500, message: `Entity service cannot create ${action.entityType}` });
    const parentContext = await resolveParentCreationContext(action, entities, auth);
    const createdEntity = await service.create(createActionPayload(action, data, entities, parentContext), auth.userId, organizationId, auth.role, createActionExecutionAuth(auth, action));
    const created = assertCreatedParentContext(entityType, createdEntity, parentContext);
    const targetState = action.status?.to;
    if (!targetState) {
      await publishActionEntityEvent(auth, entityType, created, 'created', 'process-create');
      return created;
    }
    const createdDto = created?.toJSON ? created.toJSON() : created;
    const targetId = createdDto?._id || createdDto?.identity?.uid;
    if (!targetId) {
      await publishActionEntityEvent(auth, entityType, created, 'created', 'process-create');
      return created;
    }
    const status = await statusService.setInitialStateForOrganization(
      entityType,
      targetId,
      targetState,
      organizationId,
      auth.userId,
      processStatusMetadata(action, `Created by process action ${action.id || actionId}`, process.data)
    );
    const result = {
      ...createdDto,
      status
    };
    await publishActionEntityEvent(auth, entityType, result, 'created', 'process-create');
    return result;
  }

  if (action.actionKind === 'updateEntity') {
    const targetId = entityId || entities?.entity || entities?.[action.entityType];
    if (!targetId) throw createError({ statusCode: 400, message: 'Entity id is required' });
    const entityType = resolveActionEntityType(action);
    const executionAuth = createActionExecutionAuth(auth, action);
    const mutation = await normalizeProcessMutation(entityType, pickMutationData(data, action, entities), action, executionAuth);
    const targetState = action.status?.to || action.access?.statusTo || '';
    if (targetState) {
      const result = await statusService.transitionWithResult({
        entityType,
        targetId,
        targetState,
        auth: executionAuth,
        context: processTransitionContext(action, data, process.data),
        patch: flattenMutationPatch(mutation)
      });
      await publishStatusResultEvents(auth, entityType, targetId, result, 'process-entity-update');
      return result;
    }
    if (!Object.keys(mutation).length) throw createError({ statusCode: 400, message: `Action ${actionId} has no connected mutation inputs` });
    const updated = await persistProcessEntityPatch(
      entityType,
      targetId,
      flattenMutationPatch(mutation),
      executionAuth
    );
    await publishActionEntityEvent(auth, entityType, updated || { _id: targetId }, 'updated', 'process-update');
    return updated;
  }

  throw createError({ statusCode: 400, message: `Unsupported action kind ${action.actionKind}` });
}

function createActionPayload(action = {}, data = {}, entities = {}, parentContext = null) {
  const payload = { ...(data || {}) };
  if (action.parentEntityType) {
    const parentId = parentContext?.parentId || entityInputId(entities?.[action.parentEntityType]);
    if (!parentId) {
      throw createError({
        statusCode: 400,
        message: `${action.parentEntityType} parent is required`
      });
    }
    const lineageKey = parentContext?.relation?.lineageKey || `${camelCase(action.parentEntityType)}Id`;
    payload[lineageKey] = parentId;
    payload.lineage = {
      ...(payload.lineage || {}),
      ...(parentContext?.lineage || {}),
      [lineageKey]: parentId
    };
    if (parentContext?.provenance) {
      payload.provenance = {
        ...(payload.provenance || {}),
        parent: parentContext.provenance
      };
    }
  }
  return normalizeCreationPayload(payload);
}

async function appendProducedCassetteDesignToQueue({ action = {}, data = {}, entities = {}, design = null, auth = {} } = {}) {
  if (!data?.queueAppend) return null;
  if (resolveActionEntityType(action) !== 'cassette_design') {
    throw createError({ statusCode: 400, message: 'Only cassette design producer actions can append queue items' });
  }

  const queueId = entityInputId(entities.queue);
  if (!queueId) throw createError({ statusCode: 400, message: 'Queue context is required to append produced cassette design' });

  const designId = entityInputId(design);
  if (!designId) throw createError({ statusCode: 500, message: 'Produced cassette design has no id' });

  const queueService = getAppRegistry().getEntityService('queue');
  if (!queueService?.getById || !queueService?.processUpdate) {
    throw createError({ statusCode: 500, message: 'Queue service cannot persist process queue items' });
  }

  const appendAuth = createQueueAppendExecutionAuth(auth, action);
  const queueResult = await queueService.getById(queueId, auth.userId, auth.organizationId, auth.role, appendAuth);
  const queue = queueResult?.toJSON ? queueResult.toJSON() : queueResult;
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });

  const append = data.queueAppend && typeof data.queueAppend === 'object' ? data.queueAppend : {};
  const existingItems = Array.isArray(queue.data?.job?.items) ? queue.data.job.items : [];
  const item = {
    type: append.type || (Object.prototype.hasOwnProperty.call(design.data?.parameters || {}, 'T') ? 'PARAMETRIC' : 'STATIC'),
    entityType: 'cassette_design',
    id: designId,
    quantity: Math.max(1, Number(append.quantity || 1)),
    parameters: append.parameters && typeof append.parameters === 'object'
      ? append.parameters
      : { ...(design.data?.parameters || {}) }
  };

  const updated = await queueService.processUpdate(queueId, {
    'data.job.items': [...existingItems, item]
  }, appendAuth);
  await publishActionEntityEvent(auth, 'queue', updated || { _id: queueId }, 'updated', 'process-queue-append');
  return updated;
}

async function resolveParentCreationContext(action = {}, entities = {}, auth = {}) {
  const parentEntityType = normalizeEntityType(action.parentEntityType || '');
  if (!parentEntityType) return null;
  const childEntityType = resolveActionEntityType(action);
  const relation = (getDomain().containment || []).find(item => (
    normalizeEntityType(item.parentType) === parentEntityType
    && normalizeEntityType(item.childType) === childEntityType
    && item.lineageKey
  ));
  if (!relation) {
    throw createError({ statusCode: 400, message: `${parentEntityType} is not a declared containment parent of ${childEntityType}` });
  }
  const parentId = entityInputId(entities?.[parentEntityType]);
  if (!parentId) throw createError({ statusCode: 400, message: `${parentEntityType} parent is required` });

  const parentService = getAppRegistry().getEntityService(parentEntityType);
  const parentResult = await parentService?.getById?.(parentId, auth.userId, auth.organizationId, auth.role, createActionExecutionAuth(auth, action));
  const parent = parentResult?.toJSON ? parentResult.toJSON() : parentResult;
  if (!parent) throw createError({ statusCode: 404, message: `${parentEntityType} parent not found` });
  const parentDefinition = (getDomain().entities || []).find(item => normalizeEntityType(item.type) === parentEntityType);
  assertEntityAccess({
    entity: parent,
    entityType: parentEntityType,
    feature: resolveEntityFeature(parentDefinition?.type || parentEntityType),
    level: 'read',
    action: 'view',
    auth: createActionExecutionAuth(auth, action)
  });

  const canonicalParentId = entityInputId(parent) || parentId;
  const lineage = {
    ...(parent.lineage || {}),
    [relation.lineageKey]: parent._id || parent.identity?.uid || canonicalParentId
  };
  let provenance = null;
  if (action.parentRevision?.enabled === true) {
    const scope = action.parentRevision.scope || getDomain().revisions?.[parentEntityType]?.defaultScope;
    if (!scope) throw createError({ statusCode: 400, message: `${parentEntityType} revision scope is required` });
    const revision = await entityRevisionsService.getCurrentForEntity(parentEntityType, canonicalParentId, scope);
    if (!revision) {
      throw createError({ statusCode: 409, message: `${parentEntityType} has no current ${scope} revision to pin` });
    }
    provenance = {
      source: normalizeEntityRef({ type: parentEntityType, id: canonicalParentId, revisionId: revision._id }),
      scope,
      revisionNumber: revision.data?.number || null,
      contentHash: revision.data?.contentHash || ''
    };
  }
  return { relation, parentEntityType, parentId: canonicalParentId, lineage, provenance };
}

function assertCreatedParentContext(entityType, createdEntity, context = null) {
  if (!context) return createdEntity;
  const created = createdEntity?.toJSON ? createdEntity.toJSON() : createdEntity;
  const lineagePatch = Object.fromEntries(Object.entries(context.lineage || {}).filter(([key, value]) => (
    String(created?.lineage?.[key] ?? '') !== String(value ?? '')
  )));
  const needsProvenance = Boolean(context.provenance) && !sameEntityRef(created?.provenance?.parent?.source, context.provenance.source);
  if (!Object.keys(lineagePatch).length && !needsProvenance) return createdEntity;
  throw createError({
    statusCode: 500,
    message: `Created ${entityType} did not persist declared containment context`
  });
}

function entityInputId(value) {
  if (!value) return null;
  if (typeof value !== 'object') return value;
  return value.id || value._id || value.identity?.uid || null;
}

function sameEntityRef(left, right) {
  return Boolean(left && right)
    && normalizeEntityType(left.type) === normalizeEntityType(right.type)
    && String(left.id) === String(right.id)
    && String(left.revisionId || '') === String(right.revisionId || '');
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

async function applyProcessOutputStatuses({ actionId, result = {}, processData = {}, organizationId, auth = {} } = {}) {
  const statusByEntityType = commandOutputStatusMap(actionId, processData);
  if (!statusByEntityType.size) return;
  for (const entityRef of result.entities || []) {
    const entityType = normalizeEntityType(entityRef.type || entityRef.entityType || '');
    const targetState = statusByEntityType.get(entityType);
    const targetId = entityRef.id || entityRef._id;
    if (!entityType || !targetState || !targetId) continue;
    await statusService.setInitialStateForOrganization(
      entityType,
      targetId,
      targetState,
      organizationId,
      auth.userId,
      processStatusMetadata({ entityType, status: { to: targetState } }, `Created by process command action ${actionId}`, processData)
    );
    await entityEventService.publishEntityChanged(auth, {
      type: entityType,
      id: targetId,
      change: 'updated',
      reason: 'process-command-output-status'
    });
  }
}

async function publishStatusResultEvents(auth, entityType, targetId, result = {}, reason = 'process-status-action') {
  await entityEventService.publishEntityChanged(auth, {
    type: entityType,
    id: result.entity?._id || targetId,
    change: 'updated',
    reason
  });
  for (const changed of normalizedEffectEntities(result.effects)) {
    await entityEventService.publishEntityChanged(auth, {
      type: changed.type,
      id: changed.id || changed.entity?._id,
      change: 'updated',
      reason: `${reason}-effect`
    });
  }
}

async function publishActionEntityEvent(auth, entityType, entity, change, reason) {
  await entityEventService.publishEntityChanged(auth, {
    type: entityType,
    id: entityId(entity),
    change,
    reason
  });
}

function normalizedEffectEntities(effects) {
  if (!effects) return [];
  if (Array.isArray(effects)) return effects.flatMap(effect => effect?.entities || []);
  return effects.entities || [];
}

function entityId(entity = {}) {
  return entity?._id || entity?.id || entity?.identity?.uid || null;
}

function hasAsyncOutputBoundary(result = {}) {
  return (result.tasks || []).length > 0
    || (result.jobs || []).some(job => ['task_run', 'task'].includes(job?.type));
}

function commandOutputStatusMap(actionId, processData = {}) {
  const sourceNodeIds = new Set([String(actionId)]);
  const actionIdByNodeId = new Map();
  for (const node of processData.graph?.nodes || []) {
    if (node.type && node.type !== 'action') continue;
    const nodeActionId = String(node.data?.refId || node.id || '');
    const nodeId = String(node.id || '');
    if (!nodeActionId || !nodeId) continue;
    actionIdByNodeId.set(nodeId, nodeActionId);
    if (nodeActionId === String(actionId)) sourceNodeIds.add(nodeId);
  }
  const map = new Map();
  for (const edge of processData.graph?.edges || []) {
    if (!sourceNodeIds.has(String(edge.source))) continue;
    const targetActionId = actionIdByNodeId.get(String(edge.target)) || String(edge.target);
    const targetAction = targetActionId ? processData.actions?.[targetActionId] : null;
    if (targetAction?.actionKind !== 'updateEntity' || !(targetAction.status?.to || targetAction.access?.statusTo)) continue;
    const entityType = normalizeEntityType(
      targetAction.entityType
      || targetAction.inputs?.find(input => input.entityType)?.entityType
      || String(edge.sourceHandle || '').replace(/^output:/, '')
    );
    const targetState = targetAction.status?.to || targetAction.access?.statusTo;
    if (entityType && targetState) map.set(entityType, targetState);
  }
  return map;
}

async function executeBakeCassetteDesign(action = {}, data = {}, organizationId, auth = {}, processData = {}, entities = {}) {
  const templateId = data.templateId || data.cassetteId || data.provenance?.derivedFrom?.source?.id
    || entities.cassette
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
    processStatusMetadata(action, `Created by process action ${action.id}`, processData)
  );
  return { ...created, status };
}

async function executeCreateDefaultCassetteTemplate(action = {}, data = {}, organizationId, auth = {}, processData = {}, entities = {}) {
  const parentContext = await resolveParentCreationContext(action, entities, auth);
  const createdTemplate = await cassetteService.createDefaultOccsTemplate(
    createActionPayload(action, data, entities, parentContext),
    auth.userId,
    organizationId,
    auth.role,
    createActionExecutionAuth(auth, action)
  );
  const created = assertCreatedParentContext('cassette', createdTemplate, parentContext);
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
    processStatusMetadata(action, `Created by process action ${action.id}`, processData)
  );
  return { ...created, status };
}

function processStatusMetadata(action = {}, note = '', processData = {}) {
  const display = actionStatusDisplayMetadata(action, processData);
  return {
    note,
    ...(display ? { display } : {})
  };
}

function processTransitionContext(action = {}, data = {}, processData = {}) {
  const source = data?.statusMeta || data?.context || {};
  const display = actionStatusDisplayMetadata(action, processData);
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

function actionStatusDisplayMetadata(action = {}, processData = {}) {
  return statusDisplayMetadata({
    ...statusDefinitionForAction(action, processData),
    ...(action.status || {})
  });
}

function statusDefinitionForAction(action = {}, processData = {}) {
  const statusRef = action.statusRef;
  if (statusRef && processData?.statusDefinitions?.[statusRef]) return processData.statusDefinitions[statusRef];
  const target = action.status?.to || action.access?.statusTo;
  if (!target) return {};
  return Object.values(processData?.statusDefinitions || {}).find(definition => (
    definition?.statusId === target || definition?.id === target
  )) || {};
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
  const permissions = {
    ...(auth.effectivePermissions || {})
  };
  if (feature) {
    appendExecutionGrant(permissions, feature, {
      level: action.access?.level || 'write',
      actions: executionActionsForAction(action)
    });
  }
  for (const grant of commandExecutionGrants(action)) {
    appendExecutionGrant(permissions, grant.feature, {
      level: grant.level || 'read',
      actions: grant.actions || { view: true }
    });
  }
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

function createQueueAppendExecutionAuth(auth = {}, action = {}) {
  const executionAuth = createActionExecutionAuth(auth, action);
  const permissions = {
    ...(executionAuth.effectivePermissions || {})
  };
  appendExecutionGrant(permissions, 'queues', {
    level: 'write',
    actions: { update: true, edit: true }
  });
  return {
    ...executionAuth,
    effectivePermissions: permissions
  };
}

function commandExecutionGrants(action = {}) {
  if (action.actionKind !== 'runCommand' || !action.commandId) return [];
  const command = getAppRegistry().getCommandDefinition(action.commandId);
  return Array.isArray(command?.access?.executionGrants)
    ? command.access.executionGrants.filter(grant => grant?.feature)
    : [];
}

function executionActionsForAction(action = {}) {
  if (action.actionKind === 'runCommand') return { run: true };
  if (action.actionKind === 'updateEntity') return { update: true, edit: true };
  return { create: true };
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
  if (action.parentEntityType) {
    sources.push({ entityType: action.parentEntityType, level: 'read', actions: { view: true } });
  }
  if (action.construction?.mode === 'bakeCassetteDesignFromTemplate') {
    sources.push({ entityType: 'cassette', level: 'read', actions: { view: true } });
  }
  if (action.construction?.mode === 'importCassetteDesignFromArtifact') {
    sources.push({ entityType: 'artifact', level: 'read', actions: { view: true } });
  }
  for (const field of [
    ...(action.construction?.inputs || []),
    ...(action.inputPolicy?.fields || []),
    ...(action.inputs || [])
  ]) {
    if (field?.entityType && (field.type === 'entity' || field.kind === 'entity' || field.relationKey || field.id === 'parent')) {
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
  const fieldPolicy = getEntityFieldAccessPolicy(entityType) || domain?.fieldAccess?.[entityType];
  if (fieldPolicy?.feature) return fieldPolicy.feature;
  if (entity?.feature) return entity.feature;
  if (entity?.collection) return entity.collection;
  return entityType;
}

function pickMutationData(data = {}, action = {}, entities = {}) {
  const fields = action.mutation?.fields || [];
  if (!fields.length) return {};
  const picked = {};
  for (const field of fields) {
    const relationKey = field.startsWith('relations.') ? field.slice('relations.'.length) : '';
    const value = getByPath(data, field)
      ?? (relationKey ? (entities[`relation:${relationKey}`] ?? entities[relationKey]) : undefined);
    if (value !== undefined) setByPath(picked, field, value);
  }
  return picked;
}

async function normalizeProcessMutation(entityType, mutation = {}, action = {}, auth = {}) {
  const policy = getEntityFieldAccessPolicy(entityType) || getDomain().fieldAccess?.[entityType];
  const writable = action.access?.level === 'admin'
    ? [...(policy?.write || []), ...(policy?.admin || [])]
    : [...(policy?.write || [])];
  const fields = action.mutation?.fields || [];
  for (const field of fields) {
    if (!fieldPathAllowed(field, writable)) {
      throw createError({ statusCode: 400, message: `Action cannot update protected field ${field}` });
    }
  }

  if (!mutation.relations) return mutation;
  const normalizedRelations = {};
  for (const [key, value] of Object.entries(mutation.relations)) {
    const relation = (getDomain().relations || []).find(item => item.ownerType === entityType && item.key === key);
    const input = (action.inputs || []).find(item => item.relationKey === key || item.id === `relation:${key}`);
    if (!relation || !input) {
      throw createError({ statusCode: 400, message: `Action cannot write undeclared relation ${entityType}.${key}` });
    }
    const values = Array.isArray(value) ? value : [value];
    const refs = [];
    for (const item of values) {
      const ref = normalizeRelationRef(item, relation.targetType);
      await assertRelationTargetAvailable(ref, relation, auth);
      refs.push(ref);
    }
    if (relation.cardinality === 'one' && refs.length !== 1) {
      throw createError({ statusCode: 400, message: `Relation ${entityType}.${key} accepts exactly one entity` });
    }
    normalizedRelations[key] = relation.cardinality === 'many'
      ? Array.from(new Map(refs.map(ref => [`${ref.type}:${ref.id}:${ref.revisionId || ''}`, ref])).values())
      : refs[0];
  }
  return { ...mutation, relations: normalizedRelations };
}

async function assertRelationTargetAvailable(ref, relation = {}, auth = {}) {
  const service = getAppRegistry().getEntityService(relation.targetType);
  const target = await service?.getById?.(ref.id, auth.userId, auth.organizationId, auth.role, auth);
  if (!target) throw createError({ statusCode: 404, message: `${relation.targetType} relation target not found` });
  const entity = target?.toJSON ? target.toJSON() : target;
  const definition = (getDomain().entities || []).find(item => normalizeEntityType(item.type) === normalizeEntityType(relation.targetType));
  assertEntityAccess({
    entity,
    entityType: relation.targetType,
    feature: resolveEntityFeature(definition?.type || relation.targetType),
    level: 'read',
    action: 'view',
    auth
  });
  if (!ref.revisionId) return;
  const revision = await entityRevisionsService.getById(ref.revisionId, auth.userId, auth.role, auth);
  const source = revision?.data?.source;
  if (normalizeEntityType(source?.type) !== normalizeEntityType(relation.targetType) || String(source?.id) !== String(ref.id)) {
    throw createError({ statusCode: 400, message: `Pinned revision does not belong to ${relation.targetType} ${ref.id}` });
  }
}

function normalizeRelationRef(value, targetType) {
  const ref = normalizeEntityRef(typeof value === 'object' ? value : { type: targetType, id: value });
  if (!ref || normalizeEntityType(ref.type) !== normalizeEntityType(targetType)) {
    throw createError({ statusCode: 400, message: `Relation target must be ${targetType}` });
  }
  return { ...ref, type: targetType };
}

function fieldPathAllowed(path, patterns = []) {
  return patterns.some(pattern => pattern === path || (pattern.endsWith('.*') && (path === pattern.slice(0, -2) || path.startsWith(pattern.slice(0, -1)))));
}

async function persistProcessEntityPatch(entityType, targetId, patch, auth) {
  const service = getAppRegistry().getEntityService(entityType);
  if (!service?.getById || !service?.processUpdate) {
    throw createError({ statusCode: 500, message: `Entity service cannot persist process updates for ${entityType}` });
  }
  const entityResult = await service.getById(targetId, auth.userId, auth.organizationId, auth.role, auth);
  const entity = entityResult?.toJSON ? entityResult.toJSON() : entityResult;
  if (!entity) throw createError({ statusCode: 404, message: `${entityType} not found` });
  assertEntityAccess({
    entity,
    entityType,
    feature: resolveEntityFeature(entityType),
    level: 'write',
    action: 'update',
    auth
  });
  return await service.processUpdate(targetId, patch, auth);
}

function flattenMutationPatch(source = {}, prefix = '', result = {}) {
  for (const [key, value] of Object.entries(source || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      flattenMutationPatch(value, path, result);
    } else {
      result[path] = value;
    }
  }
  return result;
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
