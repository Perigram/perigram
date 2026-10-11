import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth';
import { useInstancesStore } from './instances';
import { emitInstanceCreated, emitInstanceDeleted, emitInstanceUpdated } from '~/utils/instance-events.js';

// The client state model contract: cache key
// canonicalization, endpoint resolution mirroring the server resolver,
// list observations, coalesced reads, event reconciliation, and the
// mutation boundary.
const queueType = {
  id: 'queue',
  class: 'process',
  fields: { name: { base: 'string' } },
  states: { main: { initial: 'draft', values: ['draft', 'ready'] } },
  operators: { genericCreate: { id: 'genericCreate', species: 'construct' } },
  glyph: 'pi pi-list'
};

function seedBundle(types = [queueType]) {
  const authStore = useAuthStore();
  authStore.user = { userId: 'user-1', process: { active: true, bundle: { types } } };
}

describe('instances store type keys and endpoints', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seedBundle();
  });

  it('canonicalizes registry ids, kebab graph ids, and legacy surface keys', () => {
    const instances = useInstancesStore();
    expect(instances.canonicalTypeKey('queue')).toBe('queue');
    // Kebab registry ids stay kebab — deterministically, registry loaded
    // or not — so pool records keyed at first load (empty registry) never
    // drift from registry-aware lookups.
    expect(instances.canonicalTypeKey('cut-plan')).toBe('cut-plan');
    expect(instances.canonicalTypeKey('cassetteDesign')).toBe('cassette_design');
  });

  it('resolves endpoints like the server resolver: feature routes, else the instance transport', () => {
    const instances = useInstancesStore();
    expect(instances.endpointsFor('queue').list()).toBe('/api/instances/queue');
    expect(instances.endpointsFor('queue').single('q-1')).toBe('/api/instances/queue/q-1');
    expect(instances.endpointsFor('pen_template').list()).toBe('/api/instances/pen-template');
    expect(instances.endpointsFor('cassette').list()).toBe('/api/instances/cassette');
    expect(instances.endpointsFor('cassette').single('c-1')).toBe('/api/instances/cassette/c-1');
    expect(instances.endpointsFor('artifact').single('a-1')).toBe('/api/artifacts/a-1');
    expect(instances.endpointsFor('organization').list()).toBe('/api/organizations');
  });

  it('derives icons and constructibility from the registry bundle', () => {
    const instances = useInstancesStore();
    expect(instances.iconFor('queue')).toBe('pi pi-list');
    expect(instances.iconFor('cassetteDesign')).toBe('pi pi-circle');
    expect(instances.constructible('queue')).toBe(true);
    expect(instances.constructible('cassette')).toBe(false);
  });
});

describe('instances store cache', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seedBundle();
    vi.stubGlobal('window', new EventTarget());
  });

  it('caches records with the derived instance shape and deduplicates single reads', async () => {
    const request = vi.fn().mockResolvedValue({ _id: 'q-1', name: 'Queue one', state: 'draft' });
    vi.stubGlobal('$fetch', request);
    const instances = useInstancesStore();

    const first = instances.fetchInstance('queue', 'q-1');
    const second = instances.fetchInstance('queue', 'q-1');
    await Promise.all([first, second]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(instances.dtoFor('queue', 'q-1')).toMatchObject({ _id: 'q-1' });
    expect(instances.instanceFor('queue', 'q-1')).toMatchObject({
      id: 'q-1',
      type: 'queue',
      state: 'draft',
      fields: { name: 'Queue one' }
    });
    expect(instances.instancePool.queue['q-1']).toBeDefined();
  });

  it('caches list observations and refetches once marked stale', async () => {
    let call = 0;
    const request = vi.fn(async () => [{ _id: 'q-1' }, { _id: 'q-2' }]);
    vi.stubGlobal('$fetch', request);
    const instances = useInstancesStore();

    await instances.listInstances('queue');
    const cached = await instances.listInstances('queue');
    expect(request).toHaveBeenCalledTimes(1);
    expect(cached.map(dto => dto._id)).toEqual(['q-1', 'q-2']);

    instances.removeRecord('queue', 'q-1');
    await instances.listInstances('queue');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('resolves optional references through the list endpoint without caching misses', async () => {
    const request = vi.fn().mockResolvedValue([{ _id: 'q-other' }]);
    vi.stubGlobal('$fetch', request);
    const instances = useInstancesStore();

    await expect(instances.resolveReadableReference('queue', 'q-denied', { silent: true })).resolves.toBeNull();
    expect(request).toHaveBeenCalledWith('/api/instances/queue', { query: { _id: 'q-denied' } });
    expect(instances.dtoFor('queue', 'q-denied')).toBeNull();
  });

  it('reconciles shared entity events into the cache by canonical type key', async () => {
    const instances = useInstancesStore();

    emitInstanceCreated({ type: 'queue', instance: { _id: 'q-1', name: 'Created' } });
    expect(instances.dtoFor('queue', 'q-1')).toMatchObject({ name: 'Created' });

    emitInstanceUpdated({ type: 'queue', instance: { _id: 'q-1', name: 'Updated' } });
    expect(instances.dtoFor('queue', 'q-1')).toMatchObject({ name: 'Updated' });

    emitInstanceDeleted({ type: 'queue', id: 'q-1' });
    expect(instances.dtoFor('queue', 'q-1')).toBeNull();
  });

  it('routes process actions through the outbox with the action endpoint', async () => {
    const { useOutboxStore } = await import('./outbox');
    const store = useOutboxStore();
    const mutate = vi.spyOn(store, 'mutate').mockResolvedValue({ ok: true });
    const instances = useInstancesStore();

    await instances.runAction({ actionId: 'act-1', instanceId: 'q-1', data: { note: 'x' } });
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/process-definitions/active/actions/act-1/execute',
      method: 'POST',
      body: { instanceId: 'q-1', entities: {}, data: { note: 'x' }, parameters: {} }
    }));
  });

  it('routes direct feature mutations through the outbox', async () => {
    const { useOutboxStore } = await import('./outbox');
    const store = useOutboxStore();
    const mutate = vi.spyOn(store, 'mutate').mockResolvedValue({});
    const instances = useInstancesStore();

    await instances.mutateDirect('artifact', 'PATCH', { id: 'a-1', body: { data: { note: 'x' } }, meta: { kind: 'instance' } });
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/artifacts/a-1',
      method: 'PATCH',
      body: { data: { note: 'x' } }
    }));
  });
});
