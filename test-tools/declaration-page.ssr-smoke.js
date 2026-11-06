// SSR smoke for the in-place declaration editor's routed twin
// (SPEC §1): the route page mounts the editor with its query params and
// paints the loading shell — catching setup-binding and import-graph
// breaks the shell smoke cannot see elsewhere.
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, ref, watch } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmService from 'primevue/confirmationservice';
import Re_L from '~/assets/presets/re_l';
import DeclarationPage from '~/pages/types/declaration.vue';
import { useAuthStore } from '~/stores/auth';

globalThis.h = h;
globalThis.watch = watch;
globalThis.useState = (_key, init) => ref(typeof init === 'function' ? init() : init || {});
globalThis.$fetch = vi.fn(async () => ({}));
globalThis.definePageMeta = () => {};
globalThis.navigateTo = () => {};
globalThis.useAuthStore = () => useAuthStore();
globalThis.useRoute = undefined;
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/types/declaration', component: { render: () => null } }]
});
router.push('/types/declaration?type=t-widget&definition=def-1');
await router.isReady();
globalThis.useRouter = () => ({ push: () => {} });

describe('declaration editor routed page', () => {
  it('mounts the editor shell over the query params', async () => {
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    await authStore.setUser();

    const i18n = createI18n({
      legacy: false,
      missingWarn: false,
      fallbackWarn: false,
      messages: { en: {} }
    });
    const app = createSSRApp({ render: () => h(DeclarationPage) });
    app.use(i18n);
    app.use(router);
    app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
    app.use(ToastService);
    app.use(ConfirmService);
    app.directive('tooltip', { getSSRProps: () => ({}) });

    const html = await renderToString(app);
    expect(html).toContain('common.loading');
    expect(html).not.toContain('t-widget');
  });
});
