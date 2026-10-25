import { createError } from 'h3';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { normalizeTypeId } from '~/server/runtime/entities.js';
import { assertEntityAccess } from '~/server/core/access/service.js';
import { normalizeWorkflow } from '#packages/workflows/src/index.js';
import { resolveProcessWorkflow, getActiveCompiledProcess } from '~/server/features/process-definitions/runtime.js';
import * as repository from './repository.js';

export async function getByEntity(typeId, auth) {
  const organizationId = resolveOrganizationId(auth);
  const normalizedTypeId = assertKnownTypeId(typeId);
  assertWorkflowAdmin({ typeId: normalizedTypeId, organizationId, auth });
  const override = await repository.findLatestByEntity({ organizationId, typeId: normalizedTypeId });
  return serializeOverride(override);
}

export async function activate(typeId, payload = {}, auth) {
  const organizationId = resolveOrganizationId(auth);
  const normalizedTypeId = assertKnownTypeId(typeId);
  assertWorkflowAdmin({ typeId: normalizedTypeId, organizationId, auth });

  const workflow = normalizeWorkflowPayload(payload.workflow || payload);
  await repository.archiveActive({
    organizationId,
    typeId: normalizedTypeId,
    updatedBy: auth.userId
  });
  const created = await repository.create({
    organizationId,
    typeId: normalizedTypeId,
    workflow,
    status: 'ACTIVE',
    createdBy: auth.userId,
    updatedBy: auth.userId
  });
  return serializeOverride(created);
}

export async function resolveActiveWorkflow({ typeId, organizationId, producerOutputId }) {
  const normalizedTypeId = normalizeTypeId(typeId);
  if (!organizationId) {
    return null;
  }

  const processWorkflow = producerOutputId ? await resolveProcessWorkflow({
    organizationId,
    producerOutputId,
    typeId: normalizedTypeId,
    fallbackWorkflow: null
  }) : null;
  if (processWorkflow) return normalizeWorkflowPayload(processWorkflow);

  // Machines are graph-derived (SPEC §7): the active compiled process is
  // the lifecycle source. A specific producer output wins when the caller
  // names one; otherwise the first producer emitting the type serves its
  // machine — the plain transition channel carries no producer context,
  // and without this lookup org-authored stateful types would resolve no
  // machine at all. The explicit org override stays the escape hatch for
  // types the active process does not govern.
  const compiled = await getActiveCompiledProcess(organizationId);
  const byType = Object.values(compiled?.producerOutputs || {})
    .find(output => output?.typeId === normalizedTypeId && output?.workflow);
  if (byType) return normalizeWorkflowPayload(byType.workflow);

  const override = await repository.findActiveByEntity({ organizationId, typeId: normalizedTypeId });
  if (override?.workflow) return normalizeWorkflowPayload(override.workflow);
  return null;
}

function normalizeWorkflowPayload(workflow) {
  try {
    return normalizeWorkflow(workflow);
  } catch (error) {
    throw createError({ statusCode: 400, message: `Invalid workflow definition: ${error.message}` });
  }
}

function assertKnownTypeId(typeId) {
  const normalized = normalizeTypeId(typeId);
  if (!getAppRegistry().getInstanceDefinition(normalized)) {
    throw createError({ statusCode: 400, message: `Unknown entity type: ${typeId}` });
  }
  return normalized;
}

function assertWorkflowAdmin({ typeId, organizationId, auth }) {
  assertEntityAccess({
    entity: { lineage: { organizationId } },
    typeId,
    feature: typeIdToFeature(typeId),
    level: 'admin',
    auth
  });
}

function typeIdToFeature(typeId) {
  return typeId.replace(/_/g, '-');
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
    typeId: override.typeId,
    workflow: override.workflow,
    status: override.status,
    createdBy: override.createdBy,
    updatedBy: override.updatedBy,
    createdAt: override.createdAt,
    updatedAt: override.updatedAt
  };
}
