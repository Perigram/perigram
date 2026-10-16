import * as systemSettings from '~/server/features/system-settings/service.js';
import { findStatusEventsAfter } from '~/server/features/states/service.js';
import * as botRepository from './repository.js';
import { runAssistantWake } from './runtime.js';
import { isBotUser } from './service.js';

/**
 * The lifecycle wake scanner (SPEC: agent wakes): a scheduled sweep, not a
 * standing query — the deadline-scanner posture. Every tick reads the
 * status events strictly past the persisted cursor (`system_settings`,
 * insertion order), matches subscription wake rules, and fires AI wakes
 * asynchronously — each delegated to its rule's author. The cursor
 * advances to the batch's last id BEFORE firing: a crash mid-batch drops
 * the un-fired tail rather than replaying it (wakes are best-effort
 * automation, not delivery guarantees).
 *
 * Matching rules: only `transition`/`intent` operations wake (creation
 * initialize events do not); events whose acting principal is a bot never
 * wake the AI (no self-perpetuating loops — deadline/SYSTEM actors do);
 * an instance-scoped subscription (an instance chat key) only matches
 * its own instance; org isolation rides the wake's delegated
 * access-checked instance read (see runtime.js).
 */

const CURSOR_KEY = 'agentBots.wakeCursor';
const BATCH_LIMIT = 200;
const botActorCache = new Map();

async function eventActorIsBot(event) {
    const actor = event.actor || {};
    if (actor.principalType !== 'user') return false;
    const key = String(actor.id || '');
    if (!key) return false;
    const cached = botActorCache.get(key);
    if (cached && Date.now() - cached.at < 60_000) return cached.isBot;
    const isBot = await isBotUser(key);
    botActorCache.set(key, { at: Date.now(), isBot });
    return isBot;
}

function instanceScopeOf(conversationKey = '') {
    const [prefix, type, id] = String(conversationKey).split(':');
    return prefix === 'instance' && type && id ? { type, id } : null;
}

async function dispatchWake(event) {
    if (!['transition', 'intent'].includes(event.operation?.kind)) return 0;
    if (await eventActorIsBot(event)) return 0;
    const state = String(event.toStatePrimary || '');
    if (!state) return 0;
    const subscriptions = await botRepository.findWakeSubscriptions({ type: event.targetType, state });
    let fired = 0;
    for (const subscription of subscriptions) {
        const scope = instanceScopeOf(subscription.conversationKey);
        // Same-type instance chats narrow to their own instance; every
        // other subscription (the organization chat, an instance chat of
        // another type) is org-wide for the rule's type — org isolation
        // rides the wake's own access-checked instance read.
        if (scope && scope.type === String(event.targetType) && String(scope.id) !== String(event.targetId)) continue;
        // The matched rule carries the execution point's model override and
        // its author — the delegation principal of the wake run.
        const rule = (subscription.wakeOn || []).find(item => (
            String(item.type) === String(event.targetType) && String(item.state) === state
        )) || {};
        runAssistantWake(subscription, event, rule).catch(error => console.error('[AGENT-BOTS] wake dispatch failed:', error));
        fired += 1;
    }
    return fired;
}

export async function scanStatusEventsForWakes() {
    const summary = { events: 0, wakes: 0, skipped: 0 };
    const lastId = await systemSettings.get(CURSOR_KEY);
    const events = await findStatusEventsAfter(lastId, BATCH_LIMIT);
    if (!events.length) return summary;
    summary.events = events.length;
    await systemSettings.set(CURSOR_KEY, events[events.length - 1]._id.toString());
    for (const event of events) {
        try {
            const fired = await dispatchWake(event);
            if (fired) summary.wakes += fired;
            else summary.skipped += 1;
        } catch (error) {
            console.error('[AGENT-BOTS] wake scan failed for event:', error?.message);
        }
    }
    return summary;
}
