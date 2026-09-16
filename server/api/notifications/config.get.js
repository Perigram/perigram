import { pushConfiguration } from '../../features/notifications/service.js';

export default defineEventHandler(() => {
    return pushConfiguration();
});
