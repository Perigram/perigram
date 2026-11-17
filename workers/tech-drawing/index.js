#!/usr/bin/env node
// The tech-drawing plugin's provider executor dispatches operationId through
// one URL. Its types are pure declarations served by the generic instance
// machinery, and this process serves DXF placement plus the sketch
// and DXF editor surface modules (and their vendored runtime
// dependencies) as static GETs — the platform's module proxy streams
// them to browsers same-origin.
import { createEndpointExecutor } from '@perigram/plugin-sdk/endpoint-executor';
import { services } from './services.js';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.TECH_DRAWING_EXECUTOR_PORT || 8792);
const token = process.env.TECH_DRAWING_EXECUTOR_KEY || null;
const server = createEndpointExecutor({
  services,
  token,
  staticRoot: fileURLToPath(new URL('.', import.meta.url))
}).listen(port, () => {
  const served = `  POST http://localhost:${port}/ (operationId + input envelope)`;
  process.stdout.write(`tech-drawing executor on :${port}${token ? ' (key required)' : ''}\n${served}\n  GET  http://localhost:${port}/surfaces/*\n  GET  http://localhost:${port}/dxf-markers.js\n  GET  http://localhost:${port}/assets/vendor/*\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
