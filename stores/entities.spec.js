import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEntityStore } from './entities';
import { useInstancesStore } from './instances';
import { emitEntityCreated, emitEntityDeleted, emitEntityUpdated } from '~/utils/entity-events.js';

// The delegated legacy contract: reads resolve through the instances store,
// the DTO registry reconciles from shared events, and the store owns no
// transport or endpoint table.
describe('entity store delegated contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('window', new EventTarget());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('upserts and removes registry entries when shared sync events fire', () => {
    const store = useEntityStore();

    emitEntityCreated({ type: 'queue', entity: { _id: 'queue-1', identity: { name: 'Created' } } });
    expect(store.registry.queue['queue-1']).toMatchObject({ identity: { name: 'Created' } });

    emitEntityUpdated({ type: 'queue', entity: { _id: 'queue-1', identity: { name: 'Updated' } } });
    expect(store.registry.queue['queue-1']).toMatchObject({ identity: { name: 'Updated' } });

    emitEntityDeleted({ type: 'queue', id: 'queue-1' });
    expect(store.registry.queue['queue-1']).toBeUndefined();
  });

  it('resolves optional references through the instances store list-and-find path', async () => {
    const instances = useInstancesStore();
    const resolve = vi.spyOn(instances, 'resolveReadableReference').mockResolvedValue(null);
    const store = useEntityStore();

    await expect(store.fetchEntity('cassette', 'cassette-denied', false, { silent: true })).resolves.toBeNull();
    expect(resolve).toHaveBeenCalledWith('cassette', 'cassette-denied', { silent: true });
  });

  it('caches the resolved DTO and serves it without a second resolution', async () => {
    const instances = useInstancesStore();
    const dto = { _id: 'cassette-1', identity: { name: 'Readable' } };
    const resolve = vi.spyOn(instances, 'resolveReadableReference').mockResolvedValue(dto);
    const store = useEntityStore();

    await expect(store.fetchEntity('cassette', 'cassette-1')).resolves.toMatchObject({ _id: 'cassette-1' });
    await expect(store.fetchEntity('cassette', 'cassette-1')).resolves.toMatchObject({ _id: 'cassette-1' });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(store.registry.cassette['cassette-1']).toMatchObject({ identity: { name: 'Readable' } });
  });
});
