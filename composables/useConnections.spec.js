import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    static instances = [];

    constructor(url) {
        this.url = url;
        this.readyState = FakeEventSource.CONNECTING;
        FakeEventSource.instances.push(this);
    }

    close() {
        this.readyState = FakeEventSource.CLOSED;
    }

    emitOpen() {
        this.readyState = FakeEventSource.OPEN;
        this.onopen?.({});
    }

    emitMessage(payload) {
        this.onmessage?.({ data: JSON.stringify(payload) });
    }

    emitError(readyState) {
        this.readyState = readyState;
        this.onerror?.({});
    }
}

async function loadConnections() {
    vi.resetModules();
    const module = await import('./useConnections.js');
    return module.useConnections();
}

describe('connections stream and subscription sync machines', () => {
    let fetchMock;

    beforeEach(() => {
        vi.useFakeTimers();
        FakeEventSource.instances = [];
        vi.stubGlobal('EventSource', FakeEventSource);
        vi.stubGlobal('window', new EventTarget());
        fetchMock = vi.fn().mockResolvedValue({});
        vi.stubGlobal('$fetch', fetchMock);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('connects once, opens on ready, and synchronizes the topic set', async () => {
        const connection = await loadConnections();
        expect(connection.status.value).toBe('idle');

        connection.subscribe('user:u-1', () => {});
        expect(FakeEventSource.instances).toHaveLength(1);
        expect(connection.status.value).toBe('connecting');

        FakeEventSource.instances[0].emitOpen();
        expect(connection.status.value).toBe('open');

        FakeEventSource.instances[0].emitMessage({
            type: 'ready',
            connectionId: 'connection-1',
            presence: [{ userId: 'u-1' }]
        });
        await vi.advanceTimersByTimeAsync(0);

        expect(connection.status.value).toBe('open');
        expect(connection.syncState.value).toBe('synced');
        expect(connection.epoch.value).toBe(1);
        expect(connection.onlineUserIds.value.has('u-1')).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith('/api/connections/subscriptions', {
            method: 'POST',
            body: { connectionId: 'connection-1', topics: ['user:u-1'] }
        });
    });

    it('reopens a closed stream through reconnecting and connecting', async () => {
        const connection = await loadConnections();
        connection.subscribe('user:u-1', () => {});
        FakeEventSource.instances[0].emitMessage({ type: 'ready', connectionId: 'connection-1' });
        await vi.advanceTimersByTimeAsync(0);

        FakeEventSource.instances[0].emitError(FakeEventSource.CLOSED);
        expect(connection.status.value).toBe('reconnecting');

        await vi.advanceTimersByTimeAsync(500);
        expect(FakeEventSource.instances).toHaveLength(2);
        expect(connection.status.value).toBe('connecting');

        FakeEventSource.instances[1].emitMessage({ type: 'ready', connectionId: 'connection-2' });
        await vi.advanceTimersByTimeAsync(0);
        expect(connection.status.value).toBe('open');
        expect(connection.epoch.value).toBe(2);
        expect(fetchMock).toHaveBeenLastCalledWith('/api/connections/subscriptions', {
            method: 'POST',
            body: { connectionId: 'connection-2', topics: ['user:u-1'] }
        });
    });

    it('reopens the stream on a 403 subscription sync', async () => {
        const connection = await loadConnections();
        connection.subscribe('user:u-1', () => {});
        fetchMock.mockRejectedValueOnce({ statusCode: 403 });
        FakeEventSource.instances[0].emitMessage({ type: 'ready', connectionId: 'stale-connection' });
        await vi.advanceTimersByTimeAsync(0);

        expect(connection.syncState.value).toBe('idle');
        expect(connection.status.value).toBe('reconnecting');
        expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);

        await vi.advanceTimersByTimeAsync(500);
        expect(FakeEventSource.instances).toHaveLength(2);
        FakeEventSource.instances[1].emitMessage({ type: 'ready', connectionId: 'fresh-connection' });
        await vi.advanceTimersByTimeAsync(0);

        expect(connection.status.value).toBe('open');
        expect(connection.syncState.value).toBe('synced');
        expect(fetchMock).toHaveBeenLastCalledWith('/api/connections/subscriptions', {
            method: 'POST',
            body: { connectionId: 'fresh-connection', topics: ['user:u-1'] }
        });
    });

    it('caps subscription sync retries and settles failed', async () => {
        const connection = await loadConnections();
        connection.subscribe('user:u-1', () => {});
        fetchMock.mockRejectedValue({ statusCode: 500 });
        FakeEventSource.instances[0].emitMessage({ type: 'ready', connectionId: 'connection-1' });

        await vi.advanceTimersByTimeAsync(0);
        expect(connection.syncState.value).toBe('failed');
        await vi.advanceTimersByTimeAsync(60_000);

        expect(fetchMock).toHaveBeenCalledTimes(6);
        expect(connection.syncState.value).toBe('failed');
        await vi.advanceTimersByTimeAsync(60_000);
        expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it('drops a topic from the subscription sync with its last handler', async () => {
        const connection = await loadConnections();
        const unsubscribe = connection.subscribe('conversation:abc', () => {});
        FakeEventSource.instances[0].emitMessage({ type: 'ready', connectionId: 'connection-1' });
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenLastCalledWith('/api/connections/subscriptions', {
            method: 'POST',
            body: { connectionId: 'connection-1', topics: ['conversation:abc'] }
        });

        unsubscribe();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenLastCalledWith('/api/connections/subscriptions', {
            method: 'POST',
            body: { connectionId: 'connection-1', topics: [] }
        });
    });
});
