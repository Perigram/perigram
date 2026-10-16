import { describe, it, expect, beforeEach, vi } from 'vitest';

// The AI contact contract's failure modes, pinned: the org assistant is
// idempotent (deterministic address, no duplicate on collision), the
// agent-chat capability gates every surface (no capability, no AI row),
// conversation decoration rides admission, direct keys are served
// through profile-only rows, and group joins use the participant-gated
// bot seam — never the human membership gate. Wake rules carry their
// author (the delegation principal when they fire).

const { mockedUsers, mockedSupport, mockedRepository, mockedOrganizations, mockedOrganizationsService, mockedProcessDefinitions, mockedLlm } = vi.hoisted(() => ({
    mockedUsers: {
        getById: vi.fn(),
        findUserByEmail: vi.fn(),
        registerBot: vi.fn(),
        buildAuthContext: vi.fn()
    },
    mockedSupport: {
        getConversationContextByKey: vi.fn(),
        addBotGroupParticipant: vi.fn(),
        removeBotGroupParticipant: vi.fn()
    },
    mockedRepository: {
        upsertSubscription: vi.fn(),
        removeSubscription: vi.fn(),
        findSubscriptionsByConversation: vi.fn()
    },
    mockedOrganizations: { findById: vi.fn() },
    mockedOrganizationsService: { canUseAgentChats: vi.fn() },
    mockedProcessDefinitions: { listActiveWorkflowStates: vi.fn() },
    mockedLlm: {
        chatProfileIds: vi.fn(async () => []),
        chatProfiles: vi.fn(async () => []),
        chatModels: vi.fn(async () => []),
        resolveLlmConfig: vi.fn(async () => ({ provider: 'none' }))
    }
}));

vi.mock('~/server/features/users/service.js', () => mockedUsers);
vi.mock('~/server/features/support/service.js', () => mockedSupport);
vi.mock('~/server/features/organizations/repository.js', () => mockedOrganizations);
vi.mock('~/server/features/organizations/service.js', () => mockedOrganizationsService);
vi.mock('~/server/features/process-definitions/service.js', () => mockedProcessDefinitions);
vi.mock('~/server/features/llm/service.js', () => mockedLlm);
vi.mock('~/server/features/process-definitions/runtime.js', () => ({ resolveProcessAuth: vi.fn(async (auth) => auth) }));
vi.mock('./repository.js', () => mockedRepository);
vi.mock('h3', () => ({
    createError: vi.fn((err) => {
        const error = new Error(err.message);
        error.statusCode = err.statusCode;
        return error;
    })
}));

import { ensureOrganizationAssistant, listAssistantContact, subscribeAssistant, unsubscribeAssistant, listWakeOptions, buildPrincipalAuth } from './service.js';

const AUTH = { userId: 'user-human', organizationId: 'org-1' };

const botModel = (id, name) => ({
    id,
    data: { bot: { createdAt: new Date() } },
    toJSON: () => ({
        _id: id,
        identity: { name },
        data: { bot: { createdAt: new Date() } }
    })
});

const humanModel = (id, name) => ({
    id,
    data: {},
    toJSON: () => ({ _id: id, identity: { name }, data: {} })
});

const ASSISTANT = botModel('bot-a', 'Assistant');

beforeEach(() => {
    vi.clearAllMocks();
    mockedOrganizationsService.canUseAgentChats.mockResolvedValue(true);
    mockedRepository.findSubscriptionsByConversation.mockResolvedValue([]);
});

describe('ensureOrganizationAssistant', () => {
    it('creates the assistant once through the deterministic address', async () => {
        const created = botModel('bot-1', 'Assistant');
        mockedUsers.findUserByEmail
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(created);
        mockedUsers.registerBot.mockResolvedValue({ user: created });
        const first = await ensureOrganizationAssistant('org-1');
        expect(mockedUsers.registerBot).toHaveBeenCalledWith({
            name: 'Assistant',
            organizationId: 'org-1',
            email: 'assistant-org-1@bots.perigram.internal'
        });
        const second = await ensureOrganizationAssistant('org-1');
        expect(mockedUsers.registerBot).toHaveBeenCalledTimes(1);
        expect(second).toBe(first);
    });

    it('reuses the existing assistant without registering', async () => {
        mockedUsers.findUserByEmail.mockResolvedValue(botModel('bot-1', 'Assistant'));
        await ensureOrganizationAssistant('org-1');
        expect(mockedUsers.registerBot).not.toHaveBeenCalled();
    });

    it('resolves the concurrent-bootstrap 409 to the winner', async () => {
        mockedUsers.findUserByEmail
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(botModel('bot-9', 'Assistant'));
        mockedUsers.registerBot.mockRejectedValueOnce(
            Object.assign(new Error('Bot identity collision, retry'), { statusCode: 409 })
        );
        const winner = await ensureOrganizationAssistant('org-1');
        expect(winner.id).toBe('bot-9');
    });
});

