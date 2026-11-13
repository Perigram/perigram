#!/usr/bin/env node
// The build123d plugin's executor (endpoint mode): the platform's
// Connection settings point each service at
// `http://<this-host>:<port>/<serviceId>`. Pure compute over values —
// see services.js. The preview-channel surface serves as a static GET
// beside the services.
import { createEndpointExecutor } from '../../packages/plugin-sdk/src/endpoint-executor.js';
import { services } from './services.js';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.BUILD123D_EXECUTOR_PORT || 8793);
const token = process.env.BUILD123D_EXECUTOR_KEY || null;
const server = createEndpointExecutor({
  services,
  token,
  staticRoot: fileURLToPath(new URL('.', import.meta.url))
}).listen(port, () => {
  const served = Object.keys(services).map(id => `  POST http://localhost:${port}/${id}`).join('\n');
  process.stdout.write(`build123d executor on :${port}${token ? ' (key required)' : ''}\n${served}\n  GET  http://localhost:${port}/surfaces/*\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
