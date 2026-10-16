import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The provider table's failure modes and wire translations, pinned: an
// unusable provider resolves to none (never a per-request failure), each
// provider gets its real endpoint/headers/request shape, and every
// response shape parses back into the one neutral contract the bot loop
// speaks.

const { mockedOrganizations } = vi.hoisted(() => ({
    mockedOrganizations: { getById: vi.fn() }
}));

vi.mock('~/server/features/organizations/service.js', () => mockedOrganizations);
vi.mock('h3', () => ({
    createError: vi.fn((err) => {
        const error = new Error(err.message);
        error.statusCode = err.statusCode;
        return error;
    })
}));

import { resolveLlmConfig, chatCompletion, streamChatCompletion } from './service.js';

const fetchMock = vi.fn();

const ENV_KEYS = ['LLM_PROVIDER', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'];
const envBackup = {};

beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
        envBackup[key] = process.env[key];
        delete process.env[key];
    }
    mockedOrganizations.getById.mockResolvedValue(null);
    fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({})
    });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
        if (envBackup[key] === undefined) delete process.env[key];
        else process.env[key] = envBackup[key];
    }
});

describe('resolveLlmConfig', () => {
    it('resolves to none without configuration', async () => {
        expect(await resolveLlmConfig(null)).toEqual({ provider: 'none' });
    });

    it('resolves to none for an unknown provider', async () => {
        process.env.LLM_PROVIDER = 'gpt-everywhere';
        expect(await resolveLlmConfig(null)).toEqual({ provider: 'none' });
    });

    it('resolves to none when baseUrl or model is missing', async () => {
        process.env.LLM_PROVIDER = 'ollama';
        process.env.LLM_MODEL = 'llama3';
        expect(await resolveLlmConfig(null)).toEqual({ provider: 'none' });
        process.env.LLM_BASE_URL = 'http://localhost:11434';
        delete process.env.LLM_MODEL;
        expect(await resolveLlmConfig(null)).toEqual({ provider: 'none' });
    });

    it('resolves a routed chat profile over env defaults', async () => {
        process.env.LLM_PROVIDER = 'ollama';
        process.env.LLM_BASE_URL = 'http://env-host:11434';
        process.env.LLM_MODEL = 'env-model';
        mockedOrganizations.getById.mockResolvedValue({
            data: { settings: { llm: {
                profiles: { primary: { kind: 'chat', provider: 'anthropic', baseUrl: 'https://llm.internal', model: 'glm-4.6' } },
                routes: { chat: 'primary' }
            } } }
        });
        const config = await resolveLlmConfig('org-1');
        expect(config).toEqual({ provider: 'anthropic', baseUrl: 'https://llm.internal', apiKey: '', model: 'glm-4.6' });
    });

    it('serves the only chat profile when no route is set', async () => {
        mockedOrganizations.getById.mockResolvedValue({
            data: { settings: { llm: {
                profiles: { Chat: { kind: 'chat', provider: 'openai', baseUrl: 'http://10.0.0.2:8080', model: 'qwen3:4b' } },
                routes: {}
            } } }
        });
        const config = await resolveLlmConfig('org-1');
        expect(config).toEqual({ provider: 'openai', baseUrl: 'http://10.0.0.2:8080', apiKey: '', model: 'qwen3:4b' });
        expect(await resolveLlmConfig('org-1', 'chat.summaries')).toEqual(config);
    });

    it('keeps two unrouted chat profiles ambiguous (env default)', async () => {
        process.env.LLM_PROVIDER = 'ollama';
        process.env.LLM_BASE_URL = 'http://env-host:11434';
        process.env.LLM_MODEL = 'env-model';
        mockedOrganizations.getById.mockResolvedValue({
            data: { settings: { llm: {
                profiles: {
                    a: { kind: 'chat', provider: 'ollama', baseUrl: 'http://a:11434', model: 'a' },
                    b: { kind: 'chat', provider: 'ollama', baseUrl: 'http://b:11434', model: 'b' }
                },
                routes: {}
            } } }
        });
        expect(await resolveLlmConfig('org-1')).toEqual({ provider: 'ollama', baseUrl: 'http://env-host:11434', apiKey: '', model: 'env-model' });
    });

    it('never falls back through a stale non-chat route target', async () => {
        mockedOrganizations.getById.mockResolvedValue({
            data: { settings: { llm: {
                profiles: {
                    img: { kind: 'image', provider: 'openai', baseUrl: 'http://img:8080', model: 'sd-xl' },
                    sole: { kind: 'chat', provider: 'ollama', baseUrl: 'http://llm:11434', model: 'm' }
                },
                routes: { chat: 'img' }
            } } }
        });
        expect(await resolveLlmConfig('org-1')).toEqual({ provider: 'none' });
    });
});

