// SSR smoke for the generated screens page with a projected (CTS-vocabulary)
// hydration payload: boots the real page SFC through pinia-backed stores and
// renders one inferred typeList screen to string. Reproduces the renderer
// choice and the class-level create-button resolution end to end.
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, watch } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmService from 'primevue/confirmationservice';
import Re_L from '~/assets/presets/re_l';
import ScreensPage from '~/pages/screens/[screenKey].vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';

globalThis.h = h;
globalThis.watch = watch;
globalThis.$fetch = vi.fn(async (url) => {
  if (String(url).startsWith('/api/auth/me')) return hydrationUser();
  // One real list row: the store's keyed pool must reach the generator as
  // grouped instances — a keyed pool passed straight through previously
  // crashed buildInstancePool ("group is not iterable") on every screen
  // with loaded data.
  if (String(url).startsWith('/api/instances/')) {
    return [{ _id: 'i-1', type: 't-k3x9fj2mqa', name: 'Ticket one', state: 'new', organizationId: 'org-1', lineage: {}, relations: {}, fields: {} }];
  }
  return [];
});
globalThis.definePageMeta = () => {};
globalThis.navigateTo = () => {};
globalThis.useAuthStore = () => useAuthStore();
globalThis.useRoute = undefined;
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/screens/:screenKey', component: { render: () => null } }]
});
router.push('/screens/auto_t-k3x9fj2mqa');
await router.isReady();
globalThis.useRouter = () => ({ push: () => {} });

const bundle = {
  ok: true,
  organizationId: 'org-1',
  types: [{
    id: 't-k3x9fj2mqa',
    class: 'item',
    scope: 'org',
    version: 1,
    name: 'Job Ticket',
    glyph: 'pi pi-box',
    identifier: 'name',
    depiction: { glyph: 'pi pi-box', thumb: null },
    fields: { name: { base: 'string', identifier: true }, note: { base: 'string' } },
    sections: [{ id: 'summary', label: null, fields: ['name', 'note'] }],
    payload: null,
    edges: {},
    states: { main: { initial: 'new', values: ['new'], terminal: [], render: { new: { label: 'New', icon: null, severity: 'info' } } } },
    transitions: [],
    operators: {},
    revisions: [],
    schema: {}
  }]
};

const projectedAction = {
  id: 'ctor',
  label: 'Create Job Ticket new',
  actionKind: 'createInstance',
  typeId: 't-k3x9fj2mqa',
  trigger: { mode: 'manual' },
  access: { level: 'write', grants: [{ roleId: 'role_op', level: 'write' }] },
  state: { to: 'new' },
  construction: { mode: 'genericCreate', inputs: ['fields.name', 'fields.note'] },
  fields: ['fields.name', 'fields.note', 'field:name'],
  actionId: 'ctor',
  typeId: 't-k3x9fj2mqa',
  parentTypeId: null,
  inputPolicy: { prompt: true, fields: [{ id: 'fields.name', path: 'fields.name', type: 'string', prompt: true, required: true }] }
};

const screens = [
  {
    id: 'home_user_a',
    screenKey: 'home_user_a',
    label: 'Home',
    kind: 'home',
    template: 'home',
    placement: 'home',
    route: '/screens/home_user_a',
    roleIds: ['role_op'],
    sources: [{ id: 'home_t-k3x9fj2mqa', label: 'Job Ticket', typeId: 't-k3x9fj2mqa', mode: 'list', required: null, filters: {}, lineageBindings: [] }],
    regions: [{ id: 'home_t-k3x9fj2mqa_section', label: 'Job Ticket', slot: 'main', sourceId: 'home_t-k3x9fj2mqa', surface: 'card', actions: ['ctor'], screenKey: 'auto_t-k3x9fj2mqa', route: '/screens/auto_t-k3x9fj2mqa' }],
    actions: ['ctor']
  },
  {
    id: 'auto_role_op_t-k3x9fj2mqa',
    screenKey: 'auto_t-k3x9fj2mqa',
    label: 'Job Ticket',
    kind: 'typeList',
    template: 'typeList',
    placement: 'hub',
    typeId: 't-k3x9fj2mqa',
    route: '/screens/auto_t-k3x9fj2mqa',
    roleIds: ['role_op'],
    sources: [{ id: 't-k3x9fj2mqa', label: 'Job Ticket', typeId: 't-k3x9fj2mqa', mode: 'list', required: null, filters: {} }],
    regions: [{ id: 'main', label: 'Job Ticket', slot: 'main', sourceId: 't-k3x9fj2mqa', surface: 'table', actions: ['ctor'] }],
    actions: ['ctor']
  },
  {
    id: 'auto_role_op_t-k3x9fj2mqa_detail',
    screenKey: 'auto_t-k3x9fj2mqa_detail',
    label: 'Job Ticket',
    kind: 'instanceDetail',
    template: 'instanceDetail',
    placement: 'detail',
    typeId: 't-k3x9fj2mqa',
    route: '/screens/auto_t-k3x9fj2mqa_detail',
    roleIds: ['role_op'],
    sources: [{ id: 't-k3x9fj2mqa', typeId: 't-k3x9fj2mqa', mode: 'single', required: null, identifier: '$screen.scope.instanceId', filters: {} }],
    regions: [{ id: 'main', slot: 'main', sourceId: 't-k3x9fj2mqa', surface: 'detail', actions: [] }],
    actions: []
  }
];

