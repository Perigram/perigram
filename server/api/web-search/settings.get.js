import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { readWebSearchSettings } from '~/server/features/web-search/service.js';

export default defineEventHandler(async (event) => {
    return await readWebSearchSettings(requireAuth(event));
});
