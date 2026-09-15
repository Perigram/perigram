import { registerExecutedKey } from '../core/idempotency/service.js';

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event, { response }) => {
    const pending = event.context?.idempotency;
    if (!pending) return;
    const status = Number(response?.status ?? 0);
    if (!status || status < 200 || status > 299) return;
    return registerExecutedKey(pending);
  });
});
