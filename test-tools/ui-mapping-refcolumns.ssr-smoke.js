// SSR smoke for the relation-grammar column law: ref-field types and
// structural types render their data in collections. Mounts the real
// engine (GeneratedMappingScreen) over a world mirroring the live org
// shapes — a group with name + a ref field whose value rides
// `relations.<name>` (SPEC §6), an item with label + json — and asserts
// the rendered markup: the ref and summary columns exist, chips resolve
// (no N/A badge), and the identifier-only type keeps the table.
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
      id: 'project', class: 'group', version: 1, name: 'Project', glyph: 'pi pi-objects-column', identifier: 'name',
      fields: {
        name: { base: 'string', identifier: true, label: 'Name' },
        libraries: { base: 'ref', accepts: ['library'], label: 'Libraries' }
      },
      edges: { children: { queues: { types: ['queue'], onRemove: 'restrict', lineageKey: 'projectId' } } }
    },
    { id: 'queue', class: 'group', version: 1, name: 'Queue', glyph: 'pi pi-list', identifier: 'name', fields: { name: { base: 'string', identifier: true, label: 'Name' } }, edges: {} },
    {
      id: 'attempt', class: 'item', version: 1, name: 'Attempt', glyph: 'pi pi-bolt', identifier: 'label',
      fields: {
        label: { base: 'string', identifier: true, label: 'Label' },
        result: { base: 'json', label: 'Result' }
      },
      edges: {}
    }
  ]
};
const instances = {
  library: [
    { id: 'lib-1', type: 'library', fields: { name: 'Main library' }, relations: {}, lineage: {} }
  ],
  project: [
    { id: 'prj-1', type: 'project', fields: { name: 'Alpha' }, relations: { libraries: [{ type: 'library', id: 'lib-1' }] }, lineage: {} },
    { id: 'prj-2', type: 'project', fields: { name: 'Beta' }, relations: { libraries: { type: 'library', id: 'lib-1' } }, lineage: {} },
    { id: 'prj-3', type: 'project', fields: { name: 'Gamma' }, relations: {}, lineage: {} }
  ],
  queue: [
    { id: 'q-1', type: 'queue', fields: { name: 'Cutting' }, relations: {}, lineage: { projectId: { type: 'project', id: 'prj-1' } } }
  ],
  attempt: [
    { id: 'a-1', type: 'attempt', fields: { label: 'Run 1', result: { layouts: [{ container: 0 }] } }, relations: {}, lineage: {} },
    { id: 'a-2', type: 'attempt', fields: { label: 'Run 2', result: { layouts: [{ container: 1 }] } }, relations: {}, lineage: {} }
  ]
};
const screens = {
  project: {
    id: 'auto_project', screenKey: 'auto_project', label: 'Project', kind: 'typeList', template: 'typeList',
    route: '/screens/auto_project', sourceRoute: '/screens/auto_project', placement: 'hub', typeId: 'project',
    required: null, roleIds: ['operator'], scope: {}, bindings: {},
    sources: [{ id: 'main', typeId: 'project', mode: 'list', required: null }],
    regions: [{ id: 'main', slot: 'main', sourceId: 'main', surface: 'list', actions: [] }], actions: []
  },
  attempt: {
    id: 'auto_attempt', screenKey: 'auto_attempt', label: 'Attempt', kind: 'typeList', template: 'typeList',
    route: '/screens/auto_attempt', sourceRoute: '/screens/auto_attempt', placement: 'hub', typeId: 'attempt',
    required: null, roleIds: ['operator'], scope: {}, bindings: {},
    sources: [{ id: 'main', typeId: 'attempt', mode: 'list', required: null }],
    regions: [{ id: 'main', slot: 'main', sourceId: 'main', surface: 'list', actions: [] }], actions: []
  },
  queue: {
    id: 'auto_queue', screenKey: 'auto_queue', label: 'Queue', kind: 'typeList', template: 'typeList',
    route: '/screens/auto_queue', sourceRoute: '/screens/auto_queue', placement: 'hub', typeId: 'queue',
    required: null, roleIds: ['operator'], scope: {}, bindings: {},
    sources: [{ id: 'main', typeId: 'queue', mode: 'list', required: null }],
    regions: [{ id: 'main', slot: 'main', sourceId: 'main', surface: 'list', actions: [] }], actions: []
  }
};
const contract = { processId: 'proc-smoke', dataflowVersion: 4, roles: {}, screens, actions: {}, navigation: [], statePolicy: {}, stateTransitions: {} };

async function render(screenKey) {
  const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en: {} } });
  const app = createSSRApp({
    render: () => h(GeneratedMappingScreen, {
      screen: screens[screenKey],
      contract,
      bundle,
      instances
    })
  });
  app.use(i18n);
  app.use(createPinia());
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ToastService);
  app.use(ConfirmService);
  app.directive('tooltip', { getSSRProps: () => ({}) });
  return renderToString2(app);
}

async function renderToString2(app) {
  const { renderToString } = await import('vue/server-renderer');
  return renderToString(app);
}

describe('relation-grammar collection columns (SSR)', () => {
  it('renders the ref-field column as a table with resolved chips', async () => {
    const html = await render('project');
    expect(html).toContain('Libraries');
    // The relation slot chips every linked record. The N/A badge is gone.
    expect(html).toContain('p-chip');
    expect(html).not.toContain('N/A');
    expect(html).not.toContain('Н/Д');
  });

  it('renders the structural summary column', async () => {
    const html = await render('attempt');
    expect(html).toContain('Result');
    // The summary cell renders the structural value's own key label.
    expect(html).toContain('Layouts');
  });

  it('keeps the identifier-only type the table', async () => {
    const html = await render('queue');
    expect(html).toContain('Cutting');
    expect(html).toContain('p-datatable-thead');
    expect(html).not.toContain('N/A');
  });
});
