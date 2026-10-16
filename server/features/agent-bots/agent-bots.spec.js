import { describe, it, expect, beforeEach, vi } from 'vitest';

// The AI runtime's failure modes, pinned: self-trigger loops, implicit
// direct answers, subscription gates for group/instance chats (composed
// ancestor views included), the no-LLM posture, the delegation contract
// (tools run with the triggering sender's auth, replies post as the
// assistant; a sender without the agent-chat capability stays silent),
// tool errors as readable results, the round budget, and double-fire
// protection. The MCP transport is protocol-pinned beside them:
// handshake negotiation, notifications, tool listing, and the
// auth/unknown-tool error shapes.

const { mockedSupport, mockedLlm, mockedConnections, mockedBotsService, mockedOrganizations, mockedBotRepository, mockedTools, mockedRegistry } = vi.hoisted(() => {
    const mockedLlm = { isLlmAvailable: vi.fn(), chatCompletion: vi.fn() };
    // Streaming twin: delegates to the chatCompletion mock so a test sets one
    // behavior and both seams answer identically; yields the content once,
    // then the assembled neutral message.
    mockedLlm.streamChatCompletion = vi.fn(async function* (args) {
        const message = await mockedLlm.chatCompletion(args);
        const content = message?.content || '';
        const thinking = message?.thinking || '';
        if (thinking) yield { type: 'thinking', text: thinking };
        if (content) yield { type: 'text', text: content };
        yield { type: 'message', content, thinking, toolCalls: message?.toolCalls || [] };
    });
    return {
    mockedSupport: {
        registerMessageObserver: vi.fn(),
        listMessages: vi.fn(),
        sendUserMessage: vi.fn(),
        normalizeInstanceRefs: vi.fn(refs => Array.isArray(refs) ? refs : []),
        instanceConversationKey: (type, id) => `instance:${type}:${id}`,
        parseInstanceKey: (key = '') => {
            const parts = String(key).split(':');
            if (parts.length !== 3 || parts[0] !== 'instance' || !parts[1] || !parts[2]) return null;
            return { type: parts[1], id: parts[2] };
        }
    },
    mockedLlm,
    mockedConnections: { publish: vi.fn() },
    mockedBotsService: {
        buildPrincipalAuth: vi.fn(),
        ensureOrganizationAssistant: vi.fn(),
        isBotUser: vi.fn()
    },
    mockedOrganizations: { canUseAgentChats: vi.fn() },
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
    },
    mockedRegistry: {
        getInstanceService: vi.fn()
    }
    };
});

vi.mock('~/server/features/llm/service.js', () => mockedLlm);
vi.mock('~/server/features/support/service.js', () => mockedSupport);
vi.mock('~/server/features/connections/service.js', () => mockedConnections);
vi.mock('~/server/features/organizations/service.js', () => mockedOrganizations);
vi.mock('~/server/runtime/app-registry.js', () => ({ getAppRegistry: () => mockedRegistry }));
vi.mock('./service.js', () => mockedBotsService);
vi.mock('./repository.js', () => mockedBotRepository);
vi.mock('./tools.js', () => mockedTools);

import { resolveAssistantTarget, runAssistantReply, runAssistantWake, registerSupportMessageObserver, handleMessageInserted, stopConversationRuns } from './runtime.js';
import { handleMcpRequest } from './mcp.js';

const HUMAN = 'user-human';
const HUMAN_B = 'user-other';
const ASSISTANT = 'user-bot-a';
const ASSISTANT_B = 'user-bot-b';

const humanAuth = { userId: HUMAN, name: 'Human', organizationId: 'org-1', organizationData: { name: 'Org' } };
const assistantAuth = { userId: ASSISTANT, name: 'Assistant', organizationId: 'org-1', organizationData: { name: 'Org' } };
const assistantUser = {
    id: ASSISTANT,
    toJSON: () => ({ _id: ASSISTANT, identity: { name: 'Assistant' }, data: { bot: { createdAt: new Date() } } })
};

