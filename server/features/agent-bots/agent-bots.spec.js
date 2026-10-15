import { describe, it, expect, beforeEach, vi } from 'vitest';

// The runtime's failure modes, pinned: bot-to-bot loops, implicit direct
// answers, subscription gates for group/instance chats (composed ancestor
// views included), the no-LLM posture, tool errors as readable results,
// the round budget, and double-fire protection. The MCP transport is
// protocol-pinned beside them: handshake negotiation, notifications,
// tool listing, and the auth/unknown-tool error shapes.

const { mockedSupport, mockedLlm, mockedBotsService, mockedBotRepository, mockedTools } = vi.hoisted(() => ({
    mockedSupport: {
        registerMessageObserver: vi.fn(),
        listMessages: vi.fn(),
        sendUserMessage: vi.fn(),
        instanceConversationKey: (type, id) => `instance:${type}:${id}`
    },
    mockedLlm: {
        isLlmAvailable: vi.fn(),
        chatCompletion: vi.fn()
    },
    mockedBotsService: {
        buildBotAuth: vi.fn(),
        isBotUser: vi.fn()
    },
    mockedBotRepository: {
        findSubscriptionsByConversation: vi.fn()
    },
    mockedTools: {
        executeTool: vi.fn(),
        chatToolDescriptors: vi.fn(() => [
            { name: 'list_types', description: 'lists types', inputSchema: { type: 'object', properties: {} } }
        ]),
        mcpToolDescriptors: vi.fn(() => [
            { name: 'list_types', description: 'lists types', inputSchema: { type: 'object', properties: {} } }
        ])
    }
}));

vi.mock('~/server/features/llm/service.js', () => mockedLlm);
vi.mock('~/server/features/support/service.js', () => mockedSupport);
vi.mock('./service.js', () => mockedBotsService);
vi.mock('./repository.js', () => mockedBotRepository);
vi.mock('./tools.js', () => mockedTools);

import { resolveTargetBots, runBotReply } from './runtime.js';
import { handleMcpRequest } from './mcp.js';

const HUMAN = 'user-human';
const BOT_A = 'user-bot-a';
const BOT_B = 'user-bot-b';

const botAuth = { userId: BOT_A, name: 'Bot', organizationId: 'org-1', organizationData: { name: 'Org' } };

beforeEach(() => {
    vi.clearAllMocks();
    mockedBotsService.isBotUser.mockResolvedValue(false);
    mockedBotsService.buildBotAuth.mockResolvedValue({ ...botAuth });
    mockedLlm.isLlmAvailable.mockResolvedValue(true);
    mockedLlm.chatCompletion.mockResolvedValue({ content: 'ok' });
    mockedSupport.listMessages.mockResolvedValue([]);
    mockedSupport.sendUserMessage.mockResolvedValue({});
    mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([]);
});

