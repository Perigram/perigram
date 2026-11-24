// SSR smoke for the SPEC §22.12 placement law: relation link/unlink are
// section-scoped. A class list region carrying a link action renders no
// link button (the action addresses a concrete parent instance); the
// relation-scoped section on the record detail renders the link in its
// toolbar and unlink entries on its linked rows; the detail's children
// regions render beside the body. Mounts the real engine over a
// parent/child world with a declared relation.
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, ref, computed, watch, nextTick } from 'vue';
import { createI18n, useI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmService from 'primevue/confirmationservice';
import { useToast } from 'primevue/usetoast';
import Re_L from '~/assets/presets/re_l';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';

globalThis.h = h;
globalThis.ref = ref;
globalThis.computed = computed;
globalThis.watch = watch;
globalThis.nextTick = nextTick;
globalThis.useI18n = useI18n;
globalThis.useToast = useToast;
globalThis.$fetch = vi.fn(async () => ({}));
globalThis.useInstancesStore = () => ({
  canonicalTypeKey: key => key,
  resolveReadableReference: async () => null
});
globalThis.useState = (_key, init) => ref(typeof init === 'function' ? init() : init || {});

const bundle = {
  ok: true,
  errors: [],
  types: [
    { id: 'library', class: 'group', version: 1, name: 'Library', glyph: 'pi pi-book', identifier: 'name', fields: { name: { base: 'string', identifier: true, label: 'Name' } }, edges: {} },
    {
      id: 'parent', class: 'group', version: 1, name: 'Parent', glyph: 'pi pi-objects-column', identifier: 'name',
      fields: {
        name: { base: 'string', identifier: true, label: 'Name' },
        libraries: { base: 'ref', accepts: ['library'], label: 'Libraries' }
      },
      edges: {
        children: {
          kids: { types: ['child'], onRemove: 'restrict', lineageKey: 'parentId' },
          wards: { types: ['ward'], onRemove: 'restrict', lineageKey: 'parentId' }
        }
      }
    },
    { id: 'child', class: 'item', version: 1, name: 'Child', glyph: 'pi pi-tag', identifier: 'label', fields: { label: { base: 'string', identifier: true, label: 'Label' } }, edges: {} },
    { id: 'ward', class: 'item', version: 1, name: 'Ward', glyph: 'pi pi-box', identifier: 'label', fields: { label: { base: 'string', identifier: true, label: 'Label' } }, edges: {} }
  ]
};
const instances = {
  library: [{ id: 'lib-1', type: 'library', fields: { name: 'Main library' }, relations: {}, lineage: {} }],
  parent: [{
    id: 'prj-1', type: 'parent', fields: { name: 'Alpha', libraries: 'lib-1' },
    relations: { libraries: [{ type: 'library', id: 'lib-1' }] }, lineage: {}
  }],
  child: [
    { id: 'k-1', type: 'child', fields: { label: 'Kid one' }, relations: {}, lineage: { parentId: { type: 'parent', id: 'prj-1' } } },
    { id: 'k-2', type: 'child', fields: { label: 'Kid two' }, relations: {}, lineage: { parentId: { type: 'parent', id: 'prj-1' } } }
  ],
  ward: [{ id: 'w-1', type: 'ward', fields: { label: 'Ward one' }, relations: {}, lineage: { parentId: { type: 'parent', id: 'prj-1' } } }]
};
const actions = {
  a_create_parent: { id: 'a_create_parent', label: 'New Parent', actionKind: 'createInstance', typeId: 'parent', trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }, construction: { mode: 'generic', inputs: [] } },
  a_link_parent: { id: 'a_link_parent', label: 'Link Library', actionKind: 'link', typeId: 'parent', relation: { key: 'libraries', targetTypes: ['library'], cardinality: 'many' }, trigger: { mode: 'manual' }, access: { level: 'write', grants: [] } },
  a_unlink_parent: { id: 'a_unlink_parent', label: 'Unlink Library', actionKind: 'unlink', typeId: 'parent', relation: { key: 'libraries', targetTypes: ['library'], cardinality: 'many' }, trigger: { mode: 'manual' }, access: { level: 'write', grants: [] } }
};
const screens = {
  list: {
    id: 'auto_parent', screenKey: 'auto_parent', label: 'Parent', kind: 'typeList', template: 'typeList',
    route: '/screens/auto_parent', sourceRoute: '/screens/auto_parent', placement: 'hub', typeId: 'parent',
    required: null, roleIds: ['operator'], scope: {}, bindings: {},
    sources: [{ id: 'parent', typeId: 'parent', mode: 'list', required: null }],
    regions: [{ id: 'main', slot: 'main', sourceId: 'parent', surface: 'list', actions: ['a_create_parent', 'a_link_parent'] }],
    actions: []
  },
  detail: {
    id: 'auto_parent_detail', screenKey: 'auto_parent_detail', label: 'Parent', kind: 'instanceDetail', template: 'instanceDetail',
    route: '/screens/auto_parent_detail', sourceRoute: '/screens/auto_parent_detail', placement: 'detail', typeId: 'parent',
    required: null, roleIds: ['operator'], scope: { instanceId: 'prj-1' }, bindings: {},
    sources: [
      { id: 'parent', typeId: 'parent', mode: 'single', required: null, identifier: '$screen.scope.instanceId' },
      { id: 'crel', typeId: 'library', mode: 'list', required: null, relation: { sourceId: 'parent', key: 'libraries' } },
      { id: 'ckids', typeId: 'child', mode: 'list', required: null, lineage: { sourceId: 'parent', key: 'parentId' } }
    ],
    regions: [
      { id: 'main', slot: 'main', sourceId: 'parent', surface: 'detail', actions: ['a_link_parent', 'a_unlink_parent'] },
      { id: 'crel', slot: 'children', sourceId: 'crel', surface: 'list', actions: [] },
      { id: 'ckids', slot: 'children', sourceId: 'ckids', surface: 'list', actions: [] }
    ],
    actions: []
  }
};
const contract = { processId: 'proc-relactions', dataflowVersion: 4, roles: {}, screens, actions, navigation: [], statePolicy: {}, stateTransitions: {} };

