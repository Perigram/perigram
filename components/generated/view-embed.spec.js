// The view embed's mounted states (SPEC §26): the embed composes the
// minimal list region through the ordinary machinery and applies the
// saved lens at mount. The lens travels over its own GET
// (`/api/views/:id`) after the list lands, so the embed's phases are:
// list row present + lens pending (the loading surface, never a live
// region), lens present (the region with every view model seeded), and
// row absent after load (the carried name + unavailable state).
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import Re_L from '~/assets/presets/re_l';
import ViewEmbed from './ViewEmbed.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useViewsStore } from '~/stores/views';
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

async function renderEmbed({ viewRow = null, viewState = null, seedPool = true } = {}) {
  const i18n = createI18n({
    legacy: false, missingWarn: false, fallbackWarn: false, messages: { en }
  });
  const pinia = createPinia();
  const authStore = useAuthStore(pinia);
  authStore.user = {
    userId: 'user-1',
    organizationId: 'org-1',
    process: { active: true, bundle: { types: [WALL_TYPE] }, actions: {}, producerOutputs: {} }
  };
  authStore.organization = { _id: 'org-1' };
  const views = useViewsStore(pinia);
  if (viewRow) views.views = [viewRow];
  if (viewState) views.viewStates = { [viewRow._id]: viewState };
  views.loaded = true;
  if (seedPool) {
    const instances = useInstancesStore(pinia);
    instances.upsertRecord('t-wall', wallDto('i-1', 'Wall one'));
    instances.upsertRecord('t-wall', wallDto('i-2', 'Wall two'));
  }
  const app = createSSRApp({ render: () => h(ViewEmbed, { viewId: 'v-1', fallbackName: 'Wall crew' }) });
  app.use(i18n);
  app.use(pinia);
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ToastService);
  app.use(ConfirmationService);
  return await renderToString(app);
}

describe('view embed', () => {
  it('renders the loading surface while the saved lens is still pending, never a live region', async () => {
    const html = await renderEmbed({ viewRow: { _id: 'v-1', name: 'Wall crew', typeId: 't-wall' } });

    // The lens travels over its own GET after the list lands; until it
    // arrives the embed owns no region to render — seeding a region
    // now would freeze every view model at its empty default.
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('>Wall one<');
    expect(html).not.toContain('>Wall two<');
  });

  it('mounts the region with the saved lens applied once the state is present', async () => {
    const html = await renderEmbed({
      viewRow: { _id: 'v-1', name: 'Wall crew', typeId: 't-wall' },
      viewState: { search: 'Wall one', filters: null, sort: null, projection: null }
    });

    expect(html).toContain('>Wall crew<');
    expect(html).toContain('>Wall one<');
    expect(html).not.toContain('>Wall two<');
    expect(html).not.toContain('>v-1<');
  });

  it('renders the carried name and the unavailable state for a view the list no longer carries', async () => {
    const html = await renderEmbed({ viewRow: null, seedPool: false });

    expect(html).toContain('>Wall crew<');
    expect(html).toContain('unavailable');
  });
});
