import { beforeEach, describe, expect, it, vi } from 'vitest';

const { applyIntent, enqueueTask } = vi.hoisted(() => ({
  applyIntent: vi.fn(async () => ({ status: { state: 'COMPLETE' }, effects: [] })),
  enqueueTask: vi.fn(async () => ({ _id: 'task-1', status: 'QUEUED' }))
}));

vi.mock('../machines/service.js', () => ({
  statusService: { applyIntent }
}));

vi.mock('../tasks/service.js', () => ({
  enqueueTask
}));

import { processEvents } from './service.js';

function registry({ events = {}, effects = [], task = null } = {}) {
  return {
    getEventDefinition: id => events[id] || null,
    listEffectDefinitions: () => effects,
    getTaskDefinition: id => task && task.id === id ? task : null
  };
}

describe('effect runtime event policies', () => {
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

  it('executes transition policies by workflow intent', async () => {
    const result = await processEvents([
      { type: 'queue.nestingRequested', source: { type: 'queue', id: 'queue-1' } }
    ], {
      auth: { userId: 'user-1' },
      registry: registry({
        events: {
          'queue.nestingRequested': { id: 'queue.nestingRequested' }
        },
        effects: [{
          id: 'queue.nestingRequested',
          on: 'queue.nestingRequested',
          effects: [{
            type: 'transition',
            entity: { type: 'queue', from: 'event.source' },
            intent: 'requestNesting'
          }]
        }]
      })
    });

    expect(applyIntent).toHaveBeenCalledWith(
      'queue',
      'queue-1',
      'requestNesting',
      { userId: 'user-1' },
      {},
      {}
    );
    expect(result.transitions[0]).toMatchObject({
      type: 'transition',
      entity: { type: 'queue', id: 'queue-1' },
      intent: 'requestNesting',
      targetState: 'COMPLETE'
    });
  });
});