async function render(screenKey) {
  const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en: {} } });
  const app = createSSRApp({
    render: () => h(GeneratedMappingScreen, { screen: screens[screenKey], contract, bundle, instances })
  });
  app.use(i18n);
  app.use(createPinia());
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ToastService);
  app.use(ConfirmService);
  app.directive('tooltip', { getSSRProps: () => ({}) });
  const { renderToString } = await import('vue/server-renderer');
  return renderToString(app);
}

describe('relation action placement (SPEC §22.12, SSR)', () => {
  it('renders no link button on the class list', async () => {
    const html = await render('list');
    // The create control renders; the link action does not.
    expect(html).toContain('pi pi-plus');
    expect(html).not.toContain('pi-link');
    expect(html).not.toContain('Link Library');
  });

  it('renders one children column per edge in the parent table', async () => {
    const html = await render('list');
    expect(html).toContain('Kids');
    expect(html).toContain('Wards');
    // The rows' children render as chips (labels resolve against the
    // served type view — the live probe's assertion; the SSR harness
    // has none).
    expect((html.match(/p-chip/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('renders the link in the relation section toolbar and unlink on its rows', async () => {
    const html = await render('detail');
    expect(html).toContain('pi-link');
    // The relation slot owns the reference: one rendered row, even when a
    // stale field value names the same target.
    expect((html.match(/Main library/g) || [])).toHaveLength(1);
    // The section's rows carry the row menu (unlink rides it).
    // The row menu trigger renders on the linked rows (the unlink
    // entries ride it; the popover's items render on open).
    expect(html).toContain('pi-ellipsis');
  });

  it('renders the children collection on the record detail', async () => {
    const html = await render('detail');
    expect(html).toContain('Kid one');
    expect(html).toContain('Kid two');
  });
});
