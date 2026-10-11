// Endpoint-mode executor harness: a zero-dependency HTTP server matching
// the plugin Connection contract (docs/PLUGIN_AUTHORING.md §executor). The
// platform POSTs the service input as the JSON body to the configured URL
// and expects the service output as JSON; with an install authToken the
// call arrives as `authorization: Bearer <key>`.
//
// Each service is served at `POST /<serviceId>` — configure that URL in
// the plugin's Connection settings per service. With `staticRoot`, GET
// requests resolve files under that directory (path-traversal refused):
// that is how the executor serves its declared surface modules. Static
// GETs carry `access-control-allow-origin: *` — the browser imports the
// module cross-origin from the app, and the resolved URL is the only
// credential (the executor key never reaches the client).
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const STATIC_CONTENT_TYPES = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};

export function createEndpointExecutor({ services = {}, token = null, staticRoot = null } = {}) {
  const servedRoot = staticRoot ? resolve(staticRoot) : null;
  return createServer((req, res) => {
    void handleRequest(req, res, services, token, servedRoot);
  });
}

async function handleRequest(req, res, services, token, staticRoot) {
  try {
    const serviceId = String(req.url || '').replace(/^\/+|\/+$/g, '').split('?')[0];
    if (req.method === 'GET' && staticRoot) {
      serveStatic(req, res, staticRoot, serviceId);
      return;
    }
    if (req.method !== 'POST') {
      respondWithError(res, 405, `service ${serviceId || '/'} answers POST only`);
      return;
    }
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      respondWithError(res, 401, 'invalid or missing executor key');
      return;
    }
    const handler = services[serviceId];
    if (typeof handler !== 'function') {
      respondWithError(res, 404, `unknown service ${serviceId || '(root)'} — declared: ${Object.keys(services).sort().join(', ') || '(none)'}`);
      return;
    }
    const input = await readJsonBody(req);
    const output = await handler(input);
    respondWithJson(res, 200, output === undefined ? null : output);
  } catch (error) {
    respondWithError(res, 500, error?.message || String(error));
  }
}

function serveStatic(req, res, staticRoot, pathname) {
  const decoded = decodeURIComponent(pathname);
  const target = normalize(join(staticRoot, decoded));
  if (target !== staticRoot && !target.startsWith(staticRoot + sep)) {
    respondWithError(res, 403, 'outside the static root');
    return;
  }
  let stats;
  try {
    stats = statSync(target);
  } catch {
    respondWithError(res, 404, `no static file at /${pathname}`);
    return;
  }
  if (!stats.isFile()) {
    respondWithError(res, 404, `no static file at /${pathname}`);
    return;
  }
  res.writeHead(200, {
    'content-type': STATIC_CONTENT_TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
    'content-length': stats.size,
    'access-control-allow-origin': '*'
  });
  createReadStream(target).pipe(res);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body) return resolve(null);
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function respondWithJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

function respondWithError(res, status, message) {
  if (res.headersSent) {
    res.end();
    return;
  }
  respondWithJson(res, status, { error: message });
}
