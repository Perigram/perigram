// SSR smoke for the process designer page: boots the real SFC (composables,
// registry projection at setup, inspector components, every tab panel) and
// renders it to string with the Nuxt globals stubbed. This is the guard for
// the defect class where a script refactor drops setup bindings the
// script-only identifier checks cannot see — the page must render, not 500.
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import Re_L from '~/assets/presets/re_l';
import ProcessPage from '~/pages/organization/process.vue';

globalThis.h = h;
globalThis.$fetch = vi.fn(async () => ({ types: [], processCapabilities: null }));
globalThis.definePageMeta = () => {};
globalThis.navigateTo = () => {};
globalThis.useAuthStore = () => ({
  organizationData: { _id: 'org-1' },
  userData: null,
  memberships: [],
  userIsSet: true,
  screenManifest: []
});
globalThis.useRoute = () => ({ params: {}, query: {} });
globalThis.useRouter = () => ({ push: () => {} });

describe('process designer page SSR smoke', () => {
  it('boots setup and renders the workspace without throwing', async () => {
    const i18n = createI18n({
      legacy: false,
      missingWarn: false,
      fallbackWarn: false,
      messages: { en: {} }
    });
    const app = createSSRApp({ render: () => h(ProcessPage) });
    app.use(i18n);
    app.use(createPinia());
    app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
    app.use(ToastService);
    app.directive('tooltip', { getSSRProps: () => ({}) });

    const html = await renderToString(app);

    // The workspace shell renders server-side; the dock — canvas panel,
    // toolbar, and file panel with it — mounts client-side through
    // dockview.
    expect(html).toContain('designer-workspace');
    expect(html).not.toContain('data-designer-toolbar');
    expect(html).not.toContain('>organization.screens<');
  });
});