const TOOLS = [{ name: 'list_types', description: 'lists types', inputSchema: { type: 'object', properties: {} } }];

async function callRound(provider, payload, messages = []) {
    process.env.LLM_PROVIDER = provider;
    process.env.LLM_BASE_URL = 'http://llm.internal';
    process.env.LLM_MODEL = 'model-x';
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await chatCompletion({ organizationId: null, system: 'be brief', messages, tools: TOOLS });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    return { result, request, url: fetchMock.mock.calls[0][0], headers: fetchMock.mock.calls[0][1].headers };
}

describe('chatCompletion: ollama', () => {
    it('speaks the native /api/chat wire and parses object-argument tool calls', async () => {
        const { result, request, url } = await callRound('ollama', {
            message: { role: 'assistant', content: 'thinking', tool_calls: [{ function: { name: 'list_types', arguments: { a: 1 } } }] }
        });
        expect(url).toBe('http://llm.internal/api/chat');
        expect(request.stream).toBe(false);
        expect(request.messages[0]).toEqual({ role: 'system', content: 'be brief' });
        expect(request.tools[0]).toEqual({
            type: 'function',
            function: { name: 'list_types', description: 'lists types', parameters: { type: 'object', properties: {} } }
        });
        expect(result.content).toBe('thinking');
        expect(result.toolCalls).toEqual([{ id: 'ollama-0', name: 'list_types', arguments: { a: 1 } }]);
    });

    it('maps neutral tool results onto tool_name rows', async () => {
        const { request } = await callRound('ollama', { message: { content: 'ok' } }, [
            { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'list_types', arguments: {} }] },
            { role: 'tool', toolCallId: 't1', name: 'list_types', content: '{}' }
        ]);
        expect(request.messages[2]).toEqual({ role: 'tool', tool_name: 'list_types', content: '{}' });
    });
});

