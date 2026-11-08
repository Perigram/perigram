// The views store transport (SPEC §26): the list projection, the
// per-view state loads, and the stale-cache drop — a view deleted
// server-side leaves the list cache the moment its GET answers 404.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useViewsStore } from './views';

const notFound = () => {
  const error = new Error('View not found');
  error.status = 404;
  error.statusCode = 404;
  return error;
};

describe('views store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    globalThis.$fetch = vi.fn();
  });

  it('loads the list once and shares the in-flight reload', async () => {
    let calls = 0;
    globalThis.$fetch = vi.fn(async () => {
      calls += 1;
      return { views: [{ _id: 'v-1', name: 'Walls', typeId: 't-wall' }] };
    });
    const views = useViewsStore();
    await Promise.all([views.ensureLoaded(), views.ensureLoaded()]);
    expect(calls).toBe(1);
    expect(views.views).toEqual([{ _id: 'v-1', name: 'Walls', typeId: 't-wall' }]);
  });

  it('lands the per-view state and upserts the row', async () => {
    const viewState = { search: 'wall', filters: null, sort: null, projection: 'board' };
    globalThis.$fetch = vi.fn(async () => ({ _id: 'v-1', name: 'Walls', typeId: 't-wall', viewState }));
    const views = useViewsStore();
    views.views = [{ _id: 'v-9', name: 'Old', typeId: 't-door' }];
    await views.loadView('v-1');
    expect(views.viewStates['v-1']).toEqual(viewState);
    expect(views.viewById('v-1')?.name).toBe('Walls');
    expect(views.views.map(row => row._id)).toEqual(['v-9', 'v-1']);
  });

  it('drops the stale row when the per-view GET answers 404', async () => {
    globalThis.$fetch = vi.fn(async () => { throw notFound(); });
    const views = useViewsStore();
    views.views = [{ _id: 'v-1', name: 'Walls', typeId: 't-wall' }];
    views.viewStates = { 'v-1': { search: 'x', filters: null, sort: null, projection: null } };
    await expect(views.loadView('v-1')).rejects.toMatchObject({ status: 404 });
    expect(views.viewById('v-1')).toBeNull();
    expect(views.viewStates['v-1']).toBeUndefined();
  });

  it('keeps the row when the per-view GET fails transiently', async () => {
    globalThis.$fetch = vi.fn(async () => {
      const error = new Error('boom');
      error.status = 500;
      throw error;
    });
    const views = useViewsStore();
    views.views = [{ _id: 'v-1', name: 'Walls', typeId: 't-wall' }];
    await expect(views.loadView('v-1')).rejects.toMatchObject({ status: 500 });
    expect(views.viewById('v-1')?.name).toBe('Walls');
  });

  it('upserts the created view into the list cache', async () => {
    globalThis.$fetch = vi.fn(async () => ({ _id: 'v-2', name: 'Doors', typeId: 't-door' }));
    const views = useViewsStore();
    views.views = [{ _id: 'v-1', name: 'Walls', typeId: 't-wall' }];
    await views.createView({ name: 'Doors', typeId: 't-door', viewState: {} });
    expect(views.views.map(row => row.name)).toEqual(['Walls', 'Doors']);
  });
});
