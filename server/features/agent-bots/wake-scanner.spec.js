import { describe, it, expect, beforeEach, vi } from 'vitest';

// The wake scanner's failure modes and matching rules, pinned: creation
// events never wake, AI actors never wake (no self-perpetuating loops),
// intent transitions wake like plain ones, instance-scoped subscriptions
// match only their own instance, and the cursor advances to the batch end
// before anything fires (crash posture: drop the tail, never replay).

const { mockedSystemSettings, mockedStatesService, mockedBotRepository, mockedRuntime, mockedBotsService } = vi.hoisted(() => ({
    mockedSystemSettings: { get: vi.fn(), set: vi.fn() },
    mockedStatesService: { findStatusEventsAfter: vi.fn() },
    mockedBotRepository: { findWakeSubscriptions: vi.fn() },
    mockedRuntime: { runAssistantWake: vi.fn() },
    mockedBotsService: { isBotUser: vi.fn() }
}));

vi.mock('~/server/features/system-settings/service.js', () => mockedSystemSettings);
vi.mock('~/server/features/states/service.js', () => mockedStatesService);
vi.mock('./repository.js', () => mockedBotRepository);
vi.mock('./runtime.js', () => mockedRuntime);
vi.mock('./service.js', () => mockedBotsService);

import { scanStatusEventsForWakes } from './wake-scanner.js';

const BOT = 'user-bot-a';

const event = (overrides = {}) => ({
    _id: { toString: () => 'evt-1' },
    targetId: 'inst-1',
    targetType: 'queue',
    fromStatePrimary: 'approved',
    toStatePrimary: 'nested',
    operation: { kind: 'transition' },
    actor: { id: 'user-human', label: 'Human', principalType: 'user' },
    ...overrides
});

beforeEach(() => {
    vi.clearAllMocks();
    mockedSystemSettings.get.mockResolvedValue(null);
    mockedStatesService.findStatusEventsAfter.mockResolvedValue([]);
    mockedBotRepository.findWakeSubscriptions.mockResolvedValue([]);
    mockedBotsService.isBotUser.mockResolvedValue(false);
    mockedRuntime.runAssistantWake.mockResolvedValue();
});

describe('scanStatusEventsForWakes', () => {
    it('does nothing without new events (cursor untouched)', async () => {
        const summary = await scanStatusEventsForWakes();
        expect(summary).toEqual({ events: 0, wakes: 0, skipped: 0 });
        expect(mockedSystemSettings.set).not.toHaveBeenCalled();
    });

    it('passes the persisted cursor to the states read', async () => {
        mockedSystemSettings.get.mockResolvedValue('last-id');
        mockedStatesService.findStatusEventsAfter.mockResolvedValue([]);
        await scanStatusEventsForWakes();
        expect(mockedStatesService.findStatusEventsAfter).toHaveBeenCalledWith('last-id', 200);
    });

    it('advances the cursor to the batch end before firing wakes', async () => {
        mockedStatesService.findStatusEventsAfter.mockResolvedValue([
            event({ _id: { toString: () => 'evt-1' } }),
            event({ _id: { toString: () => 'evt-2' }, targetId: 'inst-2' })
        ]);
        const subscription = { botUserId: BOT, conversationKey: 'instance:organization:org-1' };
        mockedBotRepository.findWakeSubscriptions.mockResolvedValue([subscription]);
        const order = [];
        mockedSystemSettings.set.mockImplementation(async () => order.push('cursor'));
        mockedRuntime.runAssistantWake.mockImplementation(async () => order.push('wake'));
        const summary = await scanStatusEventsForWakes();
        expect(summary).toEqual({ events: 2, wakes: 2, skipped: 0 });
        expect(mockedSystemSettings.set).toHaveBeenCalledWith('agentBots.wakeCursor', 'evt-2');
        expect(order[0]).toBe('cursor');
    });

    it('never wakes on creation (initialize) events', async () => {
        mockedStatesService.findStatusEventsAfter.mockResolvedValue([
            event({ operation: { kind: 'initialize' }, fromStatePrimary: null })
        ]);
        const summary = await scanStatusEventsForWakes();
        expect(mockedBotRepository.findWakeSubscriptions).not.toHaveBeenCalled();
        expect(summary.skipped).toBe(1);
    });

    it('wakes on intent operations like plain transitions', async () => {
        mockedStatesService.findStatusEventsAfter.mockResolvedValue([
            event({ operation: { kind: 'intent', intent: 'complete' } })
        ]);
        const subscription = { botUserId: BOT, conversationKey: 'group:g1', wakeOn: [{ type: 'queue', state: 'nested', profile: 'rule-brain' }] };
        mockedBotRepository.findWakeSubscriptions.mockResolvedValue([subscription]);
        const summary = await scanStatusEventsForWakes();
        expect(summary.wakes).toBe(1);
        expect(mockedRuntime.runAssistantWake).toHaveBeenCalledTimes(1);
        expect(mockedRuntime.runAssistantWake).toHaveBeenCalledWith(subscription, expect.anything(), { type: 'queue', state: 'nested', profile: 'rule-brain' });
    });

    it('never wakes on bot-actor events (loop prevention); SYSTEM actors wake', async () => {
        mockedStatesService.findStatusEventsAfter.mockResolvedValue([
            event({ actor: { id: BOT, principalType: 'user' } }),
            event({ actor: { id: 'SYSTEM', principalType: 'SYSTEM' } })
        ]);
        mockedBotsService.isBotUser.mockImplementation(async (id) => id === BOT);
        const subscription = { botUserId: BOT, conversationKey: 'group:g1' };
        mockedBotRepository.findWakeSubscriptions.mockResolvedValue([subscription]);
        const summary = await scanStatusEventsForWakes();
        expect(summary.wakes).toBe(1);
    });

    it('matches wake rules by type and primary state only through the query', async () => {
        mockedStatesService.findStatusEventsAfter.mockResolvedValue([event()]);
        await scanStatusEventsForWakes();
        expect(mockedBotRepository.findWakeSubscriptions).toHaveBeenCalledWith({ type: 'queue', state: 'nested' });
    });

    it('narrows instance-scoped subscriptions to their own instance', async () => {
        mockedStatesService.findStatusEventsAfter.mockResolvedValue([event({ targetId: 'inst-9' })]);
        const sameInstance = { botUserId: BOT, conversationKey: 'instance:queue:inst-9', wakeOn: [{ type: 'queue', state: 'nested' }] };
        const otherInstance = { botUserId: 'user-bot-b', conversationKey: 'instance:queue:inst-1', wakeOn: [{ type: 'queue', state: 'nested' }] };
        const orgScoped = { botUserId: 'user-bot-c', conversationKey: 'instance:organization:org-1', wakeOn: [{ type: 'queue', state: 'nested' }] };
        mockedBotRepository.findWakeSubscriptions.mockResolvedValue([sameInstance, otherInstance, orgScoped]);
        const summary = await scanStatusEventsForWakes();
        expect(summary.wakes).toBe(2);
        expect(mockedRuntime.runAssistantWake).toHaveBeenCalledTimes(2);
        expect(mockedRuntime.runAssistantWake).toHaveBeenCalledWith(sameInstance, expect.objectContaining({ targetId: 'inst-9' }), { type: 'queue', state: 'nested' });
        expect(mockedRuntime.runAssistantWake).toHaveBeenCalledWith(orgScoped, expect.anything(), { type: 'queue', state: 'nested' });
    });
});
