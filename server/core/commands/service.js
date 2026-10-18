import { createError } from 'h3';
import { createCommandResult, normalizeEntityOutputContracts, validateResultEntityOutputs } from '../blocks/index.js';
import { assertCommandAccess } from '../access/service.js';
import { getAppRegistry } from '../../runtime/app-registry.js';
import * as commandRunsRepository from './repository.js';
import { processEffects, processEvents } from '../effects/service.js';
import { resolveProcessCommandService } from '../../features/process-definitions/runtime.js';
import * as billingService from '../../features/billing/service.js';

export async function executeCommand(commandId, input = {}, auth = {}) {
  const registry = getAppRegistry();
  let command = registry.getCommandDefinition(commandId);
  if (!command) {
    // Plugin connector services declare their command on the install
    // snapshot (marketplace SPEC); the registry stays static. Dynamic
    // import keeps the module graph acyclic.
    const { commandDefinitionFor } = await import('../../features/plugins/service.js');
    command = await commandDefinitionFor(commandId, auth);
  }
  if (!command) throw createError({ statusCode: 400, message: `Unknown command: ${commandId}` });
  const normalizedInput = normalizeCommandInput(input);
  const parameters = validateCommandParameters(command, normalizedInput.parameters);

  const run = await commandRunsRepository.create({
    commandId,
    service: command.service,
    action: command.action,
    status: 'RUNNING',
    input: sanitizeCommandInput({ ...normalizedInput, parameters }),
    entityRefs: normalizedInput.entities || {},
    auth: sanitizeAuth(auth),
    startedAt: new Date()
  });

  try {
    const entities = await loadCommandEntities(registry, command, normalizedInput.entities || {});
    const processServiceState = await assertProcessServiceAvailable(commandId, auth);
    await billingService.assertSufficientServiceTokens({
      organizationId: resolveOrganizationId(auth),
      service: processServiceState.service,
      commandId
    });
    assertCommandAccess({ command, entities, auth });

    let handler = registry.getCommandHandler(commandId);
    if (!handler && command.plugin) {
      const { executeConnectorService } = await import('../../features/plugins/service.js');
      // Handlers receive one payload ({ command, parameters, auth }).
      handler = payload => executeConnectorService(payload.command, { parameters: payload.parameters, auth: payload.auth });
    }
    if (!handler) throw createError({ statusCode: 500, message: `Command handler not registered: ${commandId}` });

    const rawResult = await handler({
      command,
      entities,
      parameters,
      data: parameters,
      auth
    }) || {};
    const result = createCommandResult({
      commandId,
      ...rawResult,
      raw: rawResult
    });
    const effectContext = {
      auth,
      command,
      entities,
      result,
      registry: getAppRegistry()
    };
    const processedEvents = await processEvents(result.events || [], effectContext);
    const processedEffects = await processEffects(result.effects || [], effectContext);
    result.events = processedEvents.events;
    result.effects = mergeProcessedEffects(processedEvents, processedEffects);

    const outputViolations = validateResultEntityOutputs({
      contracts: normalizeEntityOutputContracts(command.output),
      entities: [
        ...result.entities || [],
        ...(result.effects?.entities || [])
      ],
      phase: 'immediate'
    });
    if (outputViolations.length) {
      throw createError({ statusCode: 500, message: `Command ${commandId} result violates its declared output contract: ${outputViolations.join('; ')}` });
    }

    await commandRunsRepository.updateById(run._id, {
      status: 'SUCCEEDED',
      result,
      finishedAt: new Date()
    });

    const billing = await billingService.debitServiceTokens({
      organizationId: resolveOrganizationId(auth),
      service: processServiceState.service,
      commandId,
      commandRunId: run._id
    });
    if (billing) {
      result.billing = billing;
      await commandRunsRepository.updateById(run._id, {
        result,
        billing
      });
    }

    return result;
  } catch (error) {
    await commandRunsRepository.updateById(run._id, {
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

async function assertProcessServiceAvailable(commandId, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  const serviceState = await resolveProcessCommandService({ organizationId, commandId });
  if (!serviceState.processActive || !serviceState.gated) return serviceState;
  if (!serviceState.service) {
    throw createError({ statusCode: 403, message: `Command ${commandId} is not available in the active process` });
  }

  const allowedRoleIds = serviceState.service.roles?.run || [];
  if (!allowedRoleIds.length) return serviceState;
  const actualRoleIds = auth.roleAssignments?.roleIds || [];
  const allowed = actualRoleIds.some(roleId => allowedRoleIds.includes(roleId));
  if (!allowed) {
    throw createError({ statusCode: 403, message: `Command ${commandId} is not assigned to the current process role` });
  }
  return serviceState;
}

function resolveOrganizationId(auth = {}) {
  return auth.organizationId || auth.memberships?.[0]?.organizationId || null;
}

function mergeProcessedEffects(left, right) {
  return {
    entities: [...(left.entities || []), ...(right.entities || [])],
    tasks: [...(left.tasks || []), ...(right.tasks || [])],
    transitions: [...(left.transitions || []), ...(right.transitions || [])],
    events: [...(left.events || []), ...(right.events || [])],
    attachments: [...(left.attachments || []), ...(right.attachments || [])]
  };
}

export function listCommands() {
  const registry = getAppRegistry();
  return registry.listCommandDefinitions().map(command => ({
    id: command.id,
    service: command.service,
    action: command.action,
    label: command.label || command.id,
    source: command.source || 'registered-domain',
    handlerRegistered: Boolean(registry.getCommandHandler(command.id)),
    input: command.input || {},
    output: command.output || {},
    triggers: command.triggers || [],
    access: command.access || {}
  }));
}

export async function listCommandRuns(filter = {}) {
  return commandRunsRepository.list(filter);
}

async function loadCommandEntities(registry, command, refs) {
  const loaded = {};
  for (const input of command.input?.entities || []) {
    const id = refs[input.name] || refs[input.type];
    if (!id && input.required) throw createError({ statusCode: 400, message: `Command ${command.id} requires ${input.name}` });
    if (!id) continue;

    const service = registry.getInstanceService(input.type);
    if (!service?.getById) throw createError({ statusCode: 500, message: `Entity service missing for ${input.type}` });
    const entity = await service.getById(id);
    if (!entity) throw createError({ statusCode: 404, message: `${input.type} not found` });
    loaded[input.name] = entity;
  }
  for (const input of command.input?.abstractEntities || []) {
    const ref = refs[input.name];
    if (!ref && input.required) throw createError({ statusCode: 400, message: `Command ${command.id} requires ${input.name}` });
    if (!ref) continue;

    const { type, id } = normalizeAbstractEntityRef(ref);
    if (!type || !id) throw createError({ statusCode: 400, message: `Command ${command.id} requires ${input.name} as { type, id }` });
    if (input.accepts?.length && !input.accepts.includes(type)) {
      throw createError({ statusCode: 400, message: `Command ${command.id} ${input.name} does not accept ${type}` });
    }

    const service = registry.getInstanceService(type);
    if (!service?.getById) throw createError({ statusCode: 500, message: `Entity service missing for ${type}` });
    const entity = await service.getById(id);
    if (!entity) throw createError({ statusCode: 404, message: `${type} not found` });
    loaded[input.name] = entity;
  }
  return loaded;
}

function normalizeAbstractEntityRef(ref) {
  if (!ref || typeof ref !== 'object') return {};
  return {
    type: ref.type || ref.typeId,
    id: ref.id || ref._id
  };
}

function sanitizeCommandInput(input = {}) {
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

function normalizeCommandInput(input = {}) {
  return {
    entities: input.entities || {},
    parameters: input.parameters || input.data || {}
  };
}

function validateCommandParameters(command, parameters = {}) {
  const fields = command.input?.parameters || [];
  const result = {};
  for (const field of fields) {
    const value = parameters[field.name] ?? field.default;
    if (field.required && (value === undefined || value === null || value === '')) {
      throw createError({ statusCode: 400, message: `Command ${command.id} requires parameter ${field.name}` });
    }
    if (value === undefined || value === null || value === '') continue;
    result[field.name] = coerceParameterValue(command, field, value);
  }
  return result;
}

function coerceParameterValue(command, field, value) {
  if (field.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw createError({ statusCode: 400, message: `Command ${command.id} parameter ${field.name} must be a number` });
    if (field.min !== undefined && number < field.min) throw createError({ statusCode: 400, message: `Command ${command.id} parameter ${field.name} is below minimum` });
    if (field.max !== undefined && number > field.max) throw createError({ statusCode: 400, message: `Command ${command.id} parameter ${field.name} is above maximum` });
    return number;
  }
  if (field.type === 'boolean') return value === true || value === 'true';
  if (field.type === 'enum') {
    const allowed = (field.options || []).map(option => typeof option === 'object' ? option.value : option);
    if (!allowed.includes(value)) throw createError({ statusCode: 400, message: `Command ${command.id} parameter ${field.name} has invalid option` });
    return value;
  }
  if (field.type === 'array' && !Array.isArray(value)) throw createError({ statusCode: 400, message: `Command ${command.id} parameter ${field.name} must be an array` });
  if (field.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) throw createError({ statusCode: 400, message: `Command ${command.id} parameter ${field.name} must be an object` });
  return value;
}
