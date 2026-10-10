#!/usr/bin/env node
// The facade plugin's executor (endpoint mode): the platform's Connection
// settings point each service at `http://<this-host>:<port>/<serviceId>`
// (or the org configures a reverse proxy for cloud hosting). Pure compute
// over values — see services.js. Runs with the repo's node_modules when
// compose-mounted, or its own install when extracted.
import { createEndpointExecutor } from '../../packages/plugin-sdk/src/endpoint-executor.js';
import { services } from './services.js';

const port = Number(process.env.FACADE_EXECUTOR_PORT || 8790);
const token = process.env.FACADE_EXECUTOR_KEY || null;
const server = createEndpointExecutor({ services, token }).listen(port, () => {
  const served = Object.keys(services).map(id => `  POST http://localhost:${port}/${id}`).join('\n');
  process.stdout.write(`facade executor on :${port}${token ? ' (key required)' : ''}\n${served}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
