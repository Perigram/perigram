import { recoverStaleRecordings } from '~/server/features/livekit/service.js';

const INTERVAL_MS = Number(process.env.RECORDING_RECOVERY_INTERVAL_MS || 5 * 60 * 1000);
const STALE_AFTER_MS = Number(process.env.RECORDING_STALE_AFTER_MS || 30 * 60 * 1000);

export default defineNitroPlugin(() => {
    if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS <= 0) return;
    let running = false;

    async function tick() {
        if (running) return;
        running = true;
        try {
            const summary = await recoverStaleRecordings({ olderThanMs: STALE_AFTER_MS });
            if (summary.completed || summary.failed || summary.unresolved) {
                console.log(`[Recording Recovery] checked ${summary.checked}, completed ${summary.completed}, failed ${summary.failed}, active ${summary.active}, unresolved ${summary.unresolved}`);
            }
        } catch (error) {
            console.error('[Recording Recovery] failed:', error.message);
        } finally {
            running = false;
        }
    }

    setTimeout(tick, 30000);
    const interval = setInterval(tick, INTERVAL_MS);
    interval.unref?.();
});
