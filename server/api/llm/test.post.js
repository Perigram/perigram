import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { testLlmConnection } from '~/server/features/llm/service.js';

export default defineEventHandler(async (event) => {
    const body = await readBody(event).catch(() => ({}));
    return await testLlmConnection(requireAuth(event), { profileId: body?.profileId });
});
