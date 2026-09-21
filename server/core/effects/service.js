import { createError } from 'h3';
import { getAppRegistry } from '../../runtime/app-registry.js';
import { statusService } from '../machines/service.js';
import { enqueueTask } from '../tasks/service.js';
import { publishDomainEvent } from '../events/service.js';
import { getPrimaryState } from '~/server/core/blocks/index.js';

export async function processEffects(effects = [], context = {}) {
  const list = Array.isArray(effects) ? effects.filter(Boolean) : [effects].filter(Boolean);
  const processed = {
    entities: [],
    tasks: [],
    transitions: [],
    events: [],
    attachments: []
  };

  for (const effect of list) {
    if (Array.isArray(effect)) {
      const nested = await processEffects(effect, context);
      mergeProcessedEffects(processed, nested);
      continue;
    }

    const normalized = await processEffect(effect, context);
    mergeProcessedEffects(processed, normalized);
  }

  return processed;
}

export async function processEvents(events = [], context = {}) {
  const list = Array.isArray(events) ? events.filter(Boolean) : [events].filter(Boolean);
  const registry = context.registry || getAppRegistry();
  const processed = {
    entities: [],
    tasks: [],
    transitions: [],
    events: [],
    attachments: []
  };

  for (const event of list) {
    const normalizedEvent = normalizeDomainEvent(event, context);
    validateDomainEvent(normalizedEvent, registry);
    processed.events.push(normalizedEvent);

    const policies = registry.listEffectDefinitions?.()
      .filter(policy => policy.on === normalizedEvent.type || policy.on === normalizedEvent.id) || [];
    for (const policy of policies) {
      const policyEffects = (policy.effects || []).map(effect => ({ ...effect }));
      const result = await processEffects(policyEffects, {
        ...context,
        event: normalizedEvent,
        registry
      });
      mergeProcessedEffects(processed, result);
    }
    await publishDomainEvent(normalizedEvent, context.auth || {});
  }

  return processed;
}

async function processEffect(effect = {}, context = {}) {
  const type = effect.type || effect.kind;
  if (!type) throw createError({ statusCode: 400, message: 'Effect type is required' });

  if (type === 'transition') {
    const transition = await processTransitionEffect(effect, context);
    return { transitions: [transition], entities: transition.entity ? [transition.entity] : [] };
  }

  if (type === 'enqueueTask') {
    const task = await processTaskEffect(effect, context);
    return { tasks: [task], entities: task.entity ? [task.entity] : [] };
  }

  if (type === 'createEntity') {
    const entity = await processCreateEntityEffect(effect, context);
    return { entities: entity ? [entity] : [] };
  }

  if (type === 'updateEntity') {
    const entity = await processUpdateEntityEffect(effect, context);
    return { entities: entity ? [entity] : [] };
  }

  if (type === 'emit') {
    return { events: [normalizeEvent(effect, context)] };
  }

  if (type === 'relatedEntity') {
    const entity = resolveEntityRef(effect.entity || effect, context);
    if (!entity) throw createError({ statusCode: 400, message: 'relatedEntity effect requires entity ref' });
    return { entities: [entity] };
  }

  if (type === 'artifact') {
    const entity = resolveEntityRef(effect.entity || effect, context);
    return entity ? { entities: [entity] } : { attachments: [effect] };
  }

  throw createError({ statusCode: 400, message: `Unknown effect type: ${type}` });
}

async function processTransitionEffect(effect = {}, context = {}) {
  const entity = resolveEntityRef(effect.entity || effect.target || effect, context);
  if (!entity?.type || !entity?.id) {
    throw createError({ statusCode: 400, message: 'transition effect requires entity ref' });
  }

  const metadata = effect.metadata || context.metadata || {};
  const auth = context.auth || {};
  const transitionContext = context.transitionContext || {};
  const targetState = effect.targetState || effect.state || null;
  const intent = effect.intent || null;

  if (intent) {
    const result = await statusService.applyIntent(entity.type, entity.id, intent, auth, metadata, transitionContext);
    return {
      type: 'transition',
      entity,
      intent,
      targetState: getPrimaryState(result?.status, targetState),
      status: result?.status || null,
      effects: result?.effects || []
    };
  }
  if (!targetState) {
    throw createError({ statusCode: 400, message: 'transition effect requires targetState or intent' });
  }
  const result = await statusService.transition(entity.type, entity.id, targetState, auth.userId, auth, metadata);
  return {
    type: 'transition',
    entity,
    targetState,
    status: result || null
  };
}

async function processTaskEffect(effect = {}, context = {}) {
  const taskId = effect.taskId || effect.id || effect.task;
  if (!taskId) throw createError({ statusCode: 400, message: 'enqueueTask effect requires taskId' });
  const taskDefinition = (context.registry || getAppRegistry()).getTaskDefinition(taskId);
  const input = resolveTaskInput(effect.input || {}, effect, taskDefinition, context);
  const auth = effect.auth || context.auth || {};
  const options = effect.options || {};
  const task = await enqueueTask(taskId, input, auth, options);
  return {
    type: 'task_run',
    id: task._id?.toString?.() || task._id,
    entity: normalizeRef('task_run', task._id),
    taskId,
    status: task.status
  };
}

