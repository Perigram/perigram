#!/usr/bin/env node
// The tech-drawing plugin's executor (endpoint mode, no services): the
// plugin's types are pure declarations served by the generic instance
// machinery, and this process serves the sketch editor surface module
// (plus its vendored runtime dependencies) as static GETs — the
// platform's module proxy streams them to browsers same-origin.
import { createEndpointExecutor } from '../../packages/plugin-sdk/src/endpoint-executor.js';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.TECH_DRAWING_EXECUTOR_PORT || 8792);
const token = process.env.TECH_DRAWING_EXECUTOR_KEY || null;
const server = createEndpointExecutor({
  services: {},
  token,
  staticRoot: fileURLToPath(new URL('.', import.meta.url))
}).listen(port, () => {
  process.stdout.write(`tech-drawing executor on :${port}${token ? ' (key required)' : ''}\n  GET  http://localhost:${port}/surfaces/*\n  GET  http://localhost:${port}/assets/vendor/*\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