describe('chatCompletion: anthropic', () => {
    it('uses the messages protocol: system field, input_schema tools, tool_use blocks', async () => {
        const { result, request, url, headers } = await callRound('anthropic', {
            content: [
                { type: 'text', text: 'answer' },
                { type: 'tool_use', id: 'tu_1', name: 'list_types', input: { b: 2 } }
            ],
            stop_reason: 'tool_use'
        });
        expect(url).toBe('http://llm.internal/v1/messages');
        expect(headers['anthropic-version']).toBe('2023-06-01');
        expect(request.system).toBe('be brief');
        expect(request.max_tokens).toBeGreaterThan(0);
        expect(request.tools[0]).toEqual({
            name: 'list_types', description: 'lists types', input_schema: { type: 'object', properties: {} }
        });
        expect(result).toEqual({ content: 'answer', thinking: '', toolCalls: [{ id: 'tu_1', name: 'list_types', arguments: { b: 2 } }] });
    });

    it('merges consecutive tool results into one tool_result user turn', async () => {
        const { request } = await callRound('anthropic', { content: [{ type: 'text', text: 'ok' }] }, [
            { role: 'assistant', content: '', toolCalls: [
                { id: 't1', name: 'a', arguments: {} },
                { id: 't2', name: 'b', arguments: {} }
            ] },
            { role: 'tool', toolCallId: 't1', name: 'a', content: '1' },
            { role: 'tool', toolCallId: 't2', name: 'b', content: '2' }
        ]);
        const toolTurn = request.messages.at(-1);
        expect(toolTurn.role).toBe('user');
        expect(toolTurn.content).toEqual([
            { type: 'tool_result', tool_use_id: 't1', content: '1' },
            { type: 'tool_result', tool_use_id: 't2', content: '2' }
        ]);
    });

    it('carries assistant tool calls as tool_use blocks', async () => {
        const { request } = await callRound('anthropic', { content: [{ type: 'text', text: 'ok' }] }, [
            { role: 'assistant', content: 'using tools', toolCalls: [{ id: 't1', name: 'list_types', arguments: { q: 1 } }] }
        ]);
        const assistantTurn = request.messages.at(-1);
        expect(assistantTurn.role).toBe('assistant');
        expect(assistantTurn.content).toEqual([
            { type: 'text', text: 'using tools' },
            { type: 'tool_use', id: 't1', name: 'list_types', input: { q: 1 } }
        ]);
    });
});

describe('chatCompletion: openai-shaped local servers', () => {
    it('stringifies tool arguments out and parses them back in', async () => {
        const { result, request, url } = await callRound('openai', {
            choices: [{ message: { content: 'hi', tool_calls: [{ id: 'c1', function: { name: 'list_types', arguments: '{"z":3}' } }] } }]
        });
        expect(url).toBe('http://llm.internal/v1/chat/completions');
        expect(request.messages[0]).toEqual({ role: 'system', content: 'be brief' });
        expect(result).toEqual({ content: 'hi', thinking: '', toolCalls: [{ id: 'c1', name: 'list_types', arguments: { z: 3 } }] });
    });

    it('sends assistant tool calls with string arguments and tool results by call id', async () => {
        const { request } = await callRound('openai', { choices: [{ message: { content: 'ok' } }] }, [
            { role: 'assistant', content: '', toolCalls: [{ id: 'c9', name: 'list_types', arguments: { k: 1 } }] },
            { role: 'tool', toolCallId: 'c9', name: 'list_types', content: '{"ok":true}' }
        ]);
        expect(request.messages[1].tool_calls[0].function.arguments).toBe('{"k":1}');
        expect(request.messages[2]).toEqual({ role: 'tool', tool_call_id: 'c9', content: '{"ok":true}' });
    });

    it('sends the bearer header only when a key resolves', async () => {
        process.env.LLM_API_KEY = 'secret';
        const { headers } = await callRound('openai', { choices: [{ message: { content: 'ok' } }] });
        expect(headers.Authorization).toBe('Bearer secret');
    });
});

describe('chatCompletion: failure modes', () => {
    it('overrides the served model at the execution point', async () => {
        process.env.LLM_PROVIDER = 'openai';
        process.env.LLM_BASE_URL = 'http://llm.internal';
        process.env.LLM_MODEL = 'model-x';
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'hi' } }] }) });
        const result = await chatCompletion({ organizationId: null, model: 'qwen3:30b-a3b' });
        const request = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(request.model).toBe('qwen3:30b-a3b');
        expect(result.content).toBe('hi');
    });

    it('throws 503 when no provider resolves', async () => {
        await expect(chatCompletion({ organizationId: null })).rejects.toMatchObject({ statusCode: 503 });
    });

    it('throws 502 when the endpoint is unreachable', async () => {
        process.env.LLM_PROVIDER = 'ollama';
        process.env.LLM_BASE_URL = 'http://llm.internal';
        process.env.LLM_MODEL = 'model-x';
        fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        await expect(chatCompletion({ organizationId: null })).rejects.toMatchObject({ statusCode: 502 });
    });

    it('throws 502 on a non-2xx answer', async () => {
        process.env.LLM_PROVIDER = 'ollama';
        process.env.LLM_BASE_URL = 'http://llm.internal';
        process.env.LLM_MODEL = 'model-x';
        fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' });
        await expect(chatCompletion({ organizationId: null })).rejects.toMatchObject({ statusCode: 502, message: /boom/ });
    });

    it('throws 502 on an unparseable payload', async () => {
        process.env.LLM_PROVIDER = 'ollama';
        process.env.LLM_BASE_URL = 'http://llm.internal';
        process.env.LLM_MODEL = 'model-x';
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => null });
        await expect(chatCompletion({ organizationId: null })).rejects.toMatchObject({ statusCode: 502 });
    });
});

