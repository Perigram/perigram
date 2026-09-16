import { saveSubscription } from '../../../features/notifications/service.js';

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth;
    if (!auth?.userId) {
        setResponseStatus(event, 401);
        return;
    }
    const body = await readBody(event);
    return await saveSubscription(auth, body?.subscription || body);
});
