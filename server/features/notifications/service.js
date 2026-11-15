import { createError } from 'h3';
import webpush from 'web-push';
import * as repository from './repository.js';
let configured = null;

export function configurePush({ publicKey, privateKey }) {
    if (!publicKey || !privateKey) {
        configured = null;
        return false;
    }
    webpush.setVapidDetails('mailto:support@perigram.dev', publicKey, privateKey);
    configured = { publicKey };
    return true;
}

export function pushConfiguration() {
    return {
        enabled: Boolean(configured),
        publicKey: configured?.publicKey || null
    };
}

/**
 * Maps a user-topic event payload to a notification. Only direct, user-scoped
 * events notify through push: chat inbox pings and call invites. Org-wide
 * entity events stay realtime-only because pushing every status change to
 * every offline member would be noise, not signal.
 */
export function notificationFromEvent(payload = {}) {
    if (payload.type === 'support.inbox') {
        return {
            title: 'Perigram',
            body: 'New message',
            tag: `message:${payload.conversationKey}`,
            data: { url: '/chats' }
        };
    }
    if (payload.type === 'call.invite') {
        return {
            title: payload.fromName || 'Perigram',
            body: 'Incoming call',
            tag: `call:${payload.room}`,
            requireInteraction: true,
            data: { url: '/chats' }
        };
    }
    return null;
}

export async function notifyUser(userId, payload) {
    if (!configured || !userId) return { sent: 0 };
    const notification = notificationFromEvent(payload);
    if (!notification) return { sent: 0 };
    const subscriptions = await repository.findByUser(userId);
    const results = await Promise.allSettled(subscriptions.map(subscription => webpush.sendNotification(
        subscription,
        JSON.stringify(notification)
    )));
    const dead = [];
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            const { statusCode, message } = result.reason || {};
            if ([404, 410].includes(statusCode)) {
                dead.push(subscriptions[index].endpoint);
            } else {
                console.warn(`Push send failed (${statusCode || 'network'}): ${message || 'unreachable'}`);
            }
        }
    });
    for (const endpoint of dead) {
        await Promise.resolve(repository.removeByEndpoint(endpoint)).catch(() => null);
    }
    return { sent: results.filter(result => result.status === 'fulfilled').length };
}

export async function saveSubscription(auth, subscription = {}) {
    if (!auth?.userId || !subscription?.endpoint || !subscription?.keys?.auth || !subscription?.keys?.p256dh) {
        throw createError({ statusCode: 400, message: 'Invalid push subscription' });
    }
    return repository.upsert({
        userId: auth.userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys
    });
}

export async function removeSubscription(endpoint, auth = {}) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Authentication required' });
    if (!endpoint) return;
    await repository.removeByEndpoint(endpoint, auth.userId);
}
