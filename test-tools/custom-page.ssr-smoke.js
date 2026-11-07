// SSR smoke for the custom page surface (SPEC §26): a mounted page tab
// renders its markdown document through the host pipeline — the read
// presentation is the one renderer every authored surface reads through.
// The engine itself is browser-only (built after mount, destroyed with
// the component), so the server render exercises the read half and the
// registry props adapter that carries the page id to the surface.
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import Re_L from '~/assets/presets/re_l';
import GeneratedWorkspacePage from '~/components/generated/GeneratedWorkspacePage.vue';
import { usePagesStore } from '~/stores/pages';
import en from '~/i18n/locales/en.json';

globalThis.$fetch = vi.fn(async () => ({}));

const bootPage = async () => {
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
    { _id: 'sec-1', kind: 'section', name: 'Notes', parentId: null }
  ];
  pages.contents = { 'pg-1': '# Walls\n\n- battens\n- cladding' };
  pages.loaded = true;
  const app = createSSRApp({
    render: () => h(GeneratedWorkspacePage, {
      page: { key: 'page:customPage:pg-1', kind: 'page', pageId: 'customPage', docId: 'pg-1', label: 'Field notes' },
      tabs: [{ key: 'page:customPage:pg-1', kind: 'page', pageId: 'customPage', docId: 'pg-1', label: 'Field notes' }],
      closeable: true
    })
  });
  app.use(i18n);
  app.use(pinia);
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ConfirmationService);
  app.use(ToastService);
  return await renderToString(app);
};

describe('custom page SSR smoke', () => {
  it('boots a mounted page tab and binds the document through the registry adapter', async () => {
    const html = await bootPage();

    // The read presentation mounts the pipeline's markdown recipe (the
    // pipeline renders empty server-side by its own law — the document
    // itself renders client-side through the same home).
    expect(html).toContain('ck-markdown-body');
    expect(html).toContain('<span class="min-w-0 truncate">Field notes</span>');
    expect(html).not.toContain('>pg-1<');
  });
});
