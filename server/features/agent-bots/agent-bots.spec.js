import { describe, it, expect, beforeEach, vi } from 'vitest';

// The AI runtime's failure modes, pinned: self-trigger loops, implicit
// direct answers, subscription gates for group/instance chats (composed
// ancestor views included, own room before nearest ancestor), the
// mention gate for multi-human rooms, the participants-entry requirement,
// the subscription's org boundary, the no-LLM posture, the delegation
// contract (tools run with the triggering sender's auth, replies post as
// the assistant; a sender without the agent-chat capability stays
// silent), tool errors as readable results, and room-keyed single-run
// coalescing. The MCP transport is protocol-pinned beside them:
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
        getBotIdentity: vi.fn(),
        ASSISTANT_NAME: 'Assistant'
    },
    mockedOrganizations: { canUseAgentChats: vi.fn() },
    mockedBotRepository: {
        findSubscriptionsByConversation: vi.fn()
    },
    mockedTools: {
        executeTool: vi.fn(),
        toolCallDetail: vi.fn((name, args = {}) => String(args?.name || args?.type || args?.actionId || '')),
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
    mockedBotsService.getBotIdentity.mockResolvedValue(null);
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
        mockedBotsService.getBotIdentity.mockResolvedValue({ id: ASSISTANT, name: 'Assistant' });
        expect(await resolveAssistantTarget({ kind: 'group', conversationKey: 'group:g' }, { sender: 'user', senderUserId: ASSISTANT })).toBeNull();
    });

    it('answers a direct chat when exactly one participant is the assistant', async () => {
        mockedBotsService.getBotIdentity.mockImplementation(async (userId) => (
            String(userId) === ASSISTANT ? { id: ASSISTANT, name: 'Assistant' } : null
        ));
        const message = { sender: 'user', senderUserId: HUMAN, participants: [HUMAN, ASSISTANT] };
        expect(await resolveAssistantTarget({ kind: 'direct', participants: [HUMAN, ASSISTANT] }, message))
            .toEqual({ assistantId: ASSISTANT, roomKey: '', profile: '', model: '', organizationId: '' });
    });

    it('resolves a direct chat profile from its profile-only subscription row', async () => {
        mockedBotsService.getBotIdentity.mockImplementation(async (userId) => (
            String(userId) === ASSISTANT ? { id: ASSISTANT, name: 'Assistant' } : null
        ));
        mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([{ botUserId: ASSISTANT, profile: 'cloud-big' }]);
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'direct:user-human:user-bot-a', participants: [HUMAN, ASSISTANT] };
        expect(await resolveAssistantTarget({ kind: 'direct', conversationKey: 'direct:user-human:user-bot-a', participants: [HUMAN, ASSISTANT] }, message))
            .toEqual({ assistantId: ASSISTANT, roomKey: 'direct:user-human:user-bot-a', profile: 'cloud-big', model: '', organizationId: '' });
    });

    it('stays silent when both direct participants are bots', async () => {
        mockedBotsService.getBotIdentity.mockImplementation(async (userId) => ({ id: String(userId), name: 'Bot' }));
        const message = { sender: 'user', senderUserId: ASSISTANT, participants: [ASSISTANT, ASSISTANT_B] };
        expect(await resolveAssistantTarget({ kind: 'direct', participants: [ASSISTANT, ASSISTANT_B] }, message)).toBeNull();
    });

    it('stays silent when no direct participant is the assistant', async () => {
        const message = { sender: 'user', senderUserId: HUMAN, participants: [HUMAN, HUMAN_B] };
        expect(await resolveAssistantTarget({ kind: 'direct', participants: [HUMAN, HUMAN_B] }, message)).toBeNull();
    });

    it('carries the conversation model override beside the profile', async () => {
        mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([
            { botUserId: ASSISTANT, conversationKey: 'group:g1', profile: 'cloud-big', model: 'qwen3:30b-a3b' }
        ]);
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'group:g1', participants: [HUMAN, ASSISTANT] };
        expect(await resolveAssistantTarget({ kind: 'group', conversationKey: 'group:g1', participants: [HUMAN, ASSISTANT] }, message))
            .toEqual({ assistantId: ASSISTANT, roomKey: 'group:g1', profile: 'cloud-big', model: 'qwen3:30b-a3b', organizationId: '' });
    });

    it('triggers the subscribed AI in group chats, carrying the conversation profile', async () => {
        mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([{ botUserId: ASSISTANT, conversationKey: 'group:g', profile: 'cloud-big' }]);
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'group:g', participants: [HUMAN, ASSISTANT] };
        expect(await resolveAssistantTarget({ kind: 'group', conversationKey: 'group:g', participants: [HUMAN, ASSISTANT] }, message))
            .toEqual({ assistantId: ASSISTANT, roomKey: 'group:g', profile: 'cloud-big', model: '', organizationId: '' });
    });

    it('requires the assistant\'s participants entry in group rooms', async () => {
        mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([{ botUserId: ASSISTANT, conversationKey: 'group:g' }]);
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'group:g', participants: [HUMAN, HUMAN_B] };
        expect(await resolveAssistantTarget({ kind: 'group', conversationKey: 'group:g', participants: [HUMAN, HUMAN_B] }, message)).toBeNull();
    });

    it('wakes a two-participant assistant room on every message (its own person-style thread)', async () => {
        mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([{ botUserId: ASSISTANT, conversationKey: 'group:g' }]);
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'group:g', message: 'no mention needed', participants: [HUMAN, ASSISTANT] };
        expect(await resolveAssistantTarget({ kind: 'group', conversationKey: 'group:g', participants: [HUMAN, ASSISTANT] }, message))
            .toEqual({ assistantId: ASSISTANT, roomKey: 'group:g', profile: '', model: '', organizationId: '' });
    });

    it('wakes a multi-human group room only when the message names the assistant', async () => {
        mockedBotsService.getBotIdentity.mockImplementation(async (userId) => (
            String(userId) === ASSISTANT ? { id: ASSISTANT, name: 'Assistant' } : null
        ));
        mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([{ botUserId: ASSISTANT, conversationKey: 'group:g' }]);
        const context = { kind: 'group', conversationKey: 'group:g', participants: [HUMAN, HUMAN_B, ASSISTANT] };
        const message = (text) => ({
            sender: 'user', senderUserId: HUMAN, conversationKey: 'group:g', message: text,
            participants: [HUMAN, HUMAN_B, ASSISTANT]
        });
        expect(await resolveAssistantTarget(context, message('plain traffic'))).toBeNull();
        expect(await resolveAssistantTarget(context, message('@assistant, please'))).toEqual({
            assistantId: ASSISTANT, roomKey: 'group:g', profile: '', model: '', organizationId: ''
        });
        expect((await resolveAssistantTarget(context, message('hey @Assistant!'))).roomKey).toBe('group:g');
        // A word boundary, not a prefix: '@Assistantx' is not an address.
        expect(await resolveAssistantTarget(context, message('@Assistantx says hi'))).toBeNull();
    });

    it('wakes instance rooms only when the message names the assistant', async () => {
        mockedBotsService.getBotIdentity.mockImplementation(async (userId) => (
            String(userId) === ASSISTANT ? { id: ASSISTANT, name: 'Assistant' } : null
        ));
        mockedBotRepository.findSubscriptionsByConversation.mockResolvedValue([{ botUserId: ASSISTANT, conversationKey: 'instance:cassette:c1' }]);
        const context = { kind: 'instance', conversationKey: 'instance:cassette:c1' };
        const base = { sender: 'user', senderUserId: HUMAN, conversationKey: 'instance:cassette:c1' };
        expect(await resolveAssistantTarget(context, { ...base, message: 'plain traffic' })).toBeNull();
        expect(await resolveAssistantTarget(context, { ...base, message: '@Assistant check this' })).toEqual({
            assistantId: ASSISTANT, roomKey: 'instance:cassette:c1', profile: '', model: '', organizationId: ''
        });
    });

    it('triggers through a subscription on any ancestor of the message path', async () => {
        mockedBotsService.getBotIdentity.mockImplementation(async (userId) => (
            String(userId) === ASSISTANT ? { id: ASSISTANT, name: 'Assistant' } : null
        ));
        mockedBotRepository.findSubscriptionsByConversation.mockImplementation(async (keys) => (
            keys.includes('instance:project:p1') ? [{ botUserId: ASSISTANT, conversationKey: 'instance:project:p1' }] : []
        ));
        const context = { kind: 'instance', conversationKey: 'instance:cassette:c1' };
        const message = {
            sender: 'user',
            senderUserId: HUMAN,
            conversationKey: 'instance:cassette:c1',
            message: '@Assistant the nesting is done',
            instancePath: [
                { type: 'organization', id: 'org-1' },
                { type: 'project', id: 'p1' },
                { type: 'cassette', id: 'c1' }
            ]
        };
        expect(await resolveAssistantTarget(context, message))
            .toEqual({ assistantId: ASSISTANT, roomKey: 'instance:project:p1', profile: '', model: '', organizationId: '' });
    });

    it('prefers the message\'s own room over a subscribed ancestor (deterministic pin)', async () => {
        mockedBotsService.getBotIdentity.mockImplementation(async (userId) => (
            String(userId) === ASSISTANT ? { id: ASSISTANT, name: 'Assistant' } : null
        ));
        mockedBotRepository.findSubscriptionsByConversation.mockImplementation(async (keys) => [
            ...(keys.includes('instance:organization:org-1') ? [{ botUserId: ASSISTANT, conversationKey: 'instance:organization:org-1', profile: 'org-pin' }] : []),
            ...(keys.includes('instance:cassette:c1') ? [{ botUserId: ASSISTANT, conversationKey: 'instance:cassette:c1', profile: 'own-pin' }] : [])
        ]);
        const message = {
            sender: 'user',
            senderUserId: HUMAN,
            conversationKey: 'instance:cassette:c1',
            message: '@Assistant',
            instancePath: [{ type: 'organization', id: 'org-1' }, { type: 'cassette', id: 'c1' }]
        };
        expect(await resolveAssistantTarget({ kind: 'instance', conversationKey: 'instance:cassette:c1' }, message))
            .toEqual({ assistantId: ASSISTANT, roomKey: 'instance:cassette:c1', profile: 'own-pin', model: '', organizationId: '' });
    });
});

