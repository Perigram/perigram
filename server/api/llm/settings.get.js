import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { readLlmSettings } from '~/server/features/llm/service.js';

export default defineEventHandler(async (event) => {
    return await readLlmSettings(requireAuth(event));
});
