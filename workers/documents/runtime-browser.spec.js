import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const bundlePath = fileURLToPath(new URL('./runtime/shared-bundle.mjs', import.meta.url));

test('Documents runtime loads and executes in Chromium without Node module resolution', async ({ page }) => {
  const workerSource = `
import { createRuntime } from '/runtime/shared-bundle.mjs';
self.onmessage = async () => {
  const runtime = createRuntime();
  const parsed = runtime.execute('parse-markdown', {
    text: '# Browser runtime\\n\\nA **real** browser parse.'
  });
  const exported = runtime.execute('export-markdown-file', {
    document: parsed,
    name: 'browser-export.md'
  });
  const filled = runtime.execute('fill-markdown-template', {
    templateText: '# {title}\\n\\nHello {name}',
    values: { title: 'Report', name: 'Ada' }
  });
  self.postMessage({ parsed, exported, filled });
};
`;
  const server = createServer((request, response) => {
    if (request.url === '/runtime-smoke.worker.js') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(workerSource);
      return;
    }
    if (request.url === '/runtime/shared-bundle.mjs') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      createReadStream(bundlePath).pipe(response);
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
    expect(result.parsed).toMatchObject({
      type: 'text.flow-document',
      blocks: [
        { type: 'heading', level: 1 },
        { type: 'paragraph', children: expect.arrayContaining([
          expect.objectContaining({ type: 'strong' })
        ]) }
      ]
    });
    expect(result.exported.payload).toMatchObject({ mime: 'text/markdown', name: 'browser-export.md' });
    expect(atob(result.exported.payload.base64)).toContain('# Browser runtime\n\nA **real** browser parse.');
    expect(atob(result.filled.payload.base64)).toBe('# Report\n\nHello Ada');
    expect(errors).toEqual([]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