describe('runAssistantReply', () => {
    const context = { kind: 'direct', conversationKey: `direct:${HUMAN}:${ASSISTANT}`, participants: [HUMAN, ASSISTANT] };
    const message = { sender: 'user', senderUserId: HUMAN, participants: [HUMAN, ASSISTANT], conversationKey: context.conversationKey };
    const target = { assistantId: ASSISTANT, roomKey: context.conversationKey, profile: 'cloud-big', model: '', organizationId: '' };

    it('replies that the provider is unconfigured instead of staying silent', async () => {
        mockedLlm.isLlmAvailable.mockResolvedValue(false);
        await runAssistantReply(target, context, message);
        expect(mockedLlm.chatCompletion).not.toHaveBeenCalled();
        expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(1);
        const body = mockedSupport.sendUserMessage.mock.calls[0][1];
        expect(body.message).toMatch(/not configured/i);
        expect(body.notice).toBe('warn');
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

    it('persists the tool call detail on the chronology step', async () => {
        mockedLlm.chatCompletion
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ id: 'c1', name: 'run_action', arguments: { actionId: 'rename' } }]
            })
            .mockResolvedValueOnce({ content: 'done', toolCalls: [] });
        mockedTools.executeTool.mockResolvedValue({});
        await runAssistantReply(target, context, message);
        const sent = mockedSupport.sendUserMessage.mock.calls.at(-1)[1];
        expect(sent.agent.steps).toContainEqual({ kind: 'tool', id: 'c1', name: 'run_action', status: 'done', detail: 'rename' });
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
        expect(mockedTools.executeTool).toHaveBeenCalledWith('list_types', { x: 1 }, humanAuth, { conversationKey: context.conversationKey, ask: expect.any(Function), instanceRefs: [] });
        const toolMessage = mockedLlm.chatCompletion.mock.calls[1][0].messages.find((entry) => entry.role === 'tool');
        expect(toolMessage.toolCallId).toBe('call-1');
        expect(toolMessage.name).toBe('list_types');
        expect(JSON.parse(toolMessage.content)).toEqual({ types: [] });
        expect(mockedSupport.sendUserMessage.mock.calls[0][1].message).toBe('done');
    });

    it('rides chat-run attached instance refs on the final reply', async () => {        const ref = { type: 'cassette', id: 'c1', label: 'Cassette c1' };
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
        const [sendAuth, body, options] = mockedSupport.sendUserMessage.mock.calls[0];
        expect(body.message).toBe('attached');
        expect(body.instanceRefs).toEqual([ref]);
        // The reply is attributed to the assistant, but its refs validate
        // under the delegating user's rights at persistence.
        expect(sendAuth.userId).toBe(ASSISTANT);
        expect(options?.refsAuth?.userId).toBe(HUMAN);
    });

    it('a dead provider keeps the run chronology on the failure notice', async () => {
        mockedLlm.chatCompletion
            .mockRejectedValueOnce(new Error('provider exploded'));
        await runAssistantReply(target, context, message);
        expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(1);
        const body = mockedSupport.sendUserMessage.mock.calls[0][1];
        expect(body.message).toMatch(/failed to answer/i);
        expect(body.notice).toBe('error');
        expect(Array.isArray(body.agent?.steps)).toBe(true);
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

    it('coalesces concurrent triggers into one trailing run with a fresh history snapshot', async () => {
        mockedLlm.chatCompletion.mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { content: 'one', toolCalls: [] };
        });
        const late = { ...message, message: 'and this follows mid-run' };
        const first = runAssistantReply(target, context, message);
        await vi.waitFor(() => expect(mockedLlm.chatCompletion).toHaveBeenCalledTimes(1));
        // The second message lands mid-run: it must not be dropped.
        const second = runAssistantReply(target, context, late);
        await Promise.all([first, second]);
        await vi.waitFor(() => expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(2));
        // The trailing run re-snapshots the room's history instead of
        // answering from the stale start-of-run context.
        expect(mockedSupport.listMessages).toHaveBeenCalledTimes(2);
    });

    it('stays silent when the sender is from another organization than the subscription', async () => {
        mockedBotsService.buildPrincipalAuth.mockImplementation(async (userId) => {
            if (String(userId) === ASSISTANT) return { ...assistantAuth };
            return { ...humanAuth, organizationId: 'org-2' };
        });
        await runAssistantReply({ ...target, organizationId: 'org-1' }, context, message);
        expect(mockedLlm.chatCompletion).not.toHaveBeenCalled();
        expect(mockedSupport.sendUserMessage).not.toHaveBeenCalled();
    });

    it('publishes the run\'s presence onto every view the trigger message fans out to', async () => {
        mockedBotsService.getBotIdentity.mockImplementation(async (userId) => (
            String(userId) === ASSISTANT ? { id: ASSISTANT, name: 'Assistant' } : null
        ));
        mockedLlm.chatCompletion.mockResolvedValue({ content: 'the org-wide answer', toolCalls: [] });
        const instanceContext = { kind: 'instance', conversationKey: 'instance:cassette:c1' };
        const instanceMessage = {
            sender: 'user',
            senderUserId: HUMAN,
            conversationKey: 'instance:cassette:c1',
            message: '@Assistant status?',
            instancePath: [{ type: 'organization', id: 'org-1' }, { type: 'cassette', id: 'c1' }]
        };
        await runAssistantReply(
            { assistantId: ASSISTANT, roomKey: 'instance:organization:org-1', profile: '', model: '', organizationId: 'org-1' },
            instanceContext,
            instanceMessage
        );
        const topics = mockedConnections.publish.mock.calls.map(([topic]) => topic);
        expect(topics).toContain('conversation:instance:cassette:c1');
        expect(topics).toContain('conversation:instance:organization:org-1');
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

    it('shares the in-flight lock with chat replies, deferring until the room is free', async () => {
        mockedLlm.chatCompletion.mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { content: 'one', toolCalls: [] };
        });
        mockedSupport.listMessages.mockResolvedValue([]);
        const context = { kind: 'group', conversationKey: 'group:g1', participants: [HUMAN, ASSISTANT] };
        const message = { sender: 'user', senderUserId: HUMAN, conversationKey: 'group:g1', participants: [HUMAN, ASSISTANT] };
        const reply = runAssistantReply({ assistantId: ASSISTANT, roomKey: 'group:g1', profile: '', model: '', organizationId: '' }, context, message);
        // The wake lands while the reply is in flight: it never overlaps it.
        await runAssistantWake({ botUserId: ASSISTANT, conversationKey: 'group:g1', organizationId: 'org-1' }, wakeEvent, rule);
        expect(mockedSupport.sendUserMessage).not.toHaveBeenCalled();
        await reply;
        // The room free, the deferred wake runs and posts beside the reply.
        await vi.waitFor(() => expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(2));
        expect(mockedSupport.sendUserMessage.mock.calls[0][1].message).toBe('one');
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

    it('stops an ancestor-subscribed run from the subscribed room\'s key', async () => {
        let seenSignal = null;
        let releaseStream;
        const held = new Promise(resolve => { releaseStream = resolve; });
        mockedLlm.streamChatCompletion.mockImplementationOnce(async function* (args) {
            seenSignal = args.signal;
            yield { type: 'text', text: 'Half' };
            await held;
            throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        });
        const message = {
            sender: 'user',
            senderUserId: HUMAN,
            conversationKey: 'instance:cassette:c1',
            message: '@Assistant',
            instancePath: [{ type: 'organization', id: 'org-1' }, { type: 'cassette', id: 'c1' }]
        };
        const run = runAssistantReply(
            { assistantId: ASSISTANT, roomKey: 'instance:organization:org-1', profile: '', model: '', organizationId: 'org-1' },
            { kind: 'instance', conversationKey: 'instance:cassette:c1' },
            message
        );
        await vi.waitFor(() => expect(seenSignal).toBeTruthy());
        // The stop arrives from the organization chat view, not the child
        // instance view the message landed on.
        expect(stopConversationRuns('org-1', 'instance:organization:org-1')).toBe(1);
        expect(seenSignal.aborted).toBe(true);
        releaseStream();
        await run;
        expect(mockedSupport.sendUserMessage.mock.calls[0][1].message).toBe('Half');
    });
});

