import { describe, it, expect, beforeEach, vi } from 'vitest';

// The contacts contract's failure modes, pinned: the org assistant is
// idempotent (deterministic address, no duplicate on collision), member
// visibility needs no admin grants, conversation decoration rides
// admission, direct keys are refused, and group joins use the
// participant-gated bot seam — never the human membership gate.

const { mockedUsers, mockedSupport, mockedRepository, mockedOrganizations, mockedProcessAuth, mockedProcessDefinitions } = vi.hoisted(() => ({
    mockedUsers: {
        list: vi.fn(),
        getById: vi.fn(),
        findUserByEmail: vi.fn(),
        registerBot: vi.fn(),
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
    mockedProcessDefinitions: { listActiveWorkflowStates: vi.fn() }
}));

vi.mock('~/server/features/users/service.js', () => mockedUsers);
vi.mock('~/server/features/support/service.js', () => mockedSupport);
vi.mock('~/server/features/organizations/repository.js', () => mockedOrganizations);
vi.mock('~/server/features/process-definitions/service.js', () => mockedProcessDefinitions);
vi.mock('~/server/features/process-definitions/runtime.js', () => mockedProcessAuth);
vi.mock('./repository.js', () => mockedRepository);
vi.mock('h3', () => ({
    createError: vi.fn((err) => {
        const error = new Error(err.message);
        error.statusCode = err.statusCode;
        return error;
    })
}));

import { ensureOrganizationAssistant, listBotContacts, subscribeBot } from './service.js';

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

    it('decorates rows with the conversation subscription and refuses direct keys', async () => {
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

        mockedSupport.getConversationContextByKey.mockResolvedValue({ kind: 'direct' });
        await expect(listBotContacts(AUTH, 'direct:a:b')).rejects.toMatchObject({ statusCode: 400 });
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

    it('rejects non-bot targets', async () => {
        mockedUsers.getById.mockResolvedValue({ toJSON: () => ({ _id: 'u1', data: {} }) });
        await expect(subscribeBot(AUTH, { botId: 'u1', conversationKey: 'group:g1' }))
            .rejects.toMatchObject({ statusCode: 404 });
    });
});
