import { defineEventHandler, readBody, setResponseStatus, setHeader } from 'h3';
import { handleMcpRequest, newMcpSessionId } from '~/server/features/agent-bots/mcp.js';

export default defineEventHandler(async (event) => {
    let body;
    try {
        body = await readBody(event);
    } catch (error) {
        body = null;
    }
    if (body === null || body === undefined) {
        setResponseStatus(event, 400);
        return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
    }
    const response = await handleMcpRequest(event, body);
    if (response === null) {
        setResponseStatus(event, 202);
        return '';
    }
    if (body?.method === 'initialize') {
        setHeader(event, 'Mcp-Session-Id', newMcpSessionId());
    }
    setHeader(event, 'Content-Type', 'application/json');
    return response;
});
