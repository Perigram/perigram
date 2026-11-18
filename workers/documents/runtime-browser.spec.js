import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const bundlePath = fileURLToPath(new URL('./runtime/shared.bundle.mjs', import.meta.url));

test('Documents runtime loads and executes in Chromium without Node module resolution', async ({ page }) => {
  const bundle = readFileSync(bundlePath);
  const workerSource = "import { createRuntime } from '/runtime/shared.bundle.mjs';\\nself.onmessage = async () => { const runtime = createRuntime(); const parsed = await runtime.execute('parse-markdown', { mode: 'preview', inputs: { text: '# Browser runtime\\n\\nA **real** browser parse.' } }); const filled = runtime.execute('fill-markdown-template', { templateText: '# {title}\\n\\nHello {name}', values: { title: 'Report', name: 'Ada' } }); self.postMessage({ parsed, filled }); };";
  const server = createServer((request, response) => {
    if (request.url === '/runtime-smoke.worker.js') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(workerSource);
      return;
    }
    if (request.url === '/runtime/shared.bundle.mjs') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(bundle);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><body>runtime smoke</body></html>');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const address = server.address();
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const result = await page.evaluate(() => new Promise((resolve, reject) => {
      const worker = new Worker('/runtime-smoke.worker.js', { type: 'module' });
      worker.onmessage = event => { worker.terminate(); resolve(event.data); };
      worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
      worker.postMessage({ type: 'run' });
    }));
    expect(result.parsed.value).toMatchObject({
      type: 'text.flow-document',
      blocks: [
        { type: 'heading', level: 1 },
        { type: 'paragraph', children: expect.arrayContaining([
          expect.objectContaining({ type: 'strong' })
        ]) }
      ]
    });
    expect(atob(result.filled.payload.base64)).toBe('# Report\n\nHello Ada');
    expect(errors).toEqual([]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
