#!/usr/bin/env node
// The documents plugin's executor (endpoint mode): the platform's
// Connection settings point each service at
// `http://<this-host>:<port>/<serviceId>`. Pure compute over values —
// see services.js (table decomposition, text extraction, CSV
// composition). Surface modules and their vendored runtimes serve as
// static GETs beside the services.
import { createEndpointExecutor } from '@perigram/plugin-sdk/endpoint-executor';
import { endpointServices } from './services.js';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.DOCUMENTS_EXECUTOR_PORT || 8791);
const token = process.env.DOCUMENTS_EXECUTOR_KEY || null;
const server = createEndpointExecutor({
  services: endpointServices,
  token,
  staticRoot: fileURLToPath(new URL('.', import.meta.url))
}).listen(port, () => {
  const served = Object.keys(endpointServices).map(id => `  POST http://localhost:${port}/${id}`).join('\n');
  process.stdout.write(`documents executor on :${port}${token ? ' (key required)' : ''}\n${served}\n  GET  http://localhost:${port}/surfaces/*\n  GET  http://localhost:${port}/assets/*\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
