import { reconcileProcessTaskRuns } from '~/server/features/process-definitions/service.js';

const INTERVAL_MS = 30000;

export default defineNitroPlugin(() => {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const summary = await reconcileProcessTaskRuns();
      if (summary.ingested || summary.failed) {
        console.log(`[Process Reconciliation] ingested ${summary.ingested}, failed ${summary.failed}, skipped ${summary.skipped} of ${summary.scanned}`);
      }
    } catch (error) {
      console.error('[Process Reconciliation] failed:', error.message);
    } finally {
      running = false;
    }
  }

  setTimeout(tick, 15000);
  const interval = setInterval(tick, INTERVAL_MS);
  interval.unref?.();
});
