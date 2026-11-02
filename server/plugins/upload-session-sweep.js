import { sweepExpiredUploadSessions } from '~/server/features/files/service.js';

const INTERVAL_MS = Number(process.env.UPLOAD_SESSION_SWEEP_INTERVAL_MS || 10 * 60 * 1000);

export default defineNitroPlugin(() => {
  if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS <= 0) return;
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const expired = await sweepExpiredUploadSessions();
      if (expired) console.log(`[Upload Session Sweep] expired ${expired} sessions`);
    } catch (error) {
      console.error('[Upload Session Sweep] failed:', error.message);
    } finally {
      running = false;
    }
  }

  setTimeout(tick, 60000);
  const interval = setInterval(tick, INTERVAL_MS);
  interval.unref?.();
});
