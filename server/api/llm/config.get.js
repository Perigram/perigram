import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { isLlmAvailable } from '~/server/features/llm/service.js';

export default defineEventHandler(async (event) => {
    const auth = requireAuth(event);
    return { available: await isLlmAvailable(auth.organizationId) };
});
