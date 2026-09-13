import * as livekitService from '~/server/features/livekit/service.js';

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth;
    if (!auth?.userId) {
        setResponseStatus(event, 401);
        return;
    }
    const channelId = getRouterParam(event, 'id');
    return await livekitService.deleteChannel(auth, channelId || '');
});
