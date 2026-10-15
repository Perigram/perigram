import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { testLlmConnection } from '~/server/features/llm/service.js';

export default defineEventHandler(async (event) => {
    return await testLlmConnection(requireAuth(event));
});
