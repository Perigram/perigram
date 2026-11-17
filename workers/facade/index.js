#!/usr/bin/env node
// The facade plugin's remaining endpoint services share one provider URL;
// operationId travels in the request envelope (or the org configures a
// reverse proxy for cloud hosting). Pure compute
// over values — see services.js. Runs with the repo's node_modules when
// compose-mounted, or its own install when extracted.
import { createEndpointExecutor } from '@perigram/plugin-sdk/endpoint-executor';
import { endpointServices } from './services.js';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.FACADE_EXECUTOR_PORT || 8790);
const token = process.env.FACADE_EXECUTOR_KEY || null;
// Surface modules are served beside the services (static GET under the
// executor root), so the install-resolved module URL
// `http://<origin>/surfaces/<module>.mjs` lands here.
const server = createEndpointExecutor({
  services: endpointServices,
  token,
  staticRoot: fileURLToPath(new URL('.', import.meta.url))
}).listen(port, () => {
  const served = `  POST http://localhost:${port}/ (operationId + input envelope)`;
  process.stdout.write(`facade executor on :${port}${token ? ' (key required)' : ''}\n${served}\n  GET  http://localhost:${port}/surfaces/*\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
