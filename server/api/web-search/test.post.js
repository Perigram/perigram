import { defineEventHandler } from 'h3';
import { requireLineagePermission } from '~/server/utils/permissions.js';
import { testWebSearch } from '~/server/features/web-search/service.js';

export default defineEventHandler(async (event) => {
    const auth = requireLineagePermission(event, { organizationId: event.context.auth?.organizationId }, 'organizations', 'read');
    return await testWebSearch(auth);
});
