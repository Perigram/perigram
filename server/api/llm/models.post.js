import { defineEventHandler, readBody } from 'h3';
import { requireLineagePermission } from '~/server/utils/permissions.js';
import { listEndpointModels } from '~/server/features/llm/service.js';

export default defineEventHandler(async (event) => {
    const auth = requireLineagePermission(event, { organizationId: event.context.auth?.organizationId }, 'organizations', 'write');
    const body = await readBody(event).catch(() => ({}));
    return await listEndpointModels(auth, {
        provider: body?.provider,
        baseUrl: body?.baseUrl,
        apiKey: body?.apiKey,
        profileId: body?.profileId
    });
});
