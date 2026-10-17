import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { testWebSearch } from '~/server/features/web-search/service.js';

export default defineEventHandler(async (event) => {
    return await testWebSearch(requireAuth(event));
});