describe('resolveTargetBots', () => {
    it('never triggers on the support channel', async () => {
        expect(await resolveTargetBots({ kind: 'support' }, { sender: 'user', senderUserId: HUMAN })).toEqual([]);
    });

    it('never triggers on non-user senders', async () => {
        expect(await resolveTargetBots({ kind: 'group', conversationKey: 'group:g' }, { sender: 'support', senderUserId: HUMAN })).toEqual([]);
    });

    it('never triggers when the sender is a bot (loop prevention)', async () => {
        mockedBotsService.isBotUser.mockResolvedValue(true);
        expect(await resolveTargetBots({ kind: 'group', conversationKey: 'group:g' }, { sender: 'user', senderUserId: BOT_A })).toEqual([]);
    });

    it('answers a direct chat when exactly one participant is a bot', async () => {
        mockedBotsService.isBotUser.mockImplementation(async (userId) => userId === BOT_A);
        const message = { sender: 'user', senderUserId: HUMAN, participants: [HUMAN, BOT_A] };
        expect(await resolveTargetBots({ kind: 'direct', participants: [HUMAN, BOT_A] }, message)).toEqual([BOT_A]);
    });

    it('stays silent when both direct participants are bots', async () => {
        mockedBotsService.isBotUser.mockResolvedValue(true);
        const message = { sender: 'user', senderUserId: BOT_A, participants: [BOT_A, BOT_B] };
        expect(await resolveTargetBots({ kind: 'direct', participants: [BOT_A, BOT_B] }, message)).toEqual([]);
    });

    it('stays silent when no direct participant is a bot', async () => {
        const message = { sender: 'user', senderUserId: HUMAN, participants: [HUMAN, 'user-other'] };
        expect(await resolveTargetBots({ kind: 'direct', participants: [HUMAN, 'user-other'] }, message)).toEqual([]);
    });

    it('triggers group bots through subscriptions', async () => {
        mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([{ botUserId: BOT_A }]);
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'group:g' };
        expect(await resolveTargetBots({ kind: 'group', conversationKey: 'group:g' }, message)).toEqual([BOT_A]);
    });

    it('triggers an instance bot subscribed to any ancestor on the message path', async () => {
        mockedBotRepository.findSubscriptionsByConversation.mockImplementation(async (keys) => (
            keys.includes('instance:project:p1') ? [{ botUserId: BOT_A }] : []
        ));
        const context = { kind: 'instance', conversationKey: 'instance:cassette:c1' };
        const message = {
            sender: 'user',
            senderUserId: HUMAN,
            conversationKey: 'instance:cassette:c1',
            instancePath: [
                { type: 'organization', id: 'org-1' },
                { type: 'project', id: 'p1' },
                { type: 'cassette', id: 'c1' }
            ]
        };
        expect(await resolveTargetBots(context, message)).toEqual([BOT_A]);
    });
});

describe('runBotReply', () => {
    const context = { kind: 'direct', conversationKey: `direct:${HUMAN}:${BOT_A}`, participants: [HUMAN, BOT_A] };
    const message = { sender: 'user', senderUserId: HUMAN, participants: [HUMAN, BOT_A], conversationKey: context.conversationKey };

    it('replies that the provider is unconfigured instead of staying silent', async () => {
        mockedLlm.isLlmAvailable.mockResolvedValue(false);
        await runBotReply(BOT_A, context, message);
        expect(mockedLlm.chatCompletion).not.toHaveBeenCalled();
        expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(1);
        const body = mockedSupport.sendUserMessage.mock.calls[0][1];
        expect(body.message).toMatch(/not configured/i);
        expect(body.recipientUserId).toBe(HUMAN);
    });

    it('sends the final assistant text through the auth-checked path', async () => {
        mockedSupport.listMessages.mockResolvedValue([
            { senderUserId: HUMAN, message: 'hello' },
            { senderUserId: BOT_A, message: 'hi' }
        ]);
        mockedLlm.chatCompletion.mockResolvedValue({ content: 'the answer', toolCalls: [] });
        await runBotReply(BOT_A, context, message);
        expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(1);
        expect(mockedSupport.sendUserMessage.mock.calls[0][1].message).toBe('the answer');
        const { system, messages } = mockedLlm.chatCompletion.mock.calls[0][0];
        expect(system).toMatch(/Bot/);
        expect(messages.some((entry) => entry.role === 'assistant' && entry.content === 'hi')).toBe(true);
    });

    it('executes tool calls with the bot auth and feeds results back', async () => {
        mockedLlm.chatCompletion
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ id: 'call-1', name: 'list_types', arguments: { x: 1 } }]
            })
            .mockResolvedValueOnce({ content: 'done', toolCalls: [] });
        mockedTools.executeTool.mockResolvedValue({ types: [] });
        await runBotReply(BOT_A, context, message);
        expect(mockedTools.executeTool).toHaveBeenCalledWith('list_types', { x: 1 }, botAuth);
        const toolMessage = mockedLlm.chatCompletion.mock.calls[1][0].messages.find((entry) => entry.role === 'tool');
        expect(toolMessage.toolCallId).toBe('call-1');
        expect(toolMessage.name).toBe('list_types');
        expect(JSON.parse(toolMessage.content)).toEqual({ types: [] });
        expect(mockedSupport.sendUserMessage.mock.calls[0][1].message).toBe('done');
    });

    it('turns tool failures into readable tool results and continues', async () => {
        mockedLlm.chatCompletion
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ id: 'call-1', name: 'list_types', arguments: {} }]
            })
            .mockResolvedValueOnce({ content: 'recovered', toolCalls: [] });
        mockedTools.executeTool.mockRejectedValue(new Error('boom'));
        await runBotReply(BOT_A, context, message);
        const toolMessage = mockedLlm.chatCompletion.mock.calls[1][0].messages.find((entry) => entry.role === 'tool');
        expect(JSON.parse(toolMessage.content)).toEqual({ error: 'boom' });
        expect(mockedSupport.sendUserMessage.mock.calls[0][1].message).toBe('recovered');
    });

    it('stops at the round budget with an honest notice', async () => {
        mockedLlm.chatCompletion.mockResolvedValue({
            content: '',
            toolCalls: [{ id: 'c', name: 'list_types', arguments: {} }]
        });
        mockedTools.executeTool.mockResolvedValue({});
        await runBotReply(BOT_A, context, message);
        expect(mockedTools.executeTool).toHaveBeenCalledTimes(8);
        expect(mockedSupport.sendUserMessage.mock.calls[0][1].message).toMatch(/budget/i);
    });

    it('skips duplicate concurrent runs for the same bot and conversation', async () => {
        mockedLlm.chatCompletion.mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { content: 'one' };
        });
        await Promise.all([
            runBotReply(BOT_A, context, message),
            runBotReply(BOT_A, context, message)
        ]);
        expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(1);
    });
});

