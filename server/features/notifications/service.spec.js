import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('web-push', () => ({
    default: {
        setVapidDetails: vi.fn(),
        sendNotification: vi.fn()
    }
}));
vi.mock('./repository.js', () => ({
    findByUser: vi.fn(),
    upsert: vi.fn(),
    removeByEndpoint: vi.fn()
}));

import webpush from 'web-push';
import { configurePush, pushConfiguration, notificationFromEvent, notifyUser, removeSubscription } from './service.js';
import { findByUser, removeByEndpoint } from './repository.js';

describe('notifications service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('enables push only with a complete VAPID pair', () => {
        expect(configurePush({ publicKey: 'pk', privateKey: '' })).toBe(false);
        expect(pushConfiguration()).toEqual({ enabled: false, publicKey: null });
        expect(configurePush({ publicKey: 'pk', privateKey: 'sk' })).toBe(true);
        expect(pushConfiguration()).toEqual({ enabled: true, publicKey: 'pk' });
        expect(webpush.setVapidDetails).toHaveBeenCalledWith(expect.any(String), 'pk', 'sk');
    });

    it('maps user-scoped events to notifications and skips the rest', () => {
        expect(notificationFromEvent({ type: 'support.inbox', conversationKey: 'k' })).toEqual({
            title: 'Perigram',
            body: 'New message',
            tag: 'message:k',
            data: { url: '/chats' }
        });
        expect(notificationFromEvent({ type: 'call.invite', room: 'call:direct:1:2', fromName: 'Ann' })).toMatchObject({
            title: 'Ann',
            body: 'Incoming call',
            requireInteraction: true,
            tag: 'call:call:direct:1:2'
        });
        expect(notificationFromEvent({ type: 'presence', online: [] })).toBe(null);
        expect(notificationFromEvent({ type: 'entityChanged', data: {} })).toBe(null);
    });

    it('sends push to each stored subscription and prunes dead endpoints', async () => {
        configurePush({ publicKey: 'pk', privateKey: 'sk' });
        findByUser.mockResolvedValue([
            { endpoint: 'a', keys: {} },
            { endpoint: 'b', keys: {} }
        ]);
        webpush.sendNotification.mockImplementationOnce(() => Promise.resolve());
        webpush.sendNotification.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('gone'), { statusCode: 410 })));

        const result = await notifyUser('user-1', { type: 'support.inbox', conversationKey: 'k' });

        expect(result.sent).toBe(1);
        expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
        expect(removeByEndpoint).toHaveBeenCalledWith('b');
    });

    it('removes only the authenticated user subscription', async () => {
        await removeSubscription('endpoint-1', { userId: 'user-1' });
        expect(removeByEndpoint).toHaveBeenCalledWith('endpoint-1', 'user-1');
        await expect(removeSubscription('endpoint-2')).rejects.toMatchObject({ statusCode: 401 });
    });

    it('sends nothing when push is unconfigured or the event is not notifiable', async () => {
        configurePush({ publicKey: '', privateKey: '' });
        expect(await notifyUser('user-1', { type: 'call.invite' })).toEqual({ sent: 0 });
        configurePush({ publicKey: 'pk', privateKey: 'sk' });
        expect(await notifyUser('user-1', { type: 'typing' })).toEqual({ sent: 0 });
        expect(findByUser).not.toHaveBeenCalled();
    });
});