beforeEach(() => {
    vi.clearAllMocks();
    mockedBotsService.isBotUser.mockResolvedValue(false);
    mockedBotsService.buildPrincipalAuth.mockImplementation(async (userId) => {
        if (String(userId) === HUMAN) return { ...humanAuth };
        if (String(userId) === ASSISTANT) return { ...assistantAuth };
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    });
    mockedBotsService.ensureOrganizationAssistant.mockResolvedValue(assistantUser);
    mockedOrganizations.canUseAgentChats.mockResolvedValue(true);
    mockedLlm.isLlmAvailable.mockResolvedValue(true);
    mockedLlm.chatCompletion.mockResolvedValue({ content: 'ok' });
    mockedSupport.listMessages.mockResolvedValue([]);
    mockedSupport.sendUserMessage.mockResolvedValue({});
    mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([]);
});

describe('registerSupportMessageObserver', () => {
    it('wires the chat trigger into the support message seam (the nitro plugin calls this)', () => {
        registerSupportMessageObserver();
        expect(mockedSupport.registerMessageObserver).toHaveBeenCalledWith(handleMessageInserted);
    });
});

describe('resolveAssistantTarget', () => {
    it('never triggers on the support channel', async () => {
        expect(await resolveAssistantTarget({ kind: 'support' }, { sender: 'user', senderUserId: HUMAN })).toBeNull();
    });

    it('never triggers on non-user senders', async () => {
        expect(await resolveAssistantTarget({ kind: 'group', conversationKey: 'group:g' }, { sender: 'support', senderUserId: HUMAN })).toBeNull();
    });

    it('never triggers when the sender is the AI (loop prevention)', async () => {
        mockedBotsService.isBotUser.mockResolvedValue(true);
        expect(await resolveAssistantTarget({ kind: 'group', conversationKey: 'group:g' }, { sender: 'user', senderUserId: ASSISTANT })).toBeNull();
    });

    it('answers a direct chat when exactly one participant is the assistant', async () => {
        mockedBotsService.isBotUser.mockImplementation(async (userId) => userId === ASSISTANT);
        const message = { sender: 'user', senderUserId: HUMAN, participants: [HUMAN, ASSISTANT] };
        expect(await resolveAssistantTarget({ kind: 'direct', participants: [HUMAN, ASSISTANT] }, message))
            .toEqual({ assistantId: ASSISTANT, profile: '', model: '' });
    });

    it('resolves a direct chat profile from its profile-only subscription row', async () => {
        mockedBotsService.isBotUser.mockImplementation(async (userId) => userId === ASSISTANT);
        mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([{ botUserId: ASSISTANT, profile: 'cloud-big' }]);
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'direct:user-human:user-bot-a', participants: [HUMAN, ASSISTANT] };
        expect(await resolveAssistantTarget({ kind: 'direct', conversationKey: 'direct:user-human:user-bot-a', participants: [HUMAN, ASSISTANT] }, message))
            .toEqual({ assistantId: ASSISTANT, profile: 'cloud-big', model: '' });
    });

    it('stays silent when both direct participants are bots', async () => {
        mockedBotsService.isBotUser.mockResolvedValue(true);
        const message = { sender: 'user', senderUserId: ASSISTANT, participants: [ASSISTANT, ASSISTANT_B] };
        expect(await resolveAssistantTarget({ kind: 'direct', participants: [ASSISTANT, ASSISTANT_B] }, message)).toBeNull();
    });

    it('stays silent when no direct participant is the assistant', async () => {
        const message = { sender: 'user', senderUserId: HUMAN, participants: [HUMAN, HUMAN_B] };
        expect(await resolveAssistantTarget({ kind: 'direct', participants: [HUMAN, HUMAN_B] }, message)).toBeNull();
    });

    it('carries the conversation model override beside the profile', async () => {
        mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([
            { botUserId: ASSISTANT, profile: 'cloud-big', model: 'qwen3:30b-a3b' }
        ]);
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'group:g1' };
        expect(await resolveAssistantTarget({ kind: 'group', conversationKey: 'group:g1' }, message))
            .toEqual({ assistantId: ASSISTANT, profile: 'cloud-big', model: 'qwen3:30b-a3b' });
    });

    it('triggers the subscribed AI in group chats, carrying the conversation profile', async () => {
        mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([{ botUserId: ASSISTANT, profile: 'cloud-big' }]);
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'group:g' };
        expect(await resolveAssistantTarget({ kind: 'group', conversationKey: 'group:g' }, message))
            .toEqual({ assistantId: ASSISTANT, profile: 'cloud-big', model: '' });
    });

    it('triggers through a subscription on any ancestor of the message path', async () => {
        mockedBotRepository.findSubscriptionsByConversation.mockImplementation(async (keys) => (
            keys.includes('instance:project:p1') ? [{ botUserId: ASSISTANT }] : []
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
        expect(await resolveAssistantTarget(context, message)).toEqual({ assistantId: ASSISTANT, profile: '', model: '' });
    });
});

