import { resumeDueRuns } from '~/server/features/process-definitions/service.js';

const INTERVAL_MS = 3000;

export default defineNitroPlugin(() => {
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      await resumeDueRuns();
    } catch (error) {
      console.error('[Process Orchestration] Due-run dispatch failed:', error.message);
    } finally {
      running = false;
    }
  }

  setTimeout(tick, 1000);
  const interval = setInterval(tick, INTERVAL_MS);
  interval.unref?.();
});
