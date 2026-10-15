import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/agent-bots/service.js';

export default defineEventHandler(async (event) => {
    const auth = requireAuth(event);
    return await service.subscribeBot(auth, await readBody(event));
});