describe('runAssistantReply', () => {
    const context = { kind: 'direct', conversationKey: `direct:${HUMAN}:${ASSISTANT}`, participants: [HUMAN, ASSISTANT] };
    const message = { sender: 'user', senderUserId: HUMAN, participants: [HUMAN, ASSISTANT], conversationKey: context.conversationKey };
    const target = { assistantId: ASSISTANT, profile: 'cloud-big', model: '' };

    it('replies that the provider is unconfigured instead of staying silent', async () => {
        mockedLlm.isLlmAvailable.mockResolvedValue(false);
        await runAssistantReply(target, context, message);
        expect(mockedLlm.chatCompletion).not.toHaveBeenCalled();
        expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(1);
        const body = mockedSupport.sendUserMessage.mock.calls[0][1];
        expect(body.message).toMatch(/not configured/i);
        expect(body.recipientUserId).toBe(HUMAN);
    });

    it('stays silent when the sender lacks the agent-chat capability', async () => {
        mockedOrganizations.canUseAgentChats.mockResolvedValue(false);
        await runAssistantReply(target, context, message);
        expect(mockedLlm.chatCompletion).not.toHaveBeenCalled();
        expect(mockedSupport.sendUserMessage).not.toHaveBeenCalled();
        expect(mockedConnections.publish).not.toHaveBeenCalled();
    });

    it('stays silent when the sender no longer resolves', async () => {
        mockedBotsService.buildPrincipalAuth.mockImplementation(async (userId) => {
            if (String(userId) === ASSISTANT) return { ...assistantAuth };
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        });
        await runAssistantReply(target, context, message);
        expect(mockedLlm.chatCompletion).not.toHaveBeenCalled();
        expect(mockedSupport.sendUserMessage).not.toHaveBeenCalled();
    });

    it('sends the final assistant text as the assistant, acting for the sender', async () => {
        mockedSupport.listMessages.mockResolvedValue([
            { senderUserId: HUMAN, message: 'hello' },
            { senderUserId: ASSISTANT, message: 'hi' }
        ]);
        mockedLlm.chatCompletion.mockResolvedValue({ content: 'the answer', toolCalls: [] });
        await runAssistantReply(target, context, message);
        expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(1);
        const [sendAuth, body] = mockedSupport.sendUserMessage.mock.calls[0];
        expect(sendAuth.userId).toBe(ASSISTANT);
        expect(body.message).toBe('the answer');
        const { system, messages, profileId } = mockedLlm.chatCompletion.mock.calls[0][0];
        expect(system).toMatch(/Assistant/);
        expect(system).toMatch(/Human/);
        expect(profileId).toBe('cloud-big');
        expect(messages.some((entry) => entry.role === 'assistant' && entry.content === 'hi')).toBe(true);
    });

    it('streams the answer onto the conversation topic under the assistant identity', async () => {
        mockedLlm.chatCompletion.mockResolvedValue({ content: 'the answer', toolCalls: [] });
        await runAssistantReply(target, context, message);
        const publishes = mockedConnections.publish.mock.calls.map(([topic, payload]) => ({ topic, payload }));
        const streamed = publishes.filter(({ payload }) => payload?.type === 'bot_stream');
        expect(streamed.length).toBeGreaterThan(0);
        expect(streamed.at(-1)).toEqual({
            topic: `conversation:${context.conversationKey}`,
            payload: { type: 'bot_stream', conversationKey: context.conversationKey, userId: ASSISTANT, name: 'Assistant', text: 'the answer' }
        });
        expect(publishes.some(({ payload }) => payload?.type === 'bot_stream_end')).toBe(true);
    });

    it('runs the loop on the conversation model override', async () => {
        mockedLlm.chatCompletion.mockResolvedValue({ content: 'done', toolCalls: [] });
        await runAssistantReply({ assistantId: ASSISTANT, profile: 'cloud-big', model: 'qwen3:30b-a3b' }, context, message);
        expect(mockedLlm.chatCompletion.mock.calls[0][0].model).toBe('qwen3:30b-a3b');
        expect(mockedLlm.chatCompletion.mock.calls[0][0].profileId).toBe('cloud-big');
    });

    it('publishes the run chronology — thinking segments and tool invocations in order', async () => {
        mockedLlm.chatCompletion
            .mockResolvedValueOnce({ content: '', thinking: 'need the types', toolCalls: [{ id: 't1', name: 'list_types', arguments: {} }] })
            .mockResolvedValueOnce({ content: 'done', thinking: 'now the answer', toolCalls: [] });
        mockedTools.executeTool.mockResolvedValue({ types: [] });
        await runAssistantReply(target, context, message);
        const published = mockedConnections.publish.mock.calls.map(([, payload]) => payload);
        expect(published.some(payload => payload?.type === 'bot_activity'
            && payload.steps?.some(step => step.kind === 'thinking' && step.text === 'need the types'))).toBe(true);
        expect(published.some(payload => payload?.type === 'bot_activity'
            && payload.steps?.some(step => step.kind === 'tool' && step.name === 'list_types' && step.status === 'running'))).toBe(true);
        expect(published.some(payload => payload?.type === 'bot_activity'
            && payload.steps?.some(step => step.kind === 'tool' && step.status === 'done'))).toBe(true);
        // The run's provenance rides the persisted reply as one chronology.
        const sent = mockedSupport.sendUserMessage.mock.calls.at(-1)[1];
        expect(sent.agent).toEqual({ steps: [
            { kind: 'thinking', text: 'need the types' },
            { kind: 'tool', id: 't1', name: 'list_types', status: 'done' },
            { kind: 'thinking', text: 'now the answer' }
        ] });
    });

    it('executes tool calls with the sender\'s auth (delegation) and feeds results back', async () => {
        mockedLlm.chatCompletion
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ id: 'call-1', name: 'list_types', arguments: { x: 1 } }]
            })
            .mockResolvedValueOnce({ content: 'done', toolCalls: [] });
        mockedTools.executeTool.mockResolvedValue({ types: [] });
        await runAssistantReply(target, context, message);
        expect(mockedTools.executeTool).toHaveBeenCalledWith('list_types', { x: 1 }, humanAuth, { instanceRefs: [] });
        const toolMessage = mockedLlm.chatCompletion.mock.calls[1][0].messages.find((entry) => entry.role === 'tool');
        expect(toolMessage.toolCallId).toBe('call-1');
        expect(toolMessage.name).toBe('list_types');
        expect(JSON.parse(toolMessage.content)).toEqual({ types: [] });
        expect(mockedSupport.sendUserMessage.mock.calls[0][1].message).toBe('done');
    });

    it('rides chat-run attached instance refs on the final reply', async () => {
        const ref = { type: 'cassette', id: 'c1', label: 'Cassette c1' };
        mockedLlm.chatCompletion
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ id: 'call-1', name: 'attach_instances', arguments: { instances: [{ type: ref.type, id: ref.id }] } }]
            })
            .mockResolvedValueOnce({ content: 'attached', toolCalls: [] });
        mockedTools.executeTool.mockImplementation(async (name, args, auth, run) => {
            if (name === 'attach_instances' && run) run.instanceRefs.push(ref);
            return [ref];
        });
        await runAssistantReply(target, context, message);
        const body = mockedSupport.sendUserMessage.mock.calls[0][1];
        expect(body.message).toBe('attached');
        expect(body.instanceRefs).toEqual([ref]);
    });

    it('turns tool failures into readable tool results and continues', async () => {
        mockedLlm.chatCompletion
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ id: 'call-1', name: 'list_types', arguments: {} }]
            })
            .mockResolvedValueOnce({ content: 'recovered', toolCalls: [] });
        mockedTools.executeTool.mockRejectedValue(new Error('boom'));
        await runAssistantReply(target, context, message);
        const toolMessage = mockedLlm.chatCompletion.mock.calls[1][0].messages.find((entry) => entry.role === 'tool');
        expect(JSON.parse(toolMessage.content)).toEqual({ error: 'boom' });
        // The failure rides the persisted step — the room sees the
        // rejection, not just the model's story about it.
        const sent = mockedSupport.sendUserMessage.mock.calls[0][1];
        expect(sent.agent.steps).toContainEqual({ kind: 'tool', id: 'call-1', name: 'list_types', status: 'error', error: 'boom' });
        expect(sent.message).toBe('recovered');
    });

    it('stops at the round budget with an honest notice', async () => {
        mockedLlm.chatCompletion.mockResolvedValue({
            content: '',
            toolCalls: [{ id: 'c', name: 'list_types', arguments: {} }]
        });
        mockedTools.executeTool.mockResolvedValue({});
        await runAssistantReply(target, context, message);
        expect(mockedTools.executeTool).toHaveBeenCalledTimes(8);
        expect(mockedSupport.sendUserMessage.mock.calls[0][1].message).toMatch(/budget/i);
    });

    it('skips duplicate concurrent runs for the same conversation', async () => {
        mockedLlm.chatCompletion.mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { content: 'one' };
        });
        await Promise.all([
            runAssistantReply(target, context, message),
            runAssistantReply(target, context, message)
        ]);
        expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(1);
    });
});

