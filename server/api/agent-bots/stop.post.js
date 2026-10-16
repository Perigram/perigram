import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { stopConversationRuns } from '~/server/features/agent-bots/runtime.js';

export default defineEventHandler(async (event) => {
    const auth = requireAuth(event);
    const body = await readBody(event).catch(() => ({}));
    return { stopped: stopConversationRuns(auth.organizationId, String(body?.conversationKey || '')) };
});