function resolveTaskInput(input = {}, effect = {}, taskDefinition = {}, context = {}) {
  const entities = { ...(input.entities || {}) };
  const parameters = { ...(input.parameters || {}) };
  const sourceEntity = resolveEntityRef(effect.entity || effect.source || {}, context);

  if (sourceEntity) {
    const sourceInput = (taskDefinition.input?.entities || []).find(entity => entity.type === sourceEntity.type);
    if (sourceInput && !entities[sourceInput.name]) entities[sourceInput.name] = sourceEntity.id;
  }

  return { entities, parameters };
}

async function processCreateEntityEffect(effect = {}, context = {}) {
  const entity = resolveEntityRef(effect.entity || effect, context);
  const data = effect.data || {};
  const service = resolveEntityService(entity?.type, context);
  const auth = effect.auth || context.auth || {};
  if (!service?.create) throw createError({ statusCode: 500, message: `Entity service missing create for ${entity?.type || 'unknown'}` });
  const created = await service.create(data, auth.userId, auth.organizationId, auth.role, auth);
  return normalizeRef(entity?.type, created?._id || created?.id);
}

async function processUpdateEntityEffect(effect = {}, context = {}) {
  const entity = resolveEntityRef(effect.entity || effect, context);
  const service = resolveEntityService(entity?.type, context);
  const auth = effect.auth || context.auth || {};
  if (!service) throw createError({ statusCode: 500, message: `Entity service missing for ${entity?.type || 'unknown'}` });

  if (effect.operation && typeof service[effect.operation] === 'function') {
    const args = Array.isArray(effect.args) ? effect.args : [];
    const result = await service[effect.operation](
      entity.id,
      ...(args.length ? args : [effect.input || effect.data || {}]),
      auth.userId,
      auth.organizationId,
      auth.role,
      auth
    );
    return normalizeEntityResult(entity.type, result);
  }

  if (typeof service.update === 'function') {
    const result = await service.update(
      entity.id,
      effect.input || effect.data || {},
      auth.userId,
      auth.organizationId,
      auth.role,
      auth
    );
    return normalizeEntityResult(entity.type, result);
  }

  throw createError({ statusCode: 500, message: `Entity service ${entity?.type || 'unknown'} cannot be updated` });
}

function resolveEntityService(typeId, context) {
  if (!typeId) return null;
  const registry = context.registry || getAppRegistry();
  return registry.getEntityService(typeId);
}

function resolveEntityRef(entity = {}, context = {}) {
  if (entity?.type && entity?.id) {
    return { type: entity.type, id: entity.id.toString() };
  }

  if (entity?.from === 'event.source' && context.event?.source?.type && context.event?.source?.id) {
    return { type: context.event.source.type, id: context.event.source.id.toString() };
  }

  if (entity?.type && entity?.from && context[entity.from]?.type && context[entity.from]?.id) {
    return { type: context[entity.from].type, id: context[entity.from].id.toString() };
  }

  if (entity?.type && typeof entity.from === 'string' && entity.from.startsWith('event.entities.')) {
    const key = entity.from.slice('event.entities.'.length);
    const ref = (context.event?.entities || []).find(item => (
      item.name === key || item.type === key || item.type === entity.type
    ));
    if (ref?.id) return { type: entity.type, id: ref.id.toString() };
  }

  return null;
}

function normalizeEntityResult(typeId, result) {
  if (!result) return null;
  const id = result._id || result.id;
  if (!id) return null;
  return normalizeRef(typeId, id);
}

function normalizeRef(type, id) {
  if (!type || !id) return null;
  return { type, id: id.toString() };
}

function normalizeEvent(effect, context) {
  return {
    type: effect.eventType || effect.name || effect.type,
    source: effect.source || context.source || null,
    entities: effect.entities || [],
    data: effect.data || {}
  };
}

function normalizeDomainEvent(event = {}, context = {}) {
  const type = event.type || event.id || event.event;
  if (!type) throw createError({ statusCode: 400, message: 'Domain event type is required' });
  return {
    type,
    source: event.source || context.source || null,
    entities: Array.isArray(event.entities) ? event.entities : [],
    data: event.data || {}
  };
}

function validateDomainEvent(event, registry) {
  const definition = registry.getEventDefinition?.(event.type);
  if (!definition) {
    throw createError({ statusCode: 500, message: `Domain event is not declared: ${event.type}` });
  }
  const hasPolicy = registry.listEffectDefinitions?.().some(policy => policy.on === event.type);
  if (!hasPolicy && definition.informational !== true) {
    throw createError({ statusCode: 500, message: `Domain event has no effect policy and is not informational: ${event.type}` });
  }
}

function mergeProcessedEffects(target, source) {
  target.entities.push(...(source.entities || []));
  target.tasks.push(...(source.tasks || []));
  target.transitions.push(...(source.transitions || []));
  target.events.push(...(source.events || []));
  target.attachments.push(...(source.attachments || []));
}
