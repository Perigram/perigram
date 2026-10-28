import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { liveConversationRun } from '~/server/features/agent-bots/runtime.js';
import { getConversationContextByKey } from '~/server/features/support/service.js';

export default defineEventHandler(async (event) => {
    const auth = requireAuth(event);
    const conversationKey = String(getQuery(event)?.conversationKey || '');
    await getConversationContextByKey(auth, conversationKey);
    return liveConversationRun(auth.organizationId, conversationKey);
});
