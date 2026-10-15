import { registerSupportMessageObserver } from '~/server/features/agent-bots/runtime.js';

/**
 * Registers the agent bot runtime against the support message seam at
 * boot: every persisted chat message reaches the trigger the same way,
 * with no bot-specific write path in the support feature.
 */
export default defineNitroPlugin(() => {
    registerSupportMessageObserver();
});
