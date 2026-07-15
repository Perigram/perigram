import { describe, expect, it } from 'vitest';
import { acceptedQueueRunId, currentQueueRun } from './queue-runs.js';

describe('queue run helpers', () => {
  it('uses accepted material consumption run as the queue current output', () => {
    const runs = [{ _id: 'run-1' }, { _id: 'run-2' }, { _id: 'run-3' }];
    const queue = { data: { materialConsumption: { runId: 'run-2' } } };

    expect(acceptedQueueRunId(queue)).toBe('run-2');
    expect(currentQueueRun(runs, queue)).toEqual({ _id: 'run-2' });
  });

  it('falls back to physical output run then latest readable run', () => {
    const runs = [{ _id: 'run-1' }, { _id: 'run-2' }];

    expect(currentQueueRun(runs, { data: { physicalOutputs: { runId: 'run-1' } } }))
      .toEqual({ _id: 'run-1' });
    expect(currentQueueRun(runs, { data: {} })).toEqual({ _id: 'run-2' });
  });
});
