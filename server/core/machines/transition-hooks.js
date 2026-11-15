import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import { getAppRegistry } from '../../runtime/app-registry.js';

// Hook contracts live in whichever registered domain declares them (a
// pack mounting `hookHandlers` declares them beside its domain); the
// engine owns no handler names.
function findHookContract(handler) {
  for (const domain of getAppRegistry().listDomains()) {
    const contract = domain?.hooks?.[handler];
    if (contract) return contract;
  }
  return null;
}

export function validateHookParams(hookConfig = {}) {
  const contract = findHookContract(hookConfig.handler);
  if (!contract) throw createError({ statusCode: 500, message: `Hook contract missing for ${hookConfig.handler}` });

  const params = hookConfig.params || {};
  const fields = contract.parameters || [];
  const names = new Set(fields.map(field => field.name));
  for (const field of fields) {
    if (field.required && (params[field.name] === undefined || params[field.name] === null || params[field.name] === '')) {
      throw createError({ statusCode: 500, message: `Hook ${hookConfig.handler} requires parameter ${field.name}` });
    }
  }
  for (const key of Object.keys(params)) {
    if (!names.has(key)) throw createError({ statusCode: 500, message: `Hook ${hookConfig.handler} has unknown parameter ${key}` });
  }
}

export async function assertTransitionPreflight({ transition, entity, targetId, targetType, currentState, auth }) {
  const hasBeforeHooks = (transition?.hooks || []).some(hook => (hook.phase || 'after') === 'before');
  if (!hasBeforeHooks) return;

  const actorId = auth.userId || 'SYSTEM';
  await runTransitionHooks(
    transition,
    'before',
    {
      targetId: toFlexibleId(targetId),
      targetType,
      fromState: currentState,
      toState: transition.to,
      userId: actorId,
      userRole: auth.role,
      auth,
      lineage: entity.lineage,
      entity,
      dryRun: true
    },
    { collectEffects: false, log: false }
  );
}

export function isConfigurationError(error) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  return !statusCode || statusCode >= 500;
}

export async function runTransitionHooks(transition, phase, context, options = {}) {
  const effects = [];
  const registry = getAppRegistry();
  const { collectEffects = true, log = true } = options;

  for (const hookConfig of transition?.hooks || []) {
    const hookPhase = hookConfig.phase || 'after';
    if (hookPhase !== phase) continue;

    validateHookParams(hookConfig);
    const hookFn = resolveHookHandler(registry, context.targetType, hookConfig.handler);
    if (!hookFn) {
      console.warn(`[Status Engine] Hook "${hookConfig.handler}" not found in core or ${context.targetType} service.`);
      continue;
    }

    const runHook = async () => {
      if (log) console.log(`[Status Engine] Executing hook ${hookConfig.handler} for ${context.targetType} ${context.targetId}`);
      const result = await hookFn(context, hookConfig.params || {});
      if (collectEffects) appendHookEffects(effects, result);
    };

    if (phase === 'before' || isSynchronousHook(hookConfig)) {
      await runHook();
    } else {
      runHook().catch(err => {
        console.error(`[Status Engine] Hook ${hookConfig.handler} failed:`, err.message);
      });
    }
  }

  return effects;
}

function resolveHookHandler(registry, typeId, handler) {
  const hookFn = registry.getHookHandler(handler);
  if (hookFn) return hookFn;

  const service = registry.getInstanceService(typeId);
  return service?.hooks?.[handler] || null;
}

function isSynchronousHook(hookConfig = {}) {
  const contract = findHookContract(hookConfig.handler);
  return hookConfig.mode === 'sync' || hookConfig.blocking === true || contract?.mode === 'sync';
}

function appendHookEffects(effects, result) {
  if (!result) return;
  if (Array.isArray(result)) {
    effects.push(...result.filter(Boolean));
    return;
  }
  if (Array.isArray(result.effects)) {
    effects.push(...result.effects.filter(Boolean));
  }
  if (Array.isArray(result.entities)) {
    effects.push(...result.entities.filter(Boolean).map(entity => ({ type: 'relatedEntity', entity })));
  }
  if (result.type || result.kind || result.intent || result.targetState) {
    effects.push(result);
  }
}

