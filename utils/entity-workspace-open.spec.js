// The workspace-open contract after the home shell deletion: entities
// open at their compiled detail route (either manifest vocabulary), with
// the home route as the no-detail fallback.
import { describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '~/stores/auth';
import { openEntityInWorkspace } from '~/utils/entity-workspace-open.js';

const navigateTo = vi.fn();
globalThis.navigateTo = navigateTo;
// The util guards on a browser environment; node specs provide the global.
globalThis.window ||= {};

const screens = [
  { id: 'home_user_a', screenKey: 'home_user_a', template: 'home', route: '/screens/home_user_a', sources: [] },
  {
    id: 'auto_role_op_panel',
    screenKey: 'auto_panel',
    template: 'typeList',
    sources: [{ id: 'panel', typeId: 'panel', mode: 'list' }]
  },
  {
    id: 'auto_role_op_panel_detail',
    screenKey: 'auto_panel_detail',
    template: 'instanceDetail',
    route: '/screens/auto_panel_detail',
    sources: [{ id: 'panel', typeId: 'panel', mode: 'single' }]
  }
];

function hydrate(screenList) {
  setActivePinia(createPinia());
  useAuthStore().user = { screens: screenList };
  navigateTo.mockClear();
}

describe('openEntityInWorkspace routes to compiled detail screens', () => {
  it('navigates to the paired detail screen with the entity id', () => {
    hydrate(screens);

    expect(openEntityInWorkspace({ entityType: 'panel', entityId: 'p-1' })).toBe(true);
    expect(navigateTo).toHaveBeenCalledWith('/screens/auto_panel_detail?entityId=p-1');
  });

  it('synthesizes the paired detail key when only the list screen exists (legacy vocabulary too)', () => {
    hydrate([
      { id: 'queues', screenKey: 'queues', template: 'entityList', sources: [{ id: 'q', entityType: 'queue', mode: 'list' }] }
    ]);

    openEntityInWorkspace({ entityType: 'queue', entityId: 'q-9' });
    expect(navigateTo).toHaveBeenCalledWith('/screens/queues_detail?entityId=q-9');
  });

  it('falls back to the home route when the type has no screen', () => {
    hydrate(screens);

    openEntityInWorkspace({ entityType: 'ghost', entityId: 'g-1' });
    expect(navigateTo).toHaveBeenCalledWith('/screens/home_user_a');
  });
});