// --- Streaming ------------------------------------------------------------

/** A fake streaming Response whose body emits the given string chunks. */
function streamResponse(chunks) {
    const encoder = new TextEncoder();
    return {
        ok: true,
        body: new ReadableStream({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
                controller.close();
            }
        })
    };
}

async function streamRound(provider, chunks, messages = [], model = 'model-x') {
    process.env.LLM_PROVIDER = provider;
    process.env.LLM_BASE_URL = 'http://llm.internal';
    process.env.LLM_MODEL = model;
    fetchMock.mockResolvedValueOnce(streamResponse(chunks));
    const deltas = [];
    const thinkingDeltas = [];
    let message = null;
    for await (const event of streamChatCompletion({ organizationId: null, system: 'be brief', messages, tools: TOOLS })) {
        if (event.type === 'text') deltas.push(event.text);
        else if (event.type === 'thinking') thinkingDeltas.push(event.text);
        else if (event.type === 'message') message = event;
    }
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    return { deltas, thinkingDeltas, message, request, url: fetchMock.mock.calls[0][0] };
}

describe('streamChatCompletion', () => {
    it('parses OpenAI-shaped SSE deltas, reassembling split tool arguments', async () => {
        const raw = [
            'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"list_types","arguments":"{\\"a\\":"}}]}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}\n\n',
            'data: [DONE]\n\n'
        ].join('');
        // Split mid-line across chunks to prove the reader buffers.
        const cut = raw.indexOf('"lo"') + 2;
        const { deltas, message, request, url } = await streamRound('openai', [raw.slice(0, cut), raw.slice(cut)]);
        expect(url).toBe('http://llm.internal/v1/chat/completions');
        expect(request.stream).toBe(true);
        expect(deltas).toEqual(['Hel', 'lo']);
        expect(message).toEqual({
            type: 'message',
            content: 'Hello',
            thinking: '',
            toolCalls: [{ id: 'c1', name: 'list_types', arguments: { a: 1 } }]
        });
    });

    it('parses native Ollama newline-delimited JSON', async () => {
        const { deltas, message, request } = await streamRound('ollama', [
            '{"message":{"content":"Hi"},"done":false}\n',
            '{"message":{"content":" there","tool_calls":[{"function":{"name":"list_types","arguments":{"a":1}}}]},"done":false}\n',
            '{"message":{"content":""},"done":true}\n'
        ]);
        expect(request.stream).toBe(true);
        expect(deltas).toEqual(['Hi', ' there']);
        expect(message).toEqual({
            type: 'message',
            content: 'Hi there',
            thinking: '',
            toolCalls: [{ id: 'ollama-0', name: 'list_types', arguments: { a: 1 } }]
        });
    });

    it('parses Messages-protocol events, reassembling partial tool JSON', async () => {
        const { deltas, message, request } = await streamRound('anthropic', [
            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Ans"}}\n\n',
            'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
            'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_1","name":"list_types"}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"b\\":2}"}}\n\n',
            'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n'
        ]);
        expect(request.stream).toBe(true);
        expect(deltas).toEqual(['Ans']);
        expect(message).toEqual({
            type: 'message',
            content: 'Ans',
            thinking: '',
            toolCalls: [{ id: 'tu_1', name: 'list_types', arguments: { b: 2 } }]
        });
    });

    it('splits inline thinking from the answer across chunk boundaries', async () => {
        const raw = [
            'data: {"choices":[{"delta":{"content":"\u003cthi"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"nking\u003eplan A\u003c/thinking\u003eAnswer"}}]}\n\n',
            'data: [DONE]\n\n'
        ].join('');
        const { deltas, thinkingDeltas, message } = await streamRound('openai', [raw]);
        expect(thinkingDeltas).toEqual(['plan A']);
        expect(deltas).toEqual(['Answer']);
        expect(message).toEqual({ type: 'message', content: 'Answer', thinking: 'plan A', toolCalls: [] });
    });

    it('splits a reasoning-first stream that carries no open tag (Ollama-prefilled qwen3)', async () => {
        const close = '\u003c/think\u003e';
        const raw = [
            'data: {"choices":[{"delta":{"content":"Okay, pla"}}]}\n\n',
            `data: {"choices":[{"delta":{"content":"n A${close}Answer"}}]}\n\n`,
            'data: [DONE]\n\n'
        ].join('');
        const { deltas, thinkingDeltas, message } = await streamRound('openai', [raw], [], 'qwen3:4b');
        expect(thinkingDeltas.join('')).toBe('Okay, plan A');
        expect(deltas).toEqual(['Answer']);
        expect(message).toEqual({ type: 'message', content: 'Answer', thinking: 'Okay, plan A', toolCalls: [] });
    });

    it('reclassifies a tagless reasoning-first stream as a plain answer', async () => {
        const raw = [
            'data: {"choices":[{"delta":{"content":"Just an "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
            'data: [DONE]\n\n'
        ].join('');
        const { deltas, thinkingDeltas, message } = await streamRound('openai', [raw], [], 'qwen3:4b');
        expect(thinkingDeltas.join('')).toBe('Just an answer');
        expect(deltas).toEqual([]);
        expect(message).toEqual({ type: 'message', content: 'Just an answer', thinking: '', toolCalls: [] });
    });

    it('keeps provider reasoning ahead of inline tags and strips them from the answer', async () => {
        process.env.LLM_PROVIDER = 'openai';
        process.env.LLM_BASE_URL = 'http://llm.internal';
        process.env.LLM_MODEL = 'model-x';
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ choices: [{ message: { content: '\u003cthinking\u003ewhy\u003c/thinking\u003e42', reasoning_content: 'hmm' } }] })
        });
        const result = await chatCompletion({ organizationId: null });
        expect(result).toEqual({ content: '42', thinking: 'hmmwhy', toolCalls: [] });
    });

    it('throws 503 when no provider resolves', async () => {
        await expect((async () => {
            for await (const _ of streamChatCompletion({ organizationId: null })) { /* drain */ }
        })()).rejects.toMatchObject({ statusCode: 503 });
    });

    it('aborts the request when the caller cancels', async () => {
        process.env.LLM_PROVIDER = 'openai';
        process.env.LLM_BASE_URL = 'http://llm.internal';
        process.env.LLM_MODEL = 'model-x';
        const controller = new AbortController();
        let requestSignal = null;
        fetchMock.mockImplementationOnce(async (url, init) => {
            requestSignal = init.signal;
            return {
                ok: true,
                body: new ReadableStream({
                    start(stream) {
                        stream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
                        init.signal.addEventListener('abort', () => stream.error(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
                    }
                })
            };
        });
        const drain = (async () => {
            for await (const _ of streamChatCompletion({ organizationId: null, messages: [], signal: controller.signal })) { /* consume */ }
        })();
        await vi.waitFor(() => expect(requestSignal).toBeTruthy());
        controller.abort();
        await expect(drain).rejects.toBeTruthy();
        expect(requestSignal.aborted).toBe(true);
    });
});
