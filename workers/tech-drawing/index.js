#!/usr/bin/env node
// The tech-drawing plugin's executor (endpoint mode): the plugin's types
// are pure declarations served by the generic instance machinery, and
// this process serves its services (DXF spot placement) plus the sketch
// editor surface module (and its vendored runtime dependencies) as static
// GETs — the platform's module proxy streams them to browsers same-origin.
import { createEndpointExecutor } from '../../packages/plugin-sdk/src/endpoint-executor.js';
import { services } from './services.js';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.TECH_DRAWING_EXECUTOR_PORT || 8792);
const token = process.env.TECH_DRAWING_EXECUTOR_KEY || null;
const server = createEndpointExecutor({
  services,
  token,
  staticRoot: fileURLToPath(new URL('.', import.meta.url))
}).listen(port, () => {
  const served = Object.keys(services).map(id => `  POST http://localhost:${port}/${id}`).join('\n');
  process.stdout.write(`tech-drawing executor on :${port}${token ? ' (key required)' : ''}\n${served}\n  GET  http://localhost:${port}/surfaces/*\n  GET  http://localhost:${port}/assets/vendor/*\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
