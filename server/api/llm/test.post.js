import { defineEventHandler, readBody } from 'h3';
import { requireLineagePermission } from '~/server/utils/permissions.js';
import { testLlmConnection } from '~/server/features/llm/service.js';

export default defineEventHandler(async (event) => {
    const body = await readBody(event).catch(() => ({}));
    const auth = requireLineagePermission(event, { organizationId: event.context.auth?.organizationId }, 'organizations', 'read');
    return await testLlmConnection(auth, { profileId: body?.profileId });
});
