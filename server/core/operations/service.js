import { createError } from 'h3';
import {
  createOperationResult,
  defineOperation,
  getOperationDefinition,
  getOperationHandler,
  getService
} from '../blocks/index.js';
import { assertOperationAccess } from '../access/service.js';
import { cncOperations } from '@cutkit/domain-cnc';

for (const operation of Object.values(cncOperations)) {
  defineOperation(operation);
}

export async function executeServerOperation(operationId, input = {}, auth) {
  const operation = getOperationDefinition(operationId);
  if (!operation) throw createError({ statusCode: 400, message: `Unknown operation: ${operationId}` });

  const entities = await loadOperationEntities(operation, input.entities || {});
  assertOperationAccess({ operation, entities, auth });

  const handler = getOperationHandler(operationId);
  if (!handler) throw createError({ statusCode: 500, message: `Operation handler not registered: ${operationId}` });

  const result = await handler({
    operation,
    entities,
    data: input.data || {},
    auth
  });

  return createOperationResult({ operationId, ...(result || {}) });
}

async function loadOperationEntities(operation, refs) {
  const loaded = {};
  for (const input of operation.input?.entities || []) {
    const id = refs[input.name] || refs[input.type];
    if (!id && input.required) throw createError({ statusCode: 400, message: `Operation ${operation.id} requires ${input.name}` });
    if (!id) continue;

    const service = getService(input.type);
    if (!service?.getById) throw createError({ statusCode: 500, message: `Entity service missing for ${input.type}` });
    const entity = await service.getById(id);
    if (!entity) throw createError({ statusCode: 404, message: `${input.type} not found` });
    loaded[input.name] = entity;
  }
  return loaded;
}
