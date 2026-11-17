// Provider executor harness: a zero-dependency HTTP server matching the
// plugin Connection contract. The platform POSTs one { operationId, input }
// envelope to the provider's single configured URL and expects the service
// output as JSON. Every operation shares POST /; operation identity is data,
// not a route. Legacy POST /<serviceId> requests remain accepted during
// migration. With staticRoot, GET requests resolve files under that directory.

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
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.pbf': 'application/x-protobuf',
  '.bcmap': 'application/octet-stream',
  '.map': 'application/json'
};

export function createEndpointExecutor({ services = {}, token = null, staticRoot = null } = {}) {
  const servedRoot = staticRoot ? resolve(staticRoot) : null;
  return createServer((req, res) => {
    void handleRequest(req, res, services, token, servedRoot);
  });
}

async function handleRequest(req, res, services, token, staticRoot) {
  try {
    const pathname = new URL(req.url || '/', 'http://executor.local').pathname;
    const legacyServiceId = pathname.replace(/^\/+|\/+$/g, '');
    if (req.method === 'GET' && staticRoot) {
      serveStatic(req, res, staticRoot, legacyServiceId);
      return;
    }
    if (req.method !== 'POST') {
      respondWithError(res, 405, 'provider executor answers POST only');
      return;
    }
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      respondWithError(res, 401, 'invalid or missing executor key');
      return;
    }
    const envelope = await readJsonBody(req);
    const serviceId = legacyServiceId || String(envelope?.operationId || '');
    const input = legacyServiceId ? envelope : envelope?.input;
    if (!serviceId || (!legacyServiceId && (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)))) {
      respondWithError(res, 400, 'provider request requires an operationId and input envelope');
      return;
    }
    const handler = services[serviceId];
    if (typeof handler !== 'function') {
      respondWithError(res, 404, `unknown service ${serviceId || '(missing operationId)'} — declared: ${Object.keys(services).sort().join(', ') || '(none)'}`);
      return;
    }
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
