import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { saveLlmSettings } from '~/server/features/llm/service.js';

export default defineEventHandler(async (event) => {
    return await saveLlmSettings(requireAuth(event), await readBody(event));
});
