import { createError, defineEventHandler, readBody } from 'h3';
import { statusService } from '~/server/core/machines/service.js';
import { requireAuth } from '~/server/utils/permissions.js';
import * as entityEventService from '~/server/features/entity-events/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const entityType = body?.entityType || body?.type;
  const targetId = body?.id || body?.targetId;
  const targetState = body?.status || body?.state;
  const intent = body?.intent || null;

  if (!entityType || !targetId || (!targetState && !intent)) {
    throw createError({ statusCode: 400, message: 'entityType, id, and status or intent are required' });
  }

  const result = await statusService.transitionWithResult({
    entityType,
    targetId,
    targetState,
    intent,
    auth,
    context: body.statusMeta || body.context || {}
  });
  await publishTransitionEvents(auth, entityType, targetId, result);
  return result;
});

async function publishTransitionEvents(auth, entityType, targetId, result = {}) {
  await entityEventService.publishEntityChanged(auth, {
    type: entityType,
    id: result.entity?._id || targetId,
    change: 'updated',
    reason: 'status-transition'
  });

  for (const changed of normalizedEffectEntities(result.effects)) {
    await entityEventService.publishEntityChanged(auth, {
      type: changed.type,
      id: changed.id || changed.entity?._id,
      change: 'updated',
      reason: 'status-transition-effect'
    });
  }
}

function normalizedEffectEntities(effects) {
  if (!effects) return [];
  if (Array.isArray(effects)) return effects.flatMap(effect => effect?.entities || []);
  return effects.entities || [];
}
