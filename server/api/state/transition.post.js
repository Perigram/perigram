import { createError, defineEventHandler, readBody } from 'h3';
import { stateService } from '~/server/core/machines/service.js';
import { requireAuth } from '~/server/utils/permissions.js';
import * as entityEventService from '~/server/features/instance-events/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const typeId = body?.typeId || body?.type;
  const targetId = body?.id || body?.targetId;
  const targetState = body?.status || body?.state;
  const intent = body?.intent || null;

  if (!typeId || !targetId || (!targetState && !intent)) {
    throw createError({ statusCode: 400, message: 'typeId, id, and status or intent are required' });
  }

  const result = await stateService.transitionWithResult({
    typeId,
    targetId,
    targetState,
    intent,
    auth,
    context: {
      ...(body.stateMeta || body.context || {}),
      ...(body.producerOutputId ? { producerOutputId: body.producerOutputId } : {})
    }
  });
  await publishTransitionEvents(auth, typeId, targetId, result);
  return result;
});

async function publishTransitionEvents(auth, typeId, targetId, result = {}) {
  await entityEventService.publishEntityChanged(auth, {
    type: typeId,
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
