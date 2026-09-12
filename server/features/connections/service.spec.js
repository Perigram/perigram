import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    __clearRegistryForTests,
    orgPresence,
    publish,
    registerConnection,
    registerTopicAuthorizer,
    syncTopics,
    unregisterConnection
} from './service.js';

const userAuth = (userId, organizationId = null, isAdmin = false) => ({ userId, organizationId, isAdmin });
const openConnection = async (auth) => registerConnection({ auth, push: vi.fn() });

describe('connections gateway registry', () => {
    beforeEach(() => {
        __clearRegistryForTests();
        registerTopicAuthorizer('conversation:', async () => false);
    });

    it('registers a connection with self and org topics and broadcasts presence', async () => {
        const pushes = [];
        const first = await registerConnection({
            auth: userAuth('u1', 'org1'),
            push: data => pushes.push(data)
        });
        expect(first.topics).toEqual(['user:u1', 'org:org1']);
        expect(first.presence).toEqual([{ userId: 'u1', connections: 1 }]);

        const second = await openConnection(userAuth('u2', 'org1'));
        expect(second.presence).toEqual([
            { userId: 'u1', connections: 1 },
            { userId: 'u2', connections: 1 }
        ]);
        const presenceEvents = pushes.map(entry => JSON.parse(entry)).filter(entry => entry.payload?.type === 'presence');
        expect(presenceEvents).toHaveLength(2);
        expect(presenceEvents[1].topic).toBe('org:org1');
        expect(presenceEvents[1].payload.online).toEqual([
            { userId: 'u1', connections: 1 },
            { userId: 'u2', connections: 1 }
        ]);
    });

    it('counts multiple connections of one user as one online user', async () => {
        await openConnection(userAuth('u1', 'org1'));
        await openConnection(userAuth('u1', 'org1'));
        expect(orgPresence('org1')).toEqual([{ userId: 'u1', connections: 2 }]);
    });

    it('delivers published events only to subscribed connections', async () => {
        registerTopicAuthorizer('conversation:', async () => true);
        const events = [];
        const inside = await registerConnection({
            auth: userAuth('u1', 'org1'),
            push: data => events.push(['inside', JSON.parse(data)])
        });
        await registerConnection({
            auth: userAuth('u2', 'org1'),
            push: data => events.push(['outside', JSON.parse(data)])
        });
        await syncTopics(inside.id, ['conversation:support:u1']);

        publish('conversation:support:u1', { type: 'message', message: { _id: 'm1' } });

        const messageEvents = events.filter(([name, entry]) => name === 'inside' && entry.payload?.type === 'message');
        expect(events.filter(([name, entry]) => name === 'outside' && entry.payload?.type === 'message')).toHaveLength(0);
        expect(messageEvents).toHaveLength(1);
        expect(messageEvents[0][1].payload.message._id).toBe('m1');
    });

    it('gates user, org, admin, and feature-authorized topics', async () => {
        registerTopicAuthorizer('conversation:', vi.fn(async () => false));
        const otherOrg = await openConnection(userAuth('u2', 'org2'));
        const result = await syncTopics(otherOrg.id, [
            'user:u2',
            'user:u1',
            'org:org1',
            'org:org2',
            'admin-support',
            'conversation:support:u1'
        ]);
        expect(result.subscribed).toEqual(['user:u2', 'org:org2']);

        const admin = await openConnection(userAuth('admin', 'org1', true));
        const adminResult = await syncTopics(admin.id, ['admin-support']);
        expect(adminResult.subscribed).toContain('admin-support');
    });

    it('delegates conversation admission to the registered authorizer', async () => {
        const authorize = vi.fn(async (auth, topic) => auth.userId === 'u1' && topic === 'conversation:direct:u1:u2');
        registerTopicAuthorizer('conversation:', authorize);
        const allowed = await openConnection(userAuth('u1', 'org1'));
        const denied = await openConnection(userAuth('u2', 'org1'));
        expect((await syncTopics(allowed.id, ['conversation:direct:u1:u2'])).subscribed).toContain('conversation:direct:u1:u2');
        expect((await syncTopics(denied.id, ['conversation:direct:u1:u2'])).subscribed).not.toContain('conversation:direct:u1:u2');
        expect(authorize).toHaveBeenCalled();
    });

    it('treats an authorizer rejection as denied instead of throwing', async () => {
        registerTopicAuthorizer('conversation:', vi.fn(async () => {
            throw new Error('forbidden');
        }));
        const conn = await openConnection(userAuth('u1', 'org1'));
        const result = await syncTopics(conn.id, ['conversation:support:u1']);
        expect(result.subscribed).not.toContain('conversation:support:u1');
    });

    it('broadcasts presence and stops delivery after unregister', async () => {
        const events = [];
        const conn = await registerConnection({
            auth: userAuth('u1', 'org1'),
            push: data => events.push(JSON.parse(data))
        });
        await unregisterConnection(conn.id);
        publish('user:u1', { type: 'support.inbox' });
        expect(events).toHaveLength(1);
        expect(events[0].payload.type).toBe('presence');
        expect(events[0].payload.online).toEqual([{ userId: 'u1', connections: 1 }]);
        expect(orgPresence('org1')).toEqual([]);
    });
});