describe('handleMcpRequest', () => {
    it('negotiates a supported protocol version and falls back to the default', async () => {
        const echoed = await handleMcpRequest({}, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
        expect(echoed.result.protocolVersion).toBe('2025-03-26');
        const fallback = await handleMcpRequest({}, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
        expect(fallback.result.protocolVersion).toBe('2024-11-05');
        expect(echoed.result.capabilities.tools).toBeDefined();
        expect(echoed.result.serverInfo.name).toBe('perigram');
    });

    it('acknowledges notifications with no response', async () => {
        expect(await handleMcpRequest({}, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    });

    it('answers ping', async () => {
        const response = await handleMcpRequest({}, { jsonrpc: '2.0', id: 3, method: 'ping' });
        expect(response.result).toEqual({});
    });

    it('lists tool descriptors with input schemas', async () => {
        const response = await handleMcpRequest({}, { jsonrpc: '2.0', id: 4, method: 'tools/list' });
        expect(Array.isArray(response.result.tools)).toBe(true);
        for (const tool of response.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('requires authentication for tool calls', async () => {
        await expect(handleMcpRequest({}, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'ping' } }))
            .rejects.toMatchObject({ statusCode: 401 });
    });

    it('reports tool execution errors as tool errors, not protocol errors', async () => {
        mockedTools.executeTool.mockRejectedValueOnce(Object.assign(new Error('Unknown tool: no_such_tool'), { statusCode: 400 }));
        const response = await handleMcpRequest(
            { context: { auth: { userId: HUMAN } } },
            { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'no_such_tool', arguments: {} } }
        );
        expect(response.result.isError).toBe(true);
        expect(response.result.content[0].text).toMatch(/Unknown tool/);
    });

    it('returns tool results as text content', async () => {
        mockedTools.executeTool.mockResolvedValue({ ok: true });
        const response = await handleMcpRequest(
            { context: { auth: { userId: HUMAN } } },
            { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'list_types', arguments: {} } }
        );
        expect(response.result.isError).toBeUndefined();
        expect(JSON.parse(response.result.content[0].text)).toEqual({ ok: true });
    });

    it('rejects batch payloads', async () => {
        const response = await handleMcpRequest({}, [{ jsonrpc: '2.0', id: 8, method: 'ping' }]);
        expect(response.error.code).toBe(-32600);
    });

    it('rejects unknown methods', async () => {
        const response = await handleMcpRequest({}, { jsonrpc: '2.0', id: 9, method: 'resources/list' });
        expect(response.error.code).toBe(-32601);
    });
});
