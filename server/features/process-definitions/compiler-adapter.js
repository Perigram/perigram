import { createError } from 'h3';
import {
  normalizeProcessDefinition,
  migrateProducerOutputIdentities,
  PROCESS_DATAFLOW_VERSION,
  validateProcessDefinition,
  validateRequiredInputAvailability,
  validateLineageBindingResolution
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
  const availability = validateRequiredInputAvailability(process, domain);
  const lineageResolution = validateLineageBindingResolution(process, domain);
  const errors = [
    ...(validation.errors || []),
    ...availability.map(diagnostic => diagnostic.message),
    ...lineageResolution.map(diagnostic => diagnostic.message)
  ];
  if (!errors.length) return validation;
  return {
    ...validation,
    ok: false,
    errors,
    diagnostics: [
      ...(validation.diagnostics || []),
      ...availability,
      ...lineageResolution
    ]
  };
}

export function assertCurrentProcessDefinition(data = {}) {
  if (Number(data.dataflowVersion) !== PROCESS_DATAFLOW_VERSION) {
    throw createError({
      statusCode: 409,
      message: `Process dataflow version ${PROCESS_DATAFLOW_VERSION} is required`
    });
  }
}

export function currentProcessDefinition(data = {}, domain = {}) {
  assertCurrentProcessDefinition(data);
  const migration = migrateProducerOutputIdentities(data, domain);
  if (migration.errors.length) {
    throw createError({
      statusCode: 400,
      message: migration.errors.join('; '),
      data: { errors: migration.errors }
    });
  }
  return migration.data;
}
