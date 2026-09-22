import { getHeader } from 'h3';
import { proxyRequest } from 'h3';
import { authorizeKnowledge, proxyTarget } from './service.js';

/**
 * Shared reverse-proxy handler for the OpenKnowledge container. Admission
 * is checked per request (session cookie carries it), the
 * `/api/knowledge/proxy` prefix is stripped, and method, headers, body,
 * and query string are forwarded unchanged. The original Host header is
 * forwarded explicitly — `proxyRequest` would otherwise send the
 * container-internal host, which OpenKnowledge's host admission rejects.
 * Served from both the bare route and the catch-all so the entry URL can
 * keep its trailing slash (OpenKnowledge emits relative asset paths).
 */
export async function handleProxy(event) {
    const auth = event.context?.auth;
    if (!auth?.userId) {
        setResponseStatus(event, 401);
        return;
    }
    authorizeKnowledge(auth);
    const path = event.context.params?._ ?? '';
    const { search } = new URL(event.path, 'http://proxy.internal');
    return proxyRequest(event, proxyTarget(`${path}${search}`), {
        headers: { host: getHeader(event, 'host') || 'localhost:3000' }
    });
}
