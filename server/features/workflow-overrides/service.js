import { createError } from 'h3';
import { getCutkitRegistry } from '~/server/runtime/cutkit-registry.js';
import { normalizeEntityType } from '~/server/runtime/entities.js';
import { assertEntityAccess } from '~/server/core/access/service.js';
import { normalizeWorkflow } from '~/packages/workflows/src/index.js';
import { resolveProcessWorkflow } from '~/server/features/process-definitions/runtime.js';
import * as repository from './repository.js';

export async function getByEntity(entityType, auth) {
  const organizationId = resolveOrganizationId(auth);
  const normalizedEntityType = assertKnownEntityType(entityType);
  assertWorkflowAdmin({ entityType: normalizedEntityType, organizationId, auth });
  const override = await repository.findLatestByEntity({ organizationId, entityType: normalizedEntityType });
  return serializeOverride(override);
}

export async function activate(entityType, payload = {}, auth) {
  const organizationId = resolveOrganizationId(auth);
  const normalizedEntityType = assertKnownEntityType(entityType);
  assertWorkflowAdmin({ entityType: normalizedEntityType, organizationId, auth });

  const workflow = normalizeWorkflowPayload(payload.workflow || payload);
  await repository.archiveActive({
    organizationId,
    entityType: normalizedEntityType,
    updatedBy: auth.userId
  });
  const created = await repository.create({
    organizationId,
    entityType: normalizedEntityType,
    workflow,
    status: 'ACTIVE',
    createdBy: auth.userId,
    updatedBy: auth.userId
  });
  return serializeOverride(created);
}

export async function resolveActiveWorkflow({ entityType, organizationId }) {
  const normalizedEntityType = normalizeEntityType(entityType);
  const defaultWorkflow = getDefaultWorkflow(normalizedEntityType);
  if (!organizationId) return defaultWorkflow;

  const processWorkflow = await resolveProcessWorkflow({
    organizationId,
    entityType: normalizedEntityType,
    fallbackWorkflow: null
  });
  if (processWorkflow) {
    return mergeSystemWorkflowTransitions({
      processWorkflow: normalizeWorkflowPayload(processWorkflow),
      defaultWorkflow
    });
  }

  const override = await repository.findActiveByEntity({ organizationId, entityType: normalizedEntityType });
  return override?.workflow ? normalizeWorkflowPayload(override.workflow) : defaultWorkflow;
}

export function resolveDefaultWorkflow(entityType) {
  return getDefaultWorkflow(normalizeEntityType(entityType));
}

function getDefaultWorkflow(entityType) {
  const domain = getCutkitRegistry().getDomain('cnc');
  return domain?.workflows?.[entityType] || null;
}

function normalizeWorkflowPayload(workflow) {
  try {
    return normalizeWorkflow(workflow);
  } catch (error) {
    throw createError({ statusCode: 400, message: `Invalid workflow definition: ${error.message}` });
  }
}

function mergeSystemWorkflowTransitions({ processWorkflow, defaultWorkflow }) {
  if (!processWorkflow || !defaultWorkflow) return processWorkflow || defaultWorkflow;

  const merged = normalizeWorkflowPayload(processWorkflow);
  const systemWorkflow = normalizeWorkflowPayload(defaultWorkflow);
  const primaryRegionId = merged.primaryRegion || 'main';
  const processStateIds = new Set(Object.keys(merged.regions?.[primaryRegionId]?.states || {}));

  for (const [regionId, systemRegion] of Object.entries(systemWorkflow.regions || {})) {
    const targetRegionId = merged.regions?.[regionId] ? regionId : primaryRegionId;
    const targetRegion = merged.regions?.[targetRegionId];
    if (!targetRegion) continue;

    for (const [stateId, state] of Object.entries(systemRegion.states || {})) {
      if (!targetRegion.states[stateId]) {
        targetRegion.states[stateId] = { ...state };
      }
    }

    for (const transition of systemRegion.transitions || []) {
      if (!isSystemTransition(transition)) continue;
      const exists = targetRegion.transitions.some(item => (
        item.from === transition.from &&
        item.to === transition.to &&
        (item.intent || '') === (transition.intent || '')
      ));
      if (!exists) {
        targetRegion.transitions.push({ ...transition, region: targetRegionId });
      }
      if (targetRegionId !== primaryRegionId) continue;
      for (const stateId of processStateIds) {
        const handlesIntent = targetRegion.transitions.some(item => item.from === stateId && item.intent === transition.intent);
        if (!handlesIntent) {
          targetRegion.transitions.push({
            ...transition,
            from: stateId,
            to: stateId,
            region: targetRegionId
          });
        }
      }
    }
  }

  return normalizeWorkflowPayload(merged);
}

function isSystemTransition(transition = {}) {
  return Boolean(transition.intent && transition.access?.system);
}

function assertKnownEntityType(entityType) {
  const normalized = normalizeEntityType(entityType);
  if (!getCutkitRegistry().getEntityDefinition(normalized)) {
    throw createError({ statusCode: 400, message: `Unknown entity type: ${entityType}` });
  }
  return normalized;
}

function assertWorkflowAdmin({ entityType, organizationId, auth }) {
  assertEntityAccess({
    entity: { lineage: { organizationId } },
    entityType,
    feature: entityTypeToFeature(entityType),
    level: 'admin',
    auth
  });
}

function entityTypeToFeature(entityType) {
  if (entityType === 'project') return 'projects';
  if (entityType === 'queue') return 'queues';
  if (['material', 'material_pile', 'sheet', 'remnant', 'geometry_capture'].includes(entityType)) return 'materials';
  if (entityType === 'requisition') return 'requisitions';
  if (entityType.includes('cassette')) return 'projects';
  return entityType.replace(/_/g, '-');
}

function resolveOrganizationId(auth = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId;
  if (!organizationId) {
    throw createError({ statusCode: 403, message: 'Organization membership is required' });
  }
  return organizationId;
}

function serializeOverride(override) {
  if (!override) return null;
  return {
    _id: override._id,
    organizationId: override.organizationId,
    entityType: override.entityType,
    workflow: override.workflow,
    status: override.status,
    createdBy: override.createdBy,
    updatedBy: override.updatedBy,
    createdAt: override.createdAt,
    updatedAt: override.updatedAt
  };
}