describe('ask_user — suspended questions', () => {
    const context = { kind: 'direct', conversationKey: `direct:${HUMAN}:${ASSISTANT}`, participants: [HUMAN, ASSISTANT] };
    const message = { sender: 'user', senderUserId: HUMAN, participants: [HUMAN, ASSISTANT], conversationKey: context.conversationKey };
    const target = { assistantId: ASSISTANT, roomKey: context.conversationKey, profile: '', model: '', organizationId: '' };

    it('consumes the next capability-holding message as the answer and never fires a second run', async () => {
        mockedLlm.chatCompletion
            .mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'a1', name: 'ask_user', arguments: { question: 'Map archived to?' } }] })
            .mockResolvedValueOnce({ content: 'mapped, done', toolCalls: [] });
        mockedTools.executeTool.mockImplementation(async (name, args, auth, run) => {
            if (name !== 'ask_user') return {};
            return { answer: await run.ask(args.question, ['done', 'legacy']) };
        });
        const run = runAssistantReply(target, context, message);
        await vi.waitFor(() => expect(mockedLlm.chatCompletion).toHaveBeenCalledTimes(1));
        // The question card publishes onto the conversation topic.
        await vi.waitFor(() => expect(mockedConnections.publish).toHaveBeenCalledWith(
            `conversation:${context.conversationKey}`,
            expect.objectContaining({ type: 'bot_question', question: 'Map archived to?' })
        ));
        // The room answers: the message steers the suspended run.
        handleMessageInserted(context, { ...message, message: 'done' });
        await run;
        // The user's answer is the tool result the model saw.
        const toolMessage = mockedLlm.chatCompletion.mock.calls[1][0].messages.find(entry => entry.role === 'tool');
        expect(JSON.parse(toolMessage.content)).toEqual({ answer: 'done' });
        // Exactly one reply: the answer message never triggered a second run.
        expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(1);
        expect(mockedSupport.sendUserMessage.mock.calls[0][1].message).toBe('mapped, done');
        expect(mockedConnections.publish).toHaveBeenCalledWith(
            `conversation:${context.conversationKey}`,
            expect.objectContaining({ type: 'bot_question_end' })
        );
    });

    it('a sender without the agent-chat capability cannot answer; their message takes the normal trigger path', async () => {
        mockedBotsService.buildPrincipalAuth.mockImplementation(async (userId) => {
            if (String(userId) === HUMAN) return { ...humanAuth };
            if (String(userId) === HUMAN_B) return { ...humanAuth, userId: HUMAN_B, name: 'Other Human' };
            if (String(userId) === ASSISTANT) return { ...assistantAuth };
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        });
        mockedLlm.chatCompletion
            .mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'a1', name: 'ask_user', arguments: { question: 'Which?' } }] })
            .mockResolvedValue({ content: 'after', toolCalls: [] });
        mockedTools.executeTool.mockImplementation(async (name, args, auth, run) => (
            name === 'ask_user' ? { answer: await run.ask(args.question, []) } : {}
        ));
        const run = runAssistantReply(target, context, message);
        await vi.waitFor(() => expect(mockedLlm.chatCompletion).toHaveBeenCalledTimes(1));
        // The capability-less member's message is not consumed as an answer:
        // it falls through to the trigger (coalesced behind the live run).
        mockedOrganizations.canUseAgentChats.mockResolvedValueOnce(false);
        handleMessageInserted(context, { ...message, senderUserId: HUMAN_B, message: 'let me answer' });
        await vi.waitFor(() => expect(mockedOrganizations.canUseAgentChats).toHaveBeenCalledTimes(1));
        // A capability-holding answer then resolves the question.
        handleMessageInserted(context, { ...message, message: 'legacy' });
        await run;
        const toolMessage = mockedLlm.chatCompletion.mock.calls[1][0].messages.find(entry => entry.role === 'tool');
        expect(JSON.parse(toolMessage.content)).toEqual({ answer: 'legacy' });
        // The coalesced trailing run (the capability-less message) follows.
        await vi.waitFor(() => expect(mockedSupport.sendUserMessage).toHaveBeenCalledTimes(2));
        // Drain the trailing run before the next suite inherits its mocks.
        await new Promise(resolve => setTimeout(resolve, 30));
    });

    it('stop ends the question with the run and stays silent', async () => {
        mockedLlm.chatCompletion.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'a1', name: 'ask_user', arguments: { question: 'Which?' } }] });
        mockedTools.executeTool.mockImplementation(async (name, args, auth, run) => (
            name === 'ask_user' ? { answer: await run.ask(args.question, []) } : {}
        ));
        mockedLlm.streamChatCompletion.mockImplementationOnce(async function* () {
            yield { type: 'message', content: '', thinking: '', toolCalls: [{ id: 'a1', name: 'ask_user', arguments: { question: 'Which?' } }] };
        }).mockImplementationOnce(async function* (args) {
            if (args?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
            yield { type: 'message', content: '', thinking: '', toolCalls: [] };
        });
        const run = runAssistantReply(target, context, message);
        await vi.waitFor(() => expect(mockedTools.executeTool).toHaveBeenCalled());
        expect(stopConversationRuns('org-1', context.conversationKey)).toBe(1);
        await run;
        expect(mockedSupport.sendUserMessage).not.toHaveBeenCalled();
        expect(mockedConnections.publish).toHaveBeenCalledWith(
            `conversation:${context.conversationKey}`,
            expect.objectContaining({ type: 'bot_question_end' })
        );
        // A later message in the room takes the normal path again.
        expect(mockedOrganizations.canUseAgentChats).toHaveBeenCalledTimes(1);
    });
});

