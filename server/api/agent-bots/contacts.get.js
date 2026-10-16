import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/agent-bots/service.js';

export default defineEventHandler(async (event) => {
    const auth = requireAuth(event);
    const conversationKey = String(getQuery(event)?.conversationKey || '');
    return await service.listAssistantContact(auth, conversationKey);
});
