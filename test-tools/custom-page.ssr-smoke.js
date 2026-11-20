// SSR smoke for the custom page surface (SPEC §26): a mounted page tab
// renders its markdown document through the host pipeline — the read
// presentation is the one renderer every authored surface reads through.
// The engine itself is browser-only (built after mount, destroyed with
// the component), so the server render exercises the read half and the
// registry props adapter that carries the page id to the surface. A
// page carrying a view fence renders the saved view as a live
// collection region: the read composition splits the fences out, the
// embed composes the minimal list screen through composeScreen, and the
// saved lens applies over the loaded pool.
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import Re_L from '~/assets/presets/re_l';
import GeneratedWorkspacePage from '~/components/generated/GeneratedWorkspacePage.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { usePagesStore } from '~/stores/pages';
import { useViewsStore } from '~/stores/views';
import { normalizePageDocument } from '#shared/page-document.js';
import en from '~/i18n/locales/en.json';

globalThis.$fetch = vi.fn(async () => ({}));
globalThis.useState = (_key, init) => ref(typeof init === 'function' ? init() : init || {});

const WALL_TYPE = {
  id: 't-wall',
  name: 'Wall',
  identifier: 'Name',
  fields: { Name: { base: 'string', identifier: true } },
  edges: {}
};

const wallDto = (id, name) => ({
  _id: id, type: 't-wall', name, state: null,
  lineage: {}, relations: {}, fields: { Name: name }
});

const bootPage = async ({ tab, seed = () => {} } = {}) => {
  const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    messages: { en }
  });
  const pinia = createPinia();
  const pages = usePagesStore(pinia);
  pages.pages = [
    { _id: 'pg-1', kind: 'page', name: 'Field notes', parentId: null },
    { _id: 'pg-2', kind: 'page', name: 'Crew board', parentId: null },
    { _id: 'sec-1', kind: 'section', name: 'Notes', parentId: null }
  ];
  pages.documents = {
    'pg-1': normalizePageDocument({ blocks: [{ id: 't-1', kind: 'text', text: '# Walls\n\n- battens\n- cladding' }] }),
    'pg-2': normalizePageDocument({ blocks: [{ id: 't-1', kind: 'text', text: '# Crew' }, { id: 'v-1', kind: 'view', view: { id: 'v-1', name: 'Wall crew', typeId: 't-wall' } }] })
  };
  pages.loaded = true;
  seed(pinia);
  const app = createSSRApp({
    render: () => h(GeneratedWorkspacePage, { page: tab })
  });
  app.use(i18n);
  app.use(pinia);
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ConfirmationService);
  app.use(ToastService);
  return await renderToString(app);
};

const pageTab = docId => ({
  key: `page:customPage:${docId}`,
  kind: 'page',
  pageId: 'customPage',
  docId,
  label: 'Field notes'
});

describe('custom page SSR smoke', () => {
  it('boots a mounted page tab and binds the document through the registry adapter', async () => {
    const html = await bootPage({ tab: pageTab('pg-1') });

    // The read presentation mounts the pipeline's markdown recipe (the
    // pipeline renders empty server-side by its own law — the document
    // itself renders client-side through the same home).
    expect(html).toContain('ck-markdown-body');
    expect(html).not.toContain('>pg-1<');
  });

  it('renders a view fence as a live collection region with the saved lens applied', async () => {
    const html = await bootPage({
      tab: { ...pageTab('pg-2'), label: 'Crew board' },
      seed: pinia => {
        const authStore = useAuthStore(pinia);
        authStore.user = {
          userId: 'user-1',
          organizationId: 'org-1',
          process: { active: true, bundle: { types: [WALL_TYPE] }, actions: {}, producerOutputs: {} }
        };
        authStore.organization = { _id: 'org-1' };
        const views = useViewsStore(pinia);
        views.views = [{ _id: 'v-1', name: 'Wall crew', typeId: 't-wall' }];
        views.viewStates = {
          'v-1': { search: 'Wall one', filters: null, sort: null, projection: null }
        };
        views.loaded = true;
        const instances = useInstancesStore(pinia);
        instances.upsertRecord('t-wall', wallDto('i-1', 'Wall one'));
        instances.upsertRecord('t-wall', wallDto('i-2', 'Wall two'));
      }
    });

    // The embed composes the collection region and applies the saved
    // search over the loaded pool through the ordinary machinery.
    expect(html).toContain('>Wall crew<');
    expect(html).toContain('>Wall one<');
    expect(html).not.toContain('>Wall two<');
    // Raw ids stay private display vocabulary.
    expect(html).not.toContain('>v-1<');
    expect(html).not.toContain('>t-wall<');
    expect(html).not.toContain('>pg-2<');
  });
});
