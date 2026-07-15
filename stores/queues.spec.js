import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useQueuesStore } from './queues.js';

function queueWithNesting(state, lifecycle = {}) {
    return {
        _id: 'queue-1',
        status: {
            state: {
                schemaVersion: 2,
                primary: 'DRAFT',
                active: { main: 'DRAFT', nesting: state },
                regions: {
                    main: { state: 'DRAFT', path: ['DRAFT'] },
                    nesting: { state, path: [state] }
                }
            },
            lifecycle: { actors: [], attachments: {}, data: lifecycle }
        }
    };
}

describe('queues store nesting revision polling', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        globalThis.$fetch = vi.fn(async (url) => {
            if (url === '/api/queue/queue-1') {
                return queueWithNesting('REVIEW', { latestRevisionId: 'revision-2' });
            }
            if (url === '/api/entity-revisions') {
                return [
                    { _id: 'revision-2', data: { number: 2, outcome: 'SUCCESS' } },
                    { _id: 'revision-1', data: { number: 1, outcome: 'FAILURE' } }
                ];
            }
            return [];
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        delete globalThis.$fetch;
    });

    it('polls a RUNNING queue until Status leaves the nesting execution state', async () => {
        const store = useQueuesStore();
        store.currentQueue = queueWithNesting('RUNNING', { activeTaskRunId: 'task-1' });

        await store.pollQueueStatus('queue-1');
        await vi.advanceTimersByTimeAsync(3000);

        expect(globalThis.$fetch).toHaveBeenCalledWith('/api/queue/queue-1');
        expect(globalThis.$fetch).toHaveBeenCalledWith('/api/entity-revisions', {
            query: { entityType: 'queue', entityId: 'queue-1', scope: 'nesting' }
        });
        expect(store.currentQueue.status.state.active.nesting).toBe('REVIEW');
        expect(store.nestingCompleted).toMatchObject({ queueId: 'queue-1' });
    });

    it('does not poll when the queue nesting region is idle', async () => {
        const store = useQueuesStore();
        store.currentQueue = queueWithNesting('IDLE');

        await store.pollQueueStatus('queue-1');
        await vi.advanceTimersByTimeAsync(3000);

        expect(globalThis.$fetch).not.toHaveBeenCalled();
        expect(store.nestingCompleted).toBeNull();
    });

    it('sorts immutable queue revisions by revision number', async () => {
        const store = useQueuesStore();

        const revisions = await store.fetchRevisions('queue-1');

        expect(revisions.map(revision => revision._id)).toEqual(['revision-1', 'revision-2']);
        expect(store.revisions['queue-1'].map(revision => revision._id)).toEqual(['revision-1', 'revision-2']);
    });
});
