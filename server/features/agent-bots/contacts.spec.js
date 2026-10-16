import { describe, it, expect, beforeEach, vi } from 'vitest';

// The contacts contract's failure modes, pinned: the org assistant is
// idempotent (deterministic address, no duplicate on collision), member
// visibility needs no admin grants, conversation decoration rides
// admission, direct keys are refused, and group joins use the
// participant-gated bot seam — never the human membership gate.

const { mockedUsers, mockedSupport, mockedRepository, mockedOrganizations, mockedProcessAuth, mockedProcessDefinitions, mockedLlm } = vi.hoisted(() => ({
    mockedUsers: {
        list: vi.fn(),
        getById: vi.fn(),
        findUserByEmail: vi.fn(),
        registerBot: vi.fn(),
        updateBotProfile: vi.fn(),
        canManageUsersInOrganization: vi.fn()
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
    mockedProcessAuth: { resolveProcessAuth: vi.fn(async (auth) => auth) },
    mockedProcessDefinitions: { listActiveWorkflowStates: vi.fn() },
    mockedLlm: { chatProfileIds: vi.fn(async () => []), chatProfiles: vi.fn(async () => []) }
}));

vi.mock('~/server/features/users/service.js', () => mockedUsers);
vi.mock('~/server/features/support/service.js', () => mockedSupport);
vi.mock('~/server/features/organizations/repository.js', () => mockedOrganizations);
vi.mock('~/server/features/process-definitions/service.js', () => mockedProcessDefinitions);
vi.mock('~/server/features/llm/service.js', () => mockedLlm);
vi.mock('~/server/features/process-definitions/runtime.js', () => mockedProcessAuth);
vi.mock('./repository.js', () => mockedRepository);
vi.mock('h3', () => ({
    createError: vi.fn((err) => {
        const error = new Error(err.message);
        error.statusCode = err.statusCode;
        return error;
    })
}));

import { ensureOrganizationAssistant, listBotContacts, subscribeBot, setBotProfile } from './service.js';

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

beforeEach(() => {
    vi.clearAllMocks();
    mockedUsers.canManageUsersInOrganization.mockReturnValue(true);
    mockedRepository.findSubscriptionsByConversation.mockResolvedValue([]);
});

describe('ensureOrganizationAssistant', () => {
    it('creates the assistant once through the deterministic address', async () => {
        const created = botModel('bot-1', 'Assistant');
        mockedUsers.findUserByEmail
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(created);
        mockedUsers.registerBot.mockResolvedValue({ user: created, token: 'pb_x' });
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

describe('listBotContacts', () => {
    it('needs an organization and sorts the assistant first', async () => {
        await expect(listBotContacts({ userId: 'u' })).resolves.toEqual({ assistantId: null, contacts: [] });

        mockedUsers.findUserByEmail.mockResolvedValue(botModel('bot-a', 'Assistant'));
        mockedUsers.list.mockResolvedValue([
            botModel('bot-z', 'Zeta'),
            botModel('bot-a', 'Assistant'),
            humanModel('u1', 'Human')
        ]);
        const result = await listBotContacts(AUTH);
        expect(result.contacts.map(row => row.name)).toEqual(['Assistant', 'Zeta']);
        expect(result.contacts[0]).toMatchObject({ assistant: true, subscribed: false, wakeOn: [] });
        expect(result.contacts[1].assistant).toBe(false);
    });

    it('decorates rows with the conversation subscription and serves direct keys', async () => {
        mockedUsers.findUserByEmail.mockResolvedValue(botModel('bot-a', 'Assistant'));
        mockedUsers.list.mockResolvedValue([botModel('bot-a', 'Assistant')]);
        mockedSupport.getConversationContextByKey.mockResolvedValue({
            kind: 'group', conversationKey: 'group:g1', groupId: 'g1'
        });
        mockedRepository.findSubscriptionsByConversation.mockResolvedValue([
            { botUserId: 'bot-a', wakeOn: [{ type: 'queue', state: 'nested' }] }
        ]);
        const result = await listBotContacts(AUTH, 'group:g1');
        expect(result.contacts[0]).toMatchObject({
            subscribed: true,
            wakeOn: [{ type: 'queue', state: 'nested' }]
        });

        mockedSupport.getConversationContextByKey.mockResolvedValue({ kind: 'direct', conversationKey: 'direct:a:b' });
        // Direct keys are the same execution point through a profile-only
        // row: they decorate instead of rejecting (no membership semantics).
        await expect(listBotContacts(AUTH, 'direct:a:b')).resolves.toMatchObject({
            contacts: [{ id: 'bot-a', subscribed: true, wakeOn: [{ type: 'queue', state: 'nested' }] }]
        });
    });
});

describe('setBotProfile', () => {
    it('accepts a chat profile from the org model table and clears on empty', async () => {
        mockedUsers.getById.mockResolvedValue(botModel('bot-a', 'Assistant'));
        mockedUsers.updateBotProfile.mockResolvedValue({});
        mockedLlm.chatProfileIds.mockResolvedValue(['cloud-big']);
        await expect(setBotProfile(AUTH, 'bot-a', 'cloud-big')).resolves.toEqual({ id: 'bot-a', profile: 'cloud-big' });
        expect(mockedUsers.updateBotProfile).toHaveBeenCalledWith('bot-a', 'cloud-big');
        await expect(setBotProfile(AUTH, 'bot-a', '')).resolves.toEqual({ id: 'bot-a', profile: '' });
        expect(mockedUsers.updateBotProfile).toHaveBeenLastCalledWith('bot-a', '');
    });

    it('refuses unknown or non-chat profiles and non-bots', async () => {
        mockedLlm.chatProfileIds.mockResolvedValue(['cloud-big']);
        await expect(setBotProfile(AUTH, 'bot-a', 'images')).rejects.toMatchObject({ statusCode: 400 });
        mockedUsers.getById.mockResolvedValue(humanModel('u1', 'Human'));
        await expect(setBotProfile(AUTH, 'u1', 'cloud-big')).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('subscribeBot', () => {
    it('joins groups through the participant-gated bot seam', async () => {
        mockedUsers.getById.mockResolvedValue(botModel('bot-a', 'Assistant'));
        mockedSupport.getConversationContextByKey.mockResolvedValue({
            kind: 'group', conversationKey: 'group:g1', groupId: 'g1'
        });
        mockedSupport.addBotGroupParticipant.mockResolvedValue({});
        const result = await subscribeBot(AUTH, {
            botId: 'bot-a',
            conversationKey: 'group:g1',
            wakeOn: [{ type: 'queue', state: 'nested' }]
        });
        expect(mockedSupport.addBotGroupParticipant).toHaveBeenCalledWith(AUTH, 'g1', 'bot-a');
        expect(mockedRepository.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
            botUserId: 'bot-a',
            conversationKey: 'group:g1',
            wakeOn: [{ type: 'queue', state: 'nested' }]
        }));
        expect(result.subscribed).toBe(true);
    });

    it('stores a profile-only row for a direct chat with its bot participant', async () => {
        mockedUsers.getById.mockResolvedValue(botModel('bot-a', 'Assistant'));
        mockedSupport.getConversationContextByKey.mockResolvedValue({
            kind: 'direct', conversationKey: 'direct:user-human:bot-a', participants: ['user-human', 'bot-a']
        });
        mockedLlm.chatProfileIds.mockResolvedValue(['cloud-big']);
        const result = await subscribeBot(AUTH, {
            botId: 'bot-a', conversationKey: 'direct:user-human:bot-a', profile: 'cloud-big'
        });
        expect(mockedSupport.addBotGroupParticipant).not.toHaveBeenCalled();
        expect(mockedRepository.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
            botUserId: 'bot-a',
            conversationKey: 'direct:user-human:bot-a',
            conversationKind: 'direct',
            profile: 'cloud-big'
        }));
        expect(result.subscribed).toBe(true);
        await expect(subscribeBot(AUTH, {
            botId: 'bot-a', conversationKey: 'direct:user-human:bot-a', wakeOn: [{ type: 'queue', state: 'nested' }]
        })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('validates the conversation and rule model overrides', async () => {
        mockedUsers.getById.mockResolvedValue(botModel('bot-a', 'Assistant'));
        mockedSupport.getConversationContextByKey.mockResolvedValue({
            kind: 'group', conversationKey: 'group:g1', groupId: 'g1'
        });
        mockedSupport.addBotGroupParticipant.mockResolvedValue({});
        mockedLlm.chatProfileIds.mockResolvedValue(['cloud-big']);
        await expect(subscribeBot(AUTH, { botId: 'bot-a', conversationKey: 'group:g1', profile: 'nope' }))
            .rejects.toMatchObject({ statusCode: 400 });
        await expect(subscribeBot(AUTH, {
            botId: 'bot-a', conversationKey: 'group:g1',
            wakeOn: [{ type: 'queue', state: 'nested', profile: 'nope' }]
        })).rejects.toMatchObject({ statusCode: 400 });
        const result = await subscribeBot(AUTH, {
            botId: 'bot-a', conversationKey: 'group:g1', profile: 'cloud-big',
            wakeOn: [{ type: 'queue', state: 'nested', profile: 'cloud-big' }]
        });
        expect(result.profile).toBe('cloud-big');
        expect(mockedRepository.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
            profile: 'cloud-big',
            wakeOn: [{ type: 'queue', state: 'nested', profile: 'cloud-big' }]
        }));
    });

    it('exposes chat profiles with their models beside contact rows', async () => {
        mockedUsers.findUserByEmail.mockResolvedValue(botModel('bot-a', 'Assistant'));
        mockedUsers.list.mockResolvedValue([botModel('bot-a', 'Assistant')]);
        mockedLlm.chatProfiles.mockResolvedValue([
            { id: 'cloud-big', model: 'glm-4.7' },
            { id: 'local-fast', model: 'qwen3:30b-a3b' }
        ]);
        const result = await listBotContacts(AUTH);
        expect(result.chatProfiles).toEqual([
            { id: 'cloud-big', model: 'glm-4.7' },
            { id: 'local-fast', model: 'qwen3:30b-a3b' }
        ]);
    });

    it('rejects non-bot targets', async () => {
        mockedUsers.getById.mockResolvedValue({ toJSON: () => ({ _id: 'u1', data: {} }) });
        await expect(subscribeBot(AUTH, { botId: 'u1', conversationKey: 'group:g1' }))
            .rejects.toMatchObject({ statusCode: 404 });
    });
});
