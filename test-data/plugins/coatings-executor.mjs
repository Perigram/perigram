// Demo executor for the coatings plugin's endpoint-mode service
// (test-data/plugins/coatings.json). Run it next to the dev stack:
//
//   node test-data/plugins/coatings-executor.mjs   # listens on :8787
//
// Then in Organization → Plugins → Coatings → Connection, set the
// `match` service endpoint to http://localhost:8787/match — the app
// container reaches the host network, plain localhost works from the
// browser only if the app runs on the host; inside the dev compose use
// http://host.docker.internal:8787/match.
import { createServer } from 'node:http';

const server = createServer(async (request, response) => {
  if (request.method !== 'POST' || !request.url.endsWith('/match')) {
    response.writeHead(404).end('not found');
    return;
  }
  const body = await new Promise((resolve, reject) => {
    let data = '';
    request.on('data', chunk => { data += chunk; });
    request.on('end', () => resolve(data));
    request.on('error', reject);
  });
  let input = {};
  try {
    input = JSON.parse(body || '{}');
  } catch {
    response.writeHead(400).end('invalid JSON');
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({
    code: input.code || null,
    gloss: input.gloss || 'matte',
    primer: 'primer-1',
    coverageM2: 8.5
  }));
});

server.listen(8787, () => console.log('coatings executor on http://localhost:8787/match'));
