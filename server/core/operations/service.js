import { createError } from 'h3';
import {
  createServiceActionResult,
  defineServiceAction,
  defineServiceContract,
  defineDomain
} from '../blocks/index.js';
import { assertServiceActionAccess } from '../access/service.js';
import { getCutkitRegistry } from '../../runtime/cutkit-registry.js';
import * as serviceActionRunsRepository from './repository.js';

export function registerOperationDomain(domain) {
  if (domain?.id) return defineDomain(domain);
  for (const contract of Object.values(domain?.services || domain?.serviceContracts || {})) {
    defineServiceContract(contract);
  }
  for (const action of Object.values(domain?.operations || domain?.serviceActions || {})) {
    defineServiceAction(action);
  }
  return domain;
}

export async function executeServiceAction(actionId, input = {}, auth) {
  const registry = getCutkitRegistry();
  const action = registry.getServiceActionDefinition(actionId);
  if (!action) throw createError({ statusCode: 400, message: `Unknown service action: ${actionId}` });
  const normalizedInput = normalizeServiceActionInput(input);
  const parameters = validateServiceActionParameters(action, normalizedInput.parameters);

  const run = await serviceActionRunsRepository.create({
    actionId,
    service: action.service,
    action: action.action,
    status: 'RUNNING',
    input: sanitizeServiceActionInput({ ...normalizedInput, parameters }),
    entityRefs: normalizedInput.entities || {},
    auth: sanitizeAuth(auth),
    startedAt: new Date()
  });

  try {
    const entities = await loadServiceActionEntities(action, normalizedInput.entities || {});
    assertServiceActionAccess({ action, entities, auth });

    const handler = registry.getServiceActionHandler(actionId);
    if (!handler) throw createError({ statusCode: 500, message: `Service action handler not registered: ${actionId}` });

    const result = createServiceActionResult({
      actionId,
      ...(await handler({
        action,
        entities,
        parameters,
        data: parameters,
        auth
      }) || {})
    });

    await serviceActionRunsRepository.updateById(run._id, {
      status: 'SUCCEEDED',
      result,
      finishedAt: new Date()
    });

    return result;
  } catch (error) {
    await serviceActionRunsRepository.updateById(run._id, {
      status: 'FAILED',
      error: {
        message: error.message,
        statusCode: error.statusCode || error.status || 500
      },
      finishedAt: new Date()
    });
    throw error;
  }
}

export function listServiceActions() {
  const registry = getCutkitRegistry();
  return registry.listServiceActionDefinitions().map(action => ({
    id: action.id,
    service: action.service,
    action: action.action,
    label: action.label || action.id,
    source: action.source || 'registered-domain',
    handlerRegistered: Boolean(registry.getServiceActionHandler(action.id)),
    input: action.input || {},
    output: action.output || {},
    triggers: action.triggers || [],
    access: action.access || {}
  }));
}

export async function listServiceActionRuns(filter = {}) {
  return serviceActionRunsRepository.list(filter);
}

async function loadServiceActionEntities(action, refs) {
  const registry = getCutkitRegistry();
  const loaded = {};
  for (const input of action.input?.entities || []) {
    const id = refs[input.name] || refs[input.type];
    if (!id && input.required) throw createError({ statusCode: 400, message: `Service action ${action.id} requires ${input.name}` });
    if (!id) continue;

    const service = registry.getService(input.type);
    if (!service?.getById) throw createError({ statusCode: 500, message: `Entity service missing for ${input.type}` });
    const entity = await service.getById(id);
    if (!entity) throw createError({ statusCode: 404, message: `${input.type} not found` });
    loaded[input.name] = entity;
  }
  return loaded;
}

function sanitizeServiceActionInput(input = {}) {
  return {
    entities: input.entities || {},
    parameters: input.parameters || {}
  };
}

function sanitizeAuth(auth = {}) {
  return {
    userId: auth.userId,
    organizationId: auth.organizationId,
    role: auth.role
  };
}

function normalizeServiceActionInput(input = {}) {
  return {
    entities: input.entities || {},
    parameters: input.parameters || input.data || {}
  };
}

function validateServiceActionParameters(action, parameters = {}) {
  const fields = action.input?.parameters || [];
  const result = {};
  for (const field of fields) {
    const value = parameters[field.name] ?? field.default;
    if (field.required && (value === undefined || value === null || value === '')) {
      throw createError({ statusCode: 400, message: `Service action ${action.id} requires parameter ${field.name}` });
    }
    if (value === undefined || value === null || value === '') continue;
    result[field.name] = coerceParameterValue(action, field, value);
  }
  return result;
}

function coerceParameterValue(action, field, value) {
  if (field.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw createError({ statusCode: 400, message: `Service action ${action.id} parameter ${field.name} must be a number` });
    if (field.min !== undefined && number < field.min) throw createError({ statusCode: 400, message: `Service action ${action.id} parameter ${field.name} is below minimum` });
    if (field.max !== undefined && number > field.max) throw createError({ statusCode: 400, message: `Service action ${action.id} parameter ${field.name} is above maximum` });
    return number;
  }
  if (field.type === 'boolean') return value === true || value === 'true';
  if (field.type === 'enum') {
    const allowed = (field.options || []).map(option => typeof option === 'object' ? option.value : option);
    if (!allowed.includes(value)) throw createError({ statusCode: 400, message: `Service action ${action.id} parameter ${field.name} has invalid option` });
    return value;
  }
  if (field.type === 'array' && !Array.isArray(value)) throw createError({ statusCode: 400, message: `Service action ${action.id} parameter ${field.name} must be an array` });
  if (field.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) throw createError({ statusCode: 400, message: `Service action ${action.id} parameter ${field.name} must be an object` });
  return value;
}
