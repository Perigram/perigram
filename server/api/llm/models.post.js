import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { listEndpointModels } from '~/server/features/llm/service.js';

export default defineEventHandler(async (event) => {
    const auth = requireAuth(event);
    const body = await readBody(event).catch(() => ({}));
    return await listEndpointModels(auth, {
        provider: body?.provider,
        baseUrl: body?.baseUrl,
        apiKey: body?.apiKey,
        profileId: body?.profileId
    });
});
