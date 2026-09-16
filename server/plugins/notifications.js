import * as connectionsService from '../features/connections/service.js';
import { configurePush, notifyUser } from '../features/notifications/service.js';

export default defineNitroPlugin(() => {
    const runtimeConfig = useRuntimeConfig();
    configurePush({
        publicKey: runtimeConfig.vapidPublicKey,
        privateKey: runtimeConfig.vapidPrivateKey
    });

    connectionsService.onPublish((topic, payload) => {
        if (!topic.startsWith('user:')) return;
        const userId = topic.slice('user:'.length);
        if (connectionsService.userPresence(userId) > 0) return;
        notifyUser(userId, payload).catch(() => null);
    });
});
