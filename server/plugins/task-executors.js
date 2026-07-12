import { dispatchRegisteredTaskExecutors } from '~/server/core/tasks/service.js';

const INTERVAL_MS = 3000;

export default defineNitroPlugin(() => {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      await dispatchRegisteredTaskExecutors();
    } catch (error) {
      console.error('[Task Executors] Dispatch failed:', error.message);
    } finally {
      running = false;
    }
  }

  setTimeout(tick, 1000);
  const interval = setInterval(tick, INTERVAL_MS);
  interval.unref?.();
});
