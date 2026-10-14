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

  it('resolves endpoints like the server resolver: §3 transport reads, feature-route mutations, else the generic transport', () => {
    const instances = useInstancesStore();
    expect(instances.endpointsFor('queue').list()).toBe('/api/instances/queue');
    expect(instances.endpointsFor('queue').single('q-1')).toBe('/api/instances/queue/q-1');
    expect(instances.endpointsFor('pen_template').list()).toBe('/api/instances/pen-template');
    expect(instances.endpointsFor('cassette').list()).toBe('/api/instances/cassette');
    expect(instances.endpointsFor('cassette').single('c-1')).toBe('/api/instances/cassette/c-1');
    expect(instances.endpointsFor('artifact').single('a-1')).toBe('/api/artifacts/a-1');
    // Party reads ride the §3 instance transport; their mutations keep the
    // feature routes (party administration is feature-owned).
    expect(instances.endpointsFor('user').list()).toBe('/api/instances/user');
    expect(instances.endpointsFor('user').single('u-1')).toBe('/api/instances/user/u-1');
    expect(instances.endpointsFor('user').mutationList()).toBe('/api/users');
    expect(instances.endpointsFor('organization').mutationSingle('o-1')).toBe('/api/organizations/o-1');
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

  it('lands a create run\'s created entity in the pool, keyed by its own type', async () => {
    // The local half of run-action reconciliation (stores README): a
    // create-open destination reads the pool immediately, and the upsert
    // marks the type's cached list observations stale. Non-create runs
    // never land — a delete or transition result must not resurrect or
    // shadow records through this channel.
    const { useOutboxStore } = await import('./outbox');
    const store = useOutboxStore();
    const created = { _id: 'f-1', type: 'e2e-folder', name: 'Probe', fields: {} };
    vi.spyOn(store, 'mutate').mockResolvedValue({ created });
    const instances = useInstancesStore();

    await instances.runAction({ action: { id: 'act-create', actionKind: 'createInstance', typeId: 'e2e-folder' }, actionId: 'act-create', data: {} });
    expect(instances.dtoFor('e2e-folder', 'f-1')).toMatchObject({ name: 'Probe' });

    const updated = { _id: 'f-2', type: 'e2e-folder', name: 'Touched' };
    vi.spyOn(store, 'mutate').mockResolvedValue(updated);
    await instances.runAction({ action: { id: 'act-update', actionKind: 'updateInstance', typeId: 'e2e-folder' }, actionId: 'act-update', instanceId: 'f-2', data: {} });
    expect(instances.dtoFor('e2e-folder', 'f-2')).toBeNull();
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

describe('instances store optimistic mutations', () => {
  let deferredMutate;

  beforeEach(async () => {
    setActivePinia(createPinia());
    seedBundle();
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ eventId: 7 }));
    const { useOutboxStore } = await import('./outbox');
    const store = useOutboxStore();
    // A deferred mutation promise holds the server round-trip open so
    // the optimistic preview is asserted before resolution.
    deferredMutate = vi.spyOn(store, 'mutate').mockImplementation(() => new Promise((resolve, reject) => {
      deferredMutate.resolve = resolve;
      deferredMutate.reject = reject;
    }));
  });

  it('previews a wire patch immediately, merging leaves block-by-block', async () => {
    const instances = useInstancesStore();
    instances.upsertRecord('queue', { _id: 'q-1', name: 'One', fields: { a: 1, b: 2 }, lineage: { project: 'p-1' } });

    const pending = instances.updateInstance('queue', 'q-1', { name: 'Two', fields: { b: 3 }, lineage: { project: 'p-2' } });
    // Before the server responds: the preview merged the leaves (the
    // untouched `fields.a` survives) exactly like the server's leaf-set
    // patch semantics.
    expect(instances.dtoFor('queue', 'q-1')).toMatchObject({ name: 'Two', fields: { a: 1, b: 3 }, lineage: { project: 'p-2' } });

    deferredMutate.resolve({ _id: 'q-1', name: 'Two', fields: { a: 1, b: 3 }, state: 'draft' });
    await pending;
    expect(instances.dtoFor('queue', 'q-1')).toMatchObject({ name: 'Two', state: 'draft' });
  });

  it('rolls an update back to the server-known DTO when the mutation fails', async () => {
    const instances = useInstancesStore();
    instances.upsertRecord('queue', { _id: 'q-1', name: 'One', fields: { a: 1 } });

    const pending = instances.updateInstance('queue', 'q-1', { name: 'Two' });
    expect(instances.dtoFor('queue', 'q-1')).toMatchObject({ name: 'Two' });

    deferredMutate.reject(new Error('denied'));
    await expect(pending).rejects.toThrow('denied');
    expect(instances.dtoFor('queue', 'q-1')).toMatchObject({ name: 'One' });
  });

  it('previews a delete and restores the record when the mutation fails', async () => {
    const instances = useInstancesStore();
    instances.upsertRecord('queue', { _id: 'q-1', name: 'One', fields: {} });

    const pending = instances.removeInstance('queue', 'q-1');
    expect(instances.dtoFor('queue', 'q-1')).toBeNull();

    deferredMutate.reject(new Error('denied'));
    await expect(pending).rejects.toThrow('denied');
    expect(instances.dtoFor('queue', 'q-1')).toMatchObject({ name: 'One' });
  });

  it('records the published invalidation id so its own delivery is skipped', async () => {
    const { isSelfPublished } = await import('~/utils/instance-events.js');
    const instances = useInstancesStore();
    instances.upsertRecord('queue', { _id: 'q-1', name: 'One', fields: {} });

    const pending = instances.updateInstance('queue', 'q-1', { name: 'Two' });
    deferredMutate.resolve({ _id: 'q-1', name: 'Two', fields: {} });
    await pending;

    await Promise.resolve();
    await Promise.resolve();
    expect(isSelfPublished(7)).toBe(true);
  });
});
