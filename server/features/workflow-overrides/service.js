import { createError } from 'h3';
import { normalizeTypeId } from '~/server/runtime/entities.js';
import { normalizeWorkflow } from '#packages/workflows/src/index.js';
import { resolveProcessWorkflow, getActiveCompiledProcess } from '~/server/features/process-definitions/runtime.js';
import * as repository from './repository.js';

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

  // Resolution-order law: README §Responsibility.
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