describe('listAssistantContact', () => {
    it('returns no AI without an organization or the capability', async () => {
        await expect(listAssistantContact({ userId: 'u' })).resolves.toEqual({ canChat: false, assistant: null, chatProfiles: [], chatModels: [] });

        mockedOrganizationsService.canUseAgentChats.mockResolvedValue(false);
        await expect(listAssistantContact(AUTH)).resolves.toMatchObject({ canChat: false, assistant: null });
        expect(mockedUsers.findUserByEmail).not.toHaveBeenCalled();
    });

    it('serves the ensured assistant row', async () => {
        mockedUsers.findUserByEmail.mockResolvedValue(ASSISTANT);
        const result = await listAssistantContact(AUTH);
        expect(result.canChat).toBe(true);
        expect(result.assistant).toMatchObject({ id: 'bot-a', name: 'Assistant', subscribed: false, wakeOn: [] });
    });

    it('decorates the row with the conversation subscription and serves direct keys', async () => {
        mockedUsers.findUserByEmail.mockResolvedValue(ASSISTANT);
        mockedSupport.getConversationContextByKey.mockResolvedValue({
            kind: 'group', conversationKey: 'group:g1', groupId: 'g1'
        });
        mockedRepository.findSubscriptionsByConversation.mockResolvedValue([
            { botUserId: 'bot-a', wakeOn: [{ type: 'queue', state: 'nested', createdBy: 'user-human' }] }
        ]);
        const result = await listAssistantContact(AUTH, 'group:g1');
        expect(result.assistant).toMatchObject({
            subscribed: true,
            wakeOn: [{ type: 'queue', state: 'nested', createdBy: 'user-human' }]
        });

        mockedSupport.getConversationContextByKey.mockResolvedValue({ kind: 'direct', conversationKey: 'direct:a:b' });
        // Direct keys are the same execution point through a profile-only
        // row: they decorate instead of rejecting (no membership semantics).
        await expect(listAssistantContact(AUTH, 'direct:a:b')).resolves.toMatchObject({
            assistant: { id: 'bot-a', subscribed: true, wakeOn: [{ type: 'queue', state: 'nested', createdBy: 'user-human' }] }
        });
    });

    it('exposes chat profiles with their models beside the AI row', async () => {
        mockedUsers.findUserByEmail.mockResolvedValue(ASSISTANT);
        mockedLlm.chatProfiles.mockResolvedValue([
            { id: 'cloud-big', model: 'glm-4.7' },
            { id: 'local-fast', model: 'qwen3:30b-a3b' }
        ]);
        mockedLlm.chatModels.mockResolvedValue([
            { profile: 'local-fast', model: 'qwen3:4b' },
            { profile: 'local-fast', model: 'qwen3:30b-a3b' }
        ]);
        const result = await listAssistantContact(AUTH);
        expect(result.chatProfiles).toEqual([
            { id: 'cloud-big', model: 'glm-4.7' },
            { id: 'local-fast', model: 'qwen3:30b-a3b' }
        ]);
        expect(result.chatModels).toEqual([
            { profile: 'local-fast', model: 'qwen3:4b' },
            { profile: 'local-fast', model: 'qwen3:30b-a3b' }
        ]);
    });
});

