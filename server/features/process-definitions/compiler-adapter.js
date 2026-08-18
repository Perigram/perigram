import { createError } from 'h3';
import {
  normalizeProcessDefinition,
  PROCESS_DATAFLOW_VERSION,
  requiredEntityProfileTypes,
  validateProcessDefinition,
  validateRequiredInputAvailability
} from '~/packages/processes/src/index.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

function capabilityBindings(domain = {}) {
  const registry = getAppRegistry();
  const capabilities = {};
  for (const entity of domain.entities || []) {
    const record = registry?.getEntityService?.(entity.type)?.processCapabilities;
    if (record) capabilities[entity.type] = record;
  }
  return capabilities;
}

export function validateActivatableProcess(data = {}, domain = {}, roles = {}) {
  const capabilities = capabilityBindings(domain);
  const validation = validateProcessDefinition(data, domain, {
    roles,
    ...(Object.keys(capabilities).length ? { capabilities } : {})
  });
  const process = validation.definition || normalizeProcessDefinition(data);
  const availabilityErrors = validateRequiredInputAvailability(process, domain);
  const requiredTypes = requiredEntityProfileTypes(process, domain);
  const missingProfiles = requiredTypes.filter(entityType => !new Set(
    Object.values(process.entityProfiles || {}).map(profile => profile.entityType)
  ).has(entityType));
  const errors = [
    ...(validation.errors || []),
    ...availabilityErrors,
    ...(missingProfiles.length ? [`Nesting exposure requires entity profiles and workflows for: ${missingProfiles.join(', ')}`] : [])
  ];
  if (!errors.length) return validation;
  return { ...validation, ok: false, errors };
}

export function assertCurrentProcessDefinition(data = {}) {
  if (Number(data.dataflowVersion) !== PROCESS_DATAFLOW_VERSION) {
    throw createError({
      statusCode: 409,
      message: `Process dataflow version ${PROCESS_DATAFLOW_VERSION} is required`
    });
  }
}

export function currentProcessDefinition(data = {}) {
  assertCurrentProcessDefinition(data);
  return structuredClone(data);
}
