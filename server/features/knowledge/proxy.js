import { request as httpRequest } from 'node:http';
import { getHeader, getHeaders, setResponseStatus, setResponseHeader } from 'h3';
import { pipeline } from 'node:stream';
import { authorizeKnowledge, proxyTarget } from './service.js';

/**
 * Shared reverse-proxy handler for the OpenKnowledge container. Admission
 * is checked per request (session cookie carries it), the
 * `/api/knowledge/proxy` prefix is stripped, and method, headers, body,
 * and query string are forwarded unchanged.
 *
 * Built on `node:http` rather than h3's `proxyRequest`: undici-based
 * forwarding silently overrides the Host header with the target's host,
 * and OpenKnowledge's host admission then answers 403 for the
 * container-internal host. The original browser Host must reach the
 * container because it is what `--external-url` allowlists.
 *
 * Websocket upgrades (OpenKnowledge's `/collab`) answer 501 instead of
 * being attempted: a half-open upgrade through `node:http` fails with
 * socket errors that must never escape as unhandled rejections. The
 * handler therefore always resolves and destroys broken sockets itself.
 *
 * Served from both the bare route and the catch-all so the entry URL can
 * keep its trailing slash (OpenKnowledge emits relative asset paths).
 */

const HOP_BY_HOP = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
]);

export function handleProxy(event) {
    const auth = event.context?.auth;
    if (!auth?.userId) {
        setResponseStatus(event, 401);
        return Promise.resolve();
    }
    authorizeKnowledge(auth);

    if (getHeader(event, 'upgrade') || event.method === 'CONNECT') {
        setResponseStatus(event, 501);
        return Promise.resolve();
    }

    const path = event.context.params?._ ?? '';
    const search = new URL(event.path, 'http://proxy.internal').search;
    const target = new URL(proxyTarget(`${path}${search}`));

    const headers = { ...getHeaders(event) };
    for (const name of Object.keys(headers)) {
        if (HOP_BY_HOP.has(name.toLowerCase())) delete headers[name];
    }
    headers.host = getHeader(event, 'host') || target.host;

    return new Promise(resolve => {
        const upstream = httpRequest(
            {
                hostname: target.hostname,
                port: target.port || 80,
                path: `${target.pathname}${target.search}`,
                method: event.method,
                headers
            },
            upstreamRes => {
                try {
                    setResponseStatus(event, upstreamRes.statusCode || 502);
                    for (const [name, value] of Object.entries(upstreamRes.headers)) {
                        if (HOP_BY_HOP.has(name) || name === 'content-length') continue;
                        if (value !== undefined) setResponseHeader(event, name, value);
                    }
                } catch {
                    event.node.res.destroy();
                    return resolve();
                }
                pipeline(upstreamRes, event.node.res, () => resolve());
            }
        );
        upstream.on('error', () => {
            if (!event.node.res.headersSent) setResponseStatus(event, 502);
            event.node.res.destroy();
            resolve();
        });
        pipeline(event.node.req, upstream, () => upstream.destroy());
    });
}
