import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/agent-bots/service.js';

export default defineEventHandler(async (event) => {
    const auth = requireAuth(event);
    return await service.rotateBotToken(auth, getRouterParam(event, 'id'));
});