function hydrationUser() {
  return {
    userId: 'user_a',
    organizationId: 'org-1',
    screens,
    navigation: [],
    effectivePermissions: { items: [{ level: 'read' }] },
    roleAssignments: { actions: [projectedAction] },
    process: {
      active: true,
      bundle,
      actions: { ctor: projectedAction },
      producerOutputs: {},
      lineageBindings: []
    }
  };
}

describe('generated screens page with projected vocabulary', () => {
  it('renders the typeList screen through the generator with its create action', async () => {
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    await authStore.setUser();
    // Pre-load one instance row: the store's keyed pool must reach the
    // generator as grouped instances — a keyed pool passed straight
    // through previously crashed buildInstancePool ("group is not
    // iterable") on every screen with loaded data.
    useInstancesStore().upsertRecord('t-k3x9fj2mqa', {
      _id: 'i-1', type: 't-k3x9fj2mqa', name: 'Ticket one',
      state: 'new', lineage: {}, relations: {}, fields: {}
    });

    const i18n = createI18n({
      legacy: false,
      missingWarn: false,
      fallbackWarn: false,
      messages: { en: {} }
    });
    const app = createSSRApp({ render: () => h(ScreensPage) });
    app.use(i18n);
    app.use(router);
    app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
    app.use(ToastService);
    app.use(ConfirmService);
    app.directive('tooltip', { getSSRProps: () => ({}) });

    const html = await renderToString(app);
    // The generator owns the route (the ui-mapping engine's region header
    // and collection projection, not the legacy GeneratedScreen shell);
    // the routed page's title bar names the class (the region header
    // renders count and controls alone), and the class-level create
    // collapses its caption to the bare localized new (identity under the
    // smoke's empty-locale i18n), never repeating the class name or the
    // initial state.
    expect(html).toContain('Job Ticket');
    expect(html).toContain('text-page-title');
    expect(html).toContain('uiMapping.new');
    expect(html).not.toContain('Create Job Ticket');
    expect(html).toContain('Ticket one');
    expect(html).not.toContain('t-k3x9fj2mqa');
  });

  it('paints first-load skeletons for a cold detail screen, never a missing/empty message', async () => {
    // The record page's first render (SSR and hydration alike) must paint
    // the per-source loading skeletons: a data-state divergence between
    // the server render and the client's first render hydration-mismatches
    // the page, and the arrangement (peer columns/tabs) that composes
    // after the pool loads would never mount.
    await router.push('/screens/auto_t-k3x9fj2mqa_detail?instanceId=i-404');
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    await authStore.setUser();

    const i18n = createI18n({
      legacy: false,
      missingWarn: false,
      fallbackWarn: false,
      messages: { en: {} }
    });
    const app = createSSRApp({ render: () => h(ScreensPage) });
    app.use(i18n);
    app.use(router);
    app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
    app.use(ToastService);
    app.use(ConfirmService);
    app.directive('tooltip', { getSSRProps: () => ({}) });

    const html = await renderToString(app);
    expect(html).toContain('p-skeleton');
    expect(html).not.toContain('uiMapping.missingRegion');
    expect(html).not.toContain('uiMapping.emptyRegion');
  });
});
