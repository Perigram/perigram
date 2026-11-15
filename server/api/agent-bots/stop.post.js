import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { stopConversationRuns } from '~/server/features/agent-bots/runtime.js';
import { getConversationContextByKey } from '~/server/features/support/service.js';

export default defineEventHandler(async (event) => {
    const auth = requireAuth(event);
    const body = await readBody(event).catch(() => ({}));
    const conversationKey = String(body?.conversationKey || '');
    // Organization membership alone does not grant control over another
    // member's private/direct conversation. Reuse the support feature's
    // canonical participant/admin admission before touching in-flight runs.
    await getConversationContextByKey(auth, conversationKey);
    return { stopped: stopConversationRuns(auth.organizationId, conversationKey) };
});
