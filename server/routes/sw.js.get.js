import { defineEventHandler, setHeaders } from '#imports';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Dev self-heal at the worker seam (root README "Progressive Web App"):
// a service worker left by an earlier production build on this origin
// serves its cached shell through hard refreshes — the in-app dev
// unregister never runs because the cached shell loads instead. Serving
// an uninstalling worker in dev makes every navigation heal the origin
// automatically. Production still serves the real worker byte-for-byte.
const DEV_UNINSTALL_WORKER = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
`;

export default defineEventHandler(event => {
  const isDev = import.meta.dev;
  if (!isDev) {
    const file = readFileSync(resolve('public', 'sw.js'), 'utf8');
    setHeaders(event, { 'content-type': 'application/javascript; charset=utf-8' });
    return file;
  }
  setHeaders(event, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
  return DEV_UNINSTALL_WORKER;
});