describe('identical-call loop protection', () => {
    const context = { kind: 'direct', conversationKey: `direct:${HUMAN}:${ASSISTANT}`, participants: [HUMAN, ASSISTANT] };
    const message = { sender: 'user', senderUserId: HUMAN, participants: [HUMAN, ASSISTANT], conversationKey: context.conversationKey };
    const target = { assistantId: ASSISTANT, roomKey: context.conversationKey, profile: '', model: '', organizationId: '' };

    it('blocks a third identical call and lets a changed one through', async () => {
        const failingCall = { id: 'c0', name: 'edit_process_definition', arguments: { definitionId: 'd1', steps: [{ op: 'connect' }] } };
        const rounds = [
            { content: '', toolCalls: [failingCall] },
            { content: '', toolCalls: [{ ...failingCall, id: 'c1' }] },
            { content: '', toolCalls: [{ ...failingCall, id: 'c2' }] },
            { content: '', toolCalls: [{ id: 'c3', name: 'edit_process_definition', arguments: { definitionId: 'd1', steps: [{ op: 'drop' }] } }] },
            { content: 'recovered', toolCalls: [] }
        ];
        mockedLlm.chatCompletion.mockImplementation(async () => rounds.shift());
        // Earlier suites may have left one-shot stream implementations
        // queued; this test owns the whole stream.
        mockedLlm.streamChatCompletion.mockReset();
        mockedLlm.streamChatCompletion.mockImplementation(async function* (args) {
            const message = await mockedLlm.chatCompletion(args);
            yield { type: 'message', content: message?.content || '', thinking: '', toolCalls: message?.toolCalls || [] };
        });
        mockedTools.executeTool.mockRejectedValue(new Error('Unknown port'));
        await runAssistantReply(target, context, message);
        // The two first identical attempts executed; the third was blocked
        // before execution with the repetition notice as its tool result.
        const editCalls = mockedTools.executeTool.mock.calls.filter(call => call[0] === 'edit_process_definition');
        expect(editCalls.map(call => JSON.stringify(call[1]))).toEqual([
            '{"definitionId":"d1","steps":[{"op":"connect"}]}',
            '{"definitionId":"d1","steps":[{"op":"connect"}]}',
            '{"definitionId":"d1","steps":[{"op":"drop"}]}'
        ]);
        const toolMessages = mockedLlm.chatCompletion.mock.calls
            .flatMap(call => call[0].messages || [])
            .filter(entry => entry.role === 'tool' && entry.toolCallId === 'c2');
        expect(JSON.parse(toolMessages.at(-1).content).error).toMatch(/already made and failed twice/);
        const sent = mockedSupport.sendUserMessage.mock.calls.at(-1)[1];
        expect(sent.message).toBe('recovered');
        // The blocked step rides the chronology as a marked failure.
        expect(sent.agent.steps.some(step => step.kind === 'tool' && step.status === 'error' && /failed twice/.test(step.error))).toBe(true);
    });
});
