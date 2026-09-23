import { createError } from 'h3';
import { getPerigramRegistry } from '~/server/runtime/perigram-registry.js';
import { normalizeTypeId } from '~/server/runtime/entities.js';
import { assertEntityAccess } from '~/server/core/access/service.js';
import { normalizeWorkflow } from '~/packages/workflows/src/index.js';
import { declarationWorkflow, normalizeType } from '~/packages/cts/src/index.js';
import { resolveProcessWorkflow } from '~/server/features/process-definitions/runtime.js';
import { declarationForType, staticTypeDeclaration } from '~/server/features/instances/service.js';
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
  const defaultWorkflow = getDefaultWorkflow(normalizedTypeId);
  if (!organizationId) {
    return defaultWorkflow || staticDeclarationWorkflow(normalizedTypeId);
  }

  const processWorkflow = producerOutputId ? await resolveProcessWorkflow({
    organizationId,
    producerOutputId,
    typeId: normalizedTypeId,
    fallbackWorkflow: null
  }) : null;
  if (processWorkflow) {
    return mergeSystemWorkflowTransitions({
      processWorkflow: normalizeWorkflowPayload(processWorkflow),
      defaultWorkflow
    });
  }

  const override = await repository.findActiveByEntity({ organizationId, typeId: normalizedTypeId });
  if (override?.workflow) return normalizeWorkflowPayload(override.workflow);
  // The declaration IS a machine source — but only for types the
  // hand-registered domain does not already govern: the domain workflow
  // keeps its precedence so legacy resolutions are unchanged, and a
  // declared lifecycle serves every type that previously resolved to no
  // machine at all.
  return defaultWorkflow
    || await resolveDeclarationWorkflow({ typeId: normalizedTypeId, organizationId })
    || null;
}

export function resolveDefaultWorkflow(typeId) {
  const normalizedTypeId = normalizeTypeId(typeId);
  return getDefaultWorkflow(normalizedTypeId) || staticDeclarationWorkflow(normalizedTypeId);
}

function getDefaultWorkflow(typeId) {
  const domain = getPerigramRegistry().getDomain('cnc');
  return domain?.workflows?.[typeId] || null;
}

// Declaration-derived machines (types whose lifecycle lives on their
// declaration, not in a hand-registered domain workflow). Tenancy follows
// the instances feature's cached declaration resolution: the org's stored
// declarations overlay the static system view. Derived machines cache by
// declaration identity — derivation is pure over the declaration, and the
// version key rotates exactly when a redefinition lands (invalidating
// with the declaration cache would otherwise need another write hook).
const declarationMachineCache = new Map();

async function resolveDeclarationWorkflow({ typeId, organizationId }) {
  const declaration = await declarationForType(typeId, organizationId);
  return machineFromDeclaration(declaration);
}

function staticDeclarationWorkflow(typeId) {
  return machineFromDeclaration(staticTypeDeclaration(typeId));
}

function machineFromDeclaration(declaration) {
  if (!declaration) return null;
  const cacheKey = `${declaration.id}@${declaration.organizationId || 'system'}|v${declaration.version || 1}`;
  if (declarationMachineCache.has(cacheKey)) return declarationMachineCache.get(cacheKey);
  let machine = null;
  try {
    machine = declarationWorkflow(normalizeType(declaration));
  } catch {
    // A declaration that cannot normalize serves no machine — identical
    // to a type without one, and the registry's own diagnostics own the
    // report.
    machine = null;
  }
  declarationMachineCache.set(cacheKey, machine);
  return machine;
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

function assertKnownTypeId(typeId) {
  const normalized = normalizeTypeId(typeId);
  if (!getPerigramRegistry().getInstanceDefinition(normalized)) {
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
  if (typeId === 'project') return 'projects';
  if (typeId === 'queue') return 'queues';
  if (['material', 'material_pile', 'sheet', 'remnant', 'geometry_capture'].includes(typeId)) return 'materials';
  if (typeId === 'requisition') return 'requisitions';
  if (typeId.includes('cassette')) return 'projects';
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
