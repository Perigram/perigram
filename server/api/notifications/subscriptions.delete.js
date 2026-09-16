import { removeSubscription } from '../../features/notifications/service.js';

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth;
    if (!auth?.userId) {
        setResponseStatus(event, 401);
        return;
    }
    const endpoint = getQuery(event).endpoint;
    await removeSubscription(endpoint);
    return { removed: Boolean(endpoint) };
});
