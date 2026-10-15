import { scanStatusEventsForWakes } from '~/server/features/agent-bots/wake-scanner.js';

const INTERVAL_MS = Number(process.env.AGENT_WAKE_SCAN_INTERVAL_MS || 30000);

export default defineNitroPlugin(() => {
    if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS <= 0) return;
    let running = false;

    async function tick() {
        if (running) return;
        running = true;
        try {
            const summary = await scanStatusEventsForWakes();
            if (summary.wakes) {
                console.log(`[Agent Wake Scanner] ${summary.wakes} wakes of ${summary.events} events (${summary.skipped} unmatched)`);
            }
        } catch (error) {
            console.error('[Agent Wake Scanner] failed:', error.message);
        } finally {
            running = false;
        }
    }

    setTimeout(tick, 15000);
    const interval = setInterval(tick, INTERVAL_MS);
    interval.unref?.();
});