describe('subscribeAssistant', () => {
    it('refuses members without the agent-chat capability', async () => {
        mockedOrganizationsService.canUseAgentChats.mockResolvedValue(false);
        await expect(subscribeAssistant(AUTH, { conversationKey: 'group:g1' }))
            .rejects.toMatchObject({ statusCode: 403 });
    });

    it('joins groups through the participant-gated bot seam, authoring wake rules to the caller', async () => {
        mockedUsers.findUserByEmail.mockResolvedValue(ASSISTANT);
        mockedSupport.getConversationContextByKey.mockResolvedValue({
            kind: 'group', conversationKey: 'group:g1', groupId: 'g1'
        });
        mockedSupport.addBotGroupParticipant.mockResolvedValue({});
        const result = await subscribeAssistant(AUTH, {
            conversationKey: 'group:g1',
            wakeOn: [{ type: 'queue', state: 'nested' }]
        });
        expect(mockedSupport.addBotGroupParticipant).toHaveBeenCalledWith(AUTH, 'g1', 'bot-a');
        expect(mockedRepository.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
            botUserId: 'bot-a',
            conversationKey: 'group:g1',
            wakeOn: [{ type: 'queue', state: 'nested', createdBy: 'user-human' }]
        }));
        expect(result.subscribed).toBe(true);
    });

    it('stores a profile-only row for a direct chat with the assistant participant', async () => {
        mockedUsers.getById.mockImplementation(async (id) => (String(id) === 'bot-a' ? ASSISTANT : null));
        mockedSupport.getConversationContextByKey.mockResolvedValue({
            kind: 'direct', conversationKey: 'direct:user-human:bot-a', participants: ['user-human', 'bot-a']
        });
        mockedLlm.chatProfileIds.mockResolvedValue(['cloud-big']);
        const result = await subscribeAssistant(AUTH, {
            conversationKey: 'direct:user-human:bot-a', profile: 'cloud-big'
        });
        expect(mockedSupport.addBotGroupParticipant).not.toHaveBeenCalled();
        expect(mockedRepository.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
            botUserId: 'bot-a',
            conversationKey: 'direct:user-human:bot-a',
            conversationKind: 'direct',
            profile: 'cloud-big'
        }));
        expect(result.subscribed).toBe(true);
        await expect(subscribeAssistant(AUTH, {
            conversationKey: 'direct:user-human:bot-a', wakeOn: [{ type: 'queue', state: 'nested' }]
        })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('refuses direct chats whose only bot participant is gone', async () => {
        mockedUsers.getById.mockImplementation(async (id) => (String(id) === 'bot-x' ? humanModel('bot-x', 'Not a bot') : null));
        mockedSupport.getConversationContextByKey.mockResolvedValue({
            kind: 'direct', conversationKey: 'direct:user-human:bot-x', participants: ['user-human', 'bot-x']
        });
        await expect(subscribeAssistant(AUTH, { conversationKey: 'direct:user-human:bot-x' }))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    it('validates the conversation and rule model overrides', async () => {
        mockedUsers.findUserByEmail.mockResolvedValue(ASSISTANT);
        mockedSupport.getConversationContextByKey.mockResolvedValue({
            kind: 'group', conversationKey: 'group:g1', groupId: 'g1'
        });
        mockedSupport.addBotGroupParticipant.mockResolvedValue({});
        mockedLlm.chatProfileIds.mockResolvedValue(['cloud-big']);
        await expect(subscribeAssistant(AUTH, { conversationKey: 'group:g1', profile: 'nope' }))
            .rejects.toMatchObject({ statusCode: 400 });
        await expect(subscribeAssistant(AUTH, {
            conversationKey: 'group:g1',
            wakeOn: [{ type: 'queue', state: 'nested', profile: 'nope' }]
        })).rejects.toMatchObject({ statusCode: 400 });
        const result = await subscribeAssistant(AUTH, {
            conversationKey: 'group:g1', profile: 'cloud-big',
            wakeOn: [{ type: 'queue', state: 'nested', profile: 'cloud-big' }]
        });
        expect(result.profile).toBe('cloud-big');
        expect(mockedRepository.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
            profile: 'cloud-big',
            wakeOn: [{ type: 'queue', state: 'nested', profile: 'cloud-big', createdBy: 'user-human' }]
        }));
    });
});

describe('unsubscribeAssistant', () => {
    it('leaves groups through the participant-gated seam and drops the row', async () => {
        mockedUsers.findUserByEmail.mockResolvedValue(ASSISTANT);
        mockedSupport.getConversationContextByKey.mockResolvedValue({
            kind: 'group', conversationKey: 'group:g1', groupId: 'g1'
        });
        const result = await unsubscribeAssistant(AUTH, { conversationKey: 'group:g1' });
        expect(mockedSupport.removeBotGroupParticipant).toHaveBeenCalledWith(AUTH, 'g1', 'bot-a');
        expect(mockedRepository.removeSubscription).toHaveBeenCalledWith('bot-a', 'group:g1');
        expect(result.subscribed).toBe(false);
    });
});

describe('listWakeOptions', () => {
    it('is capability-gated and lists active workflow states', async () => {
        mockedProcessDefinitions.listActiveWorkflowStates.mockResolvedValue([{ typeId: 'queue', states: ['nested'] }]);
        await expect(listWakeOptions(AUTH)).resolves.toEqual([{ typeId: 'queue', states: ['nested'] }]);
        mockedOrganizationsService.canUseAgentChats.mockResolvedValue(false);
        await expect(listWakeOptions(AUTH)).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe('buildPrincipalAuth', () => {
    it('builds any member\'s request-shaped auth', async () => {
        const user = humanModel('user-human', 'Human');
        mockedUsers.getById.mockResolvedValue(user);
        mockedUsers.buildAuthContext.mockReturnValue({ userId: 'user-human', name: 'Human' });
        const auth = await buildPrincipalAuth('user-human');
        expect(mockedUsers.buildAuthContext).toHaveBeenCalledWith(user);
        expect(auth).toMatchObject({ userId: 'user-human', name: 'Human' });
    });

    it('throws 404 for a missing user', async () => {
        mockedUsers.getById.mockResolvedValue(null);
        await expect(buildPrincipalAuth('nobody')).rejects.toMatchObject({ statusCode: 404 });
    });
});
