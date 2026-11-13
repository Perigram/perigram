import { beforeEach, describe, expect, it, vi } from 'vitest';

const { applyIntent, enqueueTask } = vi.hoisted(() => ({
  applyIntent: vi.fn(async () => ({ status: { state: 'COMPLETE' }, effects: [] })),
  enqueueTask: vi.fn(async () => ({ _id: 'task-1', status: 'QUEUED' }))
}));

vi.mock('../machines/service.js', () => ({
  stateService: { applyIntent }
}));

vi.mock('../tasks/service.js', () => ({
  enqueueTask
}));

import { processEvents } from './service.js';

function registry({ events = {} } = {}) {
  return {
    getEventDefinition: id => events[id] || null
  };
}

describe('effect runtime event validation', () => {
  beforeEach(() => {
    applyIntent.mockClear();
    enqueueTask.mockClear();
  });

  it('accepts informational events without an effect policy', async () => {
    const result = await processEvents([
      { type: 'configBot.draftGenerated', source: { type: 'configBot', id: 'draft' } }
    ], {
      registry: registry({
        events: {
          'configBot.draftGenerated': { id: 'configBot.draftGenerated', informational: true }
        }
      })
    });

    expect(result.events).toHaveLength(1);
    expect(applyIntent).not.toHaveBeenCalled();
  });

  it('rejects non-informational events without an effect policy', async () => {
    await expect(processEvents([
      { type: 'queue.nestingRequested', source: { type: 'queue', id: 'queue-1' } }
    ], {
      registry: registry({
        events: {
          'queue.nestingRequested': { id: 'queue.nestingRequested' }
        }
      })
    })).rejects.toThrow(/no effect policy/);
  });
});
