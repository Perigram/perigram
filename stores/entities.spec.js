import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEntityStore } from './entities.js';
import { emitEntityCreated, emitEntityDeleted, emitEntityUpdated } from '~/utils/entity-events.js';

describe('entity store sync listener', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('window', new EventTarget());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('upserts and removes entities from the registry when shared sync events fire', () => {
    const store = useEntityStore();

    emitEntityCreated({ type: 'project', entity: { _id: 'project-1', identity: { name: 'Created' } } });
    expect(store.registry.project['project-1']).toMatchObject({ identity: { name: 'Created' } });

    emitEntityUpdated({ type: 'project', entity: { _id: 'project-1', identity: { name: 'Updated' } } });
    expect(store.registry.project['project-1']).toMatchObject({ identity: { name: 'Updated' } });

    emitEntityDeleted({ type: 'project', id: 'project-1' });
    expect(store.registry.project['project-1']).toBeUndefined();
  });

  it('resolves optional references through the access-filtered collection endpoint', async () => {
    const request = vi.fn().mockResolvedValue([]);
    vi.stubGlobal('$fetch', request);
    const store = useEntityStore();

    await expect(store.fetchEntity('cassette', 'cassette-denied', false, { silent: true })).resolves.toBeNull();
    expect(request).toHaveBeenCalledWith('/api/cassettes?_id=cassette-denied', {});
  });

  it('deduplicates concurrent reference hydration and caches the exact returned entity', async () => {
    let completeRequest;
    const request = vi.fn(() => new Promise(resolve => { completeRequest = resolve; }));
    vi.stubGlobal('$fetch', request);
    const store = useEntityStore();

    const first = store.fetchEntity('cassette', 'cassette-1', false, { silent: true });
    const second = store.fetchEntity('cassette', 'cassette-1', false, { silent: true });
    completeRequest([
      { _id: 'cassette-other', identity: { name: 'Other' } },
      { _id: 'cassette-1', identity: { name: 'Readable' } }
    ]);

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ _id: 'cassette-1' }),
      expect.objectContaining({ _id: 'cassette-1' })
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(store.registry.cassette['cassette-1']).toMatchObject({ identity: { name: 'Readable' } });
  });
});
