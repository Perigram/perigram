import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useQueuesStore } from './queues.js';

describe('queues store nesting polling', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        globalThis.$fetch = vi.fn(async (url) => {
            if (url.startsWith('/api/queue/')) return { _id: 'queue-1' };
            if (url === '/api/nesting-runs') {
                return [{
                    _id: 'run-1',
                    status: { state: { primary: 'COMPLETE', active: { main: 'COMPLETE' } } }
                }];
            }
            return [];
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        delete globalThis.$fetch;
    });

    it('polls v2 nesting run statuses until completion', async () => {
        const store = useQueuesStore();
        store.runs['queue-1'] = [{
            _id: 'run-1',
            status: { state: { primary: 'NESTING', active: { main: 'NESTING' } } }
        }];

        await store.pollQueueStatus('queue-1');
        await vi.advanceTimersByTimeAsync(3000);

        expect(globalThis.$fetch).toHaveBeenCalledWith('/api/queue/queue-1');
        expect(globalThis.$fetch).toHaveBeenCalledWith('/api/nesting-runs', { query: { queueId: 'queue-1' } });
        expect(store.nestingCompleted).toMatchObject({ queueId: 'queue-1' });
        expect(store.runs['queue-1'][0].status.state.primary).toBe('COMPLETE');
    });

    it('does not start polling when no active nesting run exists', async () => {
        const store = useQueuesStore();
        store.runs['queue-1'] = [{
            _id: 'run-1',
            status: { state: { primary: 'COMPLETE', active: { main: 'COMPLETE' } } }
        }];

        await store.pollQueueStatus('queue-1');
        await vi.advanceTimersByTimeAsync(3000);

        expect(globalThis.$fetch).not.toHaveBeenCalled();
        expect(store.nestingCompleted).toBeNull();
    });

    it('polls process-status runs until solver results are written', async () => {
        globalThis.$fetch = vi.fn(async (url) => {
            if (url.startsWith('/api/queue/')) return { _id: 'queue-1' };
            if (url === '/api/nesting-runs') {
                return [{
                    _id: 'run-1',
                    status: { state: { primary: 'Порезано', active: { main: 'Порезано' } } },
                    data: { results: { sheetCount: 1, placedCount: 2 } }
                }];
            }
            return [];
        });
        const store = useQueuesStore();
        store.runs['queue-1'] = [{
            _id: 'run-1',
            status: { state: { primary: 'Порезано', active: { main: 'Порезано' } } },
            data: {}
        }];

        await store.pollQueueStatus('queue-1');
        await vi.advanceTimersByTimeAsync(3000);

        expect(globalThis.$fetch).toHaveBeenCalledWith('/api/queue/queue-1');
        expect(store.nestingCompleted).toMatchObject({ queueId: 'queue-1' });
    });

    it('ignores stale empty runs when the latest run has results', async () => {
        const store = useQueuesStore();
        store.runs['queue-1'] = [
            {
                _id: 'run-1',
                data: { runNumber: 1 },
                status: { state: { primary: 'Порезано', active: { main: 'Порезано' } } }
            },
            {
                _id: 'run-2',
                data: { runNumber: 2, results: { sheetCount: 1 } },
                status: { state: { primary: 'Порезано', active: { main: 'Порезано' } } }
            }
        ];

        await store.pollQueueStatus('queue-1');
        await vi.advanceTimersByTimeAsync(3000);

        expect(globalThis.$fetch).not.toHaveBeenCalled();
        expect(store.nestingCompleted).toBeNull();
    });

    it('sorts fetched queue runs by run number', async () => {
        globalThis.$fetch = vi.fn(async () => [
            { _id: 'run-3', data: { runNumber: 3 } },
            { _id: 'run-1', data: { runNumber: 1 } },
            { _id: 'run-2', data: { runNumber: 2 } }
        ]);
        const store = useQueuesStore();

        const runs = await store.fetchRuns('queue-1');

        expect(runs.map(run => run._id)).toEqual(['run-1', 'run-2', 'run-3']);
        expect(store.runs['queue-1'].map(run => run._id)).toEqual(['run-1', 'run-2', 'run-3']);
    });
});
