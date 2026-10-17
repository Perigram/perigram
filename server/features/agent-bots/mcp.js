import { createError } from 'h3';
import { randomUUID } from 'node:crypto';
import { mcpToolDescriptors, executeTool } from './tools.js';

/**
 * Minimal MCP streamable-HTTP server transport: single JSON-RPC messages
 * over `POST /api/mcp`, plain `application/json` replies (no server-initiated
 * streams), stateless sessions (a session id is minted on initialize and
 * accepted, never tracked). Authentication happens in the auth middleware —
 * a user JWT or session cookie — and tools run with that principal's
 * grants.
 */

const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18']);
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'perigram', version: '1.0.0' };
const INSTRUCTIONS = [
    'Perigram agent tools: author process definitions (read, save, validate, activate — always validate first and treat activation gates as confirmations to resolve, not bypass),',
    'inspect the type vocabulary and instances, and run compiled process actions. Every call enforces the authenticated principal\'s access.'
].join(' ');

function rpcResult(id, result) {
    return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message, data = null) {
    return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

export async function handleMcpRequest(event, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return rpcError(null, -32600, 'Invalid request: a single JSON-RPC message object is required');
    }
    const { method, id, params = {} } = body;
    const isNotification = id === null || id === undefined;

    if (typeof method !== 'string' || !method) {
        return rpcError(id ?? null, -32601, 'Invalid request: method is required');
    }

    if (method === 'initialize') {
        const requested = String(params?.protocolVersion || '');
        return rpcResult(id, {
            protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : DEFAULT_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: INSTRUCTIONS
        });
    }

    // Notifications get no response body (HTTP 202 at the route).
    if (method.startsWith('notifications/')) {
        return null;
    }

    if (method === 'ping') {
        return rpcResult(id, {});
    }

    if (method === 'tools/list') {
        return rpcResult(id, { tools: await mcpToolDescriptors(event.context?.auth?.organizationId || null) });
    }

    if (method === 'tools/call') {
        const auth = event.context?.auth;
        if (!auth?.userId) {
            throw createError({ statusCode: 401, message: 'Authentication required' });
        }
        const name = params?.name;
        if (!name) return rpcError(id, -32602, 'Invalid params: tool name is required');
        const args = params?.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
            ? params.arguments
            : {};
        try {
            const result = await executeTool(name, args, auth);
            return rpcResult(id, {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            });
        } catch (error) {
            const message = error?.statusCode && error?.statusCode < 500
                ? `${error.statusCode}: ${error.message}`
                : (error?.message || 'Tool execution failed');
            return rpcResult(id, {
                content: [{ type: 'text', text: message }],
                isError: true
            });
        }
    }

    if (isNotification) return null;
    return rpcError(id, -32601, `Method not found: ${method}`);
}

export function newMcpSessionId() {
    return randomUUID();
}
