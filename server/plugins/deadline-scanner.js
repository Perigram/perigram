import { scanDueDeadlines } from '~/server/features/process-definitions/deadline-scanner.js';

const INTERVAL_MS = Number(process.env.DEADLINE_SCAN_INTERVAL_MS || 60000);

export default defineNitroPlugin(() => {
  if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS <= 0) return;
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const summary = await scanDueDeadlines();
      if (summary.moved || summary.refused || summary.failed) {
        console.log(`[Deadline Scanner] moved ${summary.moved}, refused ${summary.refused}, failed ${summary.failed} of ${summary.deadlines} deadlines`);
      }
    } catch (error) {
      console.error('[Deadline Scanner] failed:', error.message);
    } finally {
      running = false;
    }
  }

  setTimeout(tick, 20000);
  const interval = setInterval(tick, INTERVAL_MS);
  interval.unref?.();
});
