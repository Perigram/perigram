import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/agent-bots/service.js';

export default defineEventHandler(async (event) => {
    const auth = requireAuth(event);
    const body = await readBody(event).catch(() => ({}));
    return await service.setBotProfile(auth, getRouterParam(event, 'id'), body?.profile ?? '');
});
