import { scanDueProcessRuns } from '~/server/features/process-definitions/run-scanner.js';

const INTERVAL_MS = Number(process.env.PROCESS_RUN_SCAN_INTERVAL_MS || 15000);

export default defineNitroPlugin(() => {
  if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS <= 0) return;
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const summary = await scanDueProcessRuns();
      if (summary.wakes || summary.scheduleFires || summary.events || summary.wakeFailed || summary.eventFailed) {
        console.log(`[Process Run Scanner] wakes ${summary.wakes} (${summary.wakeFailed} failed), schedules ${summary.scheduleFires}, events ${summary.events} (${summary.eventFailed} failed)`);
      }
    } catch (error) {
      console.error('[Process Run Scanner] failed:', error.message);
    } finally {
      running = false;
    }
  }

  setTimeout(tick, 10000);
  const interval = setInterval(tick, INTERVAL_MS);
  interval.unref?.();
});
