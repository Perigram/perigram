import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emitEntityCreated,
  emitEntityDeleted,
  emitEntityUpdated,
  emitStatusTransitionResult,
  ENTITY_CHANGED_EVENT
} from './entity-events.js';

describe('entity sync event helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('window', new EventTarget());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits normalized CRUD event payloads', () => {
    const received = [];
    window.addEventListener(ENTITY_CHANGED_EVENT, event => received.push(event.detail));

    emitEntityCreated({ type: 'project', entity: { _id: 'project-1' } });
    emitEntityUpdated({ type: 'project', id: 'project-1', entity: { _id: 'project-1' } });
    emitEntityDeleted({ type: 'project', id: 'project-1' });

    expect(received).toEqual([
      expect.objectContaining({ type: 'project', id: 'project-1', change: 'created', reason: 'create', source: 'local' }),
      expect.objectContaining({ type: 'project', id: 'project-1', change: 'updated', reason: 'update', source: 'local' }),
      expect.objectContaining({ type: 'project', id: 'project-1', change: 'deleted', reason: 'delete', source: 'local' })
    ]);
  });

  it('emits transition effect entities through the same sync contract', () => {
    const received = [];
    window.addEventListener(ENTITY_CHANGED_EVENT, event => received.push(event.detail));

    emitStatusTransitionResult({
      typeId: 'queue',
      targetId: 'queue-1',
      response: {
        entity: { _id: 'queue-1' },
        effects: {
          entities: [
            { type: 'nesting_run', id: 'run-1', entity: { _id: 'run-1' } }
          ]
        }
      }
    });

    expect(received).toEqual([
      expect.objectContaining({ type: 'queue', id: 'queue-1', change: 'updated', reason: 'status-transition' }),
      expect.objectContaining({ type: 'nesting_run', id: 'run-1', change: 'updated', reason: 'status-transition-effect' })
    ]);
  });
});