describe('runAssistantWake', () => {
    const subscription = { botUserId: ASSISTANT, conversationKey: 'instance:organization:org-1', organizationId: 'org-1' };
    const wakeEvent = {
        targetId: 'inst-7',
        targetType: 'queue',
        fromStatePrimary: 'approved',
        toStatePrimary: 'nested',
        actor: { id: 'user-human', label: 'Human', principalType: 'user' }
    };
    const rule = { type: 'queue', state: 'nested', createdBy: HUMAN };

    beforeEach(() => {
        mockedRegistry.getInstanceService.mockReturnValue({
            processGetById: vi.fn(async () => ({ _id: 'inst-7', name: 'Queue 7' }))
        });
    });

    it('stays silent when no provider resolves (nobody waits in the room)', async () => {
        mockedLlm.isLlmAvailable.mockResolvedValue(false);
        await runAssistantWake(subscription, wakeEvent, rule);
        expect(mockedLlm.chatCompletion).not.toHaveBeenCalled();
        expect(mockedSupport.sendUserMessage).not.toHaveBeenCalled();
    });

    it('stays silent when the rule author lost the agent-chat capability', async () => {
        mockedOrganizations.canUseAgentChats.mockResolvedValue(false);
        await runAssistantWake(subscription, wakeEvent, rule);
        expect(mockedLlm.chatCompletion).not.toHaveBeenCalled();
        expect(mockedSupport.sendUserMessage).not.toHaveBeenCalled();
    });

    it('reads the instance with the rule author\'s auth and posts as the assistant', async () => {
        mockedLlm.chatCompletion.mockResolvedValue({ content: 'nested and accounted for', toolCalls: [] });
        mockedSupport.listMessages.mockResolvedValue([]);
        await runAssistantWake(subscription, wakeEvent, rule);
        expect(mockedRegistry.getInstanceService).toHaveBeenCalledWith('queue');
        const [readId, readAuth] = mockedRegistry.getInstanceService().processGetById.mock.calls[0];
        expect(readId).toBe('inst-7');
        expect(readAuth).toEqual(humanAuth);
        const trigger = mockedLlm.chatCompletion.mock.calls[0][0].messages.at(-1);
        expect(trigger.role).toBe('user');
        expect(trigger.content).toContain('Queue 7');
        expect(trigger.content).toContain('approved → nested');
        const [sendAuth, body] = mockedSupport.sendUserMessage.mock.calls[0];
        expect(sendAuth.userId).toBe(ASSISTANT);
        expect(body).toEqual({
            instance: { type: 'organization', id: 'org-1' },
            message: 'nested and accounted for',
            agent: { steps: [] }
        });
    });

    it('posts into group subscriptions by conversation key', async () => {
        mockedLlm.chatCompletion.mockResolvedValue({ content: 'ok', toolCalls: [] });
        mockedSupport.listMessages.mockResolvedValue([]);
        await runAssistantWake({ ...subscription, conversationKey: 'group:g1' }, wakeEvent, rule);
        const [sendAuth, body] = mockedSupport.sendUserMessage.mock.calls[0];
        expect(sendAuth.userId).toBe(ASSISTANT);
        expect(body).toEqual({
            conversationKey: 'group:g1',
            message: 'ok',
            agent: { steps: [] }
        });
    });

    it('skips silently when the rule author cannot read the instance', async () => {
        mockedRegistry.getInstanceService.mockReturnValue({
            processGetById: vi.fn(async () => { throw new Error('denied'); })
        });
        await runAssistantWake(subscription, wakeEvent, rule);
        expect(mockedLlm.chatCompletion).not.toHaveBeenCalled();
        expect(mockedSupport.sendUserMessage).not.toHaveBeenCalled();
    });

    it('prefers the wake rule model, then the conversation\'s, then the org route', async () => {
        mockedLlm.chatCompletion.mockResolvedValue({ content: 'ok', toolCalls: [] });
        mockedSupport.listMessages.mockResolvedValue([]);
        await runAssistantWake({ botUserId: ASSISTANT, conversationKey: 'group:g1', organizationId: 'org-1', profile: 'convo-brain' }, wakeEvent, { ...rule, profile: 'rule-brain' });
        expect(mockedLlm.chatCompletion.mock.calls[0][0].profileId).toBe('rule-brain');
        await runAssistantWake({ botUserId: ASSISTANT, conversationKey: 'group:g1', organizationId: 'org-1', profile: 'convo-brain' }, wakeEvent, rule);
        expect(mockedLlm.chatCompletion.mock.calls[1][0].profileId).toBe('convo-brain');
        await runAssistantWake({ botUserId: ASSISTANT, conversationKey: 'group:g1', organizationId: 'org-1' }, wakeEvent, rule);
        expect(mockedLlm.chatCompletion.mock.calls[2][0].profileId).toBe('');
    });

    it('shares the in-flight lock with chat replies for the same conversation', async () => {
        mockedLlm.chatCompletion.mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { content: 'one', toolCalls: [] };
        });
        const context = { kind: 'group', conversationKey: 'group:g1' };
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'group:g1', participants: [HUMAN] };
        await Promise.all([
            runAssistantReply({ assistantId: ASSISTANT, profile: '', model: '' }, context, message),
            runAssistantWake({ botUserId: ASSISTANT, conversationKey: 'group:g1', organizationId: 'org-1' }, wakeEvent, rule)
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

describe('stopConversationRuns', () => {
    it('stops an in-flight run and keeps the answer produced so far', async () => {
        let seenSignal = null;
        let releaseStream;
        const held = new Promise(resolve => { releaseStream = resolve; });
        mockedLlm.streamChatCompletion.mockImplementationOnce(async function* (args) {
            seenSignal = args.signal;
            yield { type: 'text', text: 'Half an answer' };
            await held;
            throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        });
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'direct:user-human:user-bot-a', participants: [HUMAN, ASSISTANT] };
        const run = runAssistantReply({ assistantId: ASSISTANT, profile: '', model: '' }, { kind: 'direct' }, message);
        await vi.waitFor(() => expect(seenSignal).toBeTruthy());
        // The first delta reached the room before the stop.
        await vi.waitFor(() => expect(mockedConnections.publish).toHaveBeenCalledWith(
            'conversation:direct:user-human:user-bot-a',
            expect.objectContaining({ type: 'bot_stream', text: 'Half an answer' })
        ));

        expect(stopConversationRuns('org-1', message.conversationKey)).toBe(1);
        expect(seenSignal.aborted).toBe(true);
        releaseStream();
        await run;

        const body = mockedSupport.sendUserMessage.mock.calls[0][1];
        expect(body.message).toBe('Half an answer');
        expect(body.agent).toEqual({ steps: [] });
    });

    it('ignores runs in other conversations', () => {
        expect(stopConversationRuns('org-1', 'group:not-running')).toBe(0);
    });
});
