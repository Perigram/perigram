import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { saveWebSearchSettings } from '~/server/features/web-search/service.js';

export default defineEventHandler(async (event) => {
    return await saveWebSearchSettings(requireAuth(event), await readBody(event));
});
