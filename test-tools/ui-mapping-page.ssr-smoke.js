// SSR smoke for the UI-mapping showcase: boots the real page SFC over a
// pinned random world and renders every screen to string. The world seed
// is chosen so its type shapes derive the board, gantt, and calendar
// projections — the guard for the defect class where a projection's
// template reads a wrong property shape over real composed data (a
// calendar chip once read entry.instance.id on bare instances and 500ed
// the page; pure specs never render the SFC).
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, ref, computed, watch, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { renderToString } from 'vue/server-renderer';
import { createI18n, useI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmService from 'primevue/confirmationservice';
import { useToast } from 'primevue/usetoast';
import Re_L from '~/assets/presets/re_l';
import ShowcasePage from '~/pages/test/ui-mapping.vue';

const SEED = 10;

globalThis.h = h;
globalThis.ref = ref;
globalThis.computed = computed;
globalThis.watch = watch;
globalThis.nextTick = nextTick;
globalThis.useI18n = useI18n;
globalThis.useToast = useToast;
globalThis.definePageMeta = () => {};
globalThis.navigateTo = () => {};
globalThis.$fetch = vi.fn(async () => ({}));
globalThis.useAuthStore = () => ({ screenManifest: [] });
globalThis.useRoute = () => router.currentRoute.value;
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/test/ui-mapping', component: { render: () => null } }]
});
router.push(`/test/ui-mapping?seed=${SEED}`);
await router.isReady();
globalThis.useRouter = () => ({ push: () => {} });

describe('ui-mapping showcase SSR smoke', () => {
  it('renders every screen of the pinned world with board, gantt, and calendar projections', async () => {
    const i18n = createI18n({
      legacy: false,
      missingWarn: false,
      fallbackWarn: false,
      messages: { en: {} }
    });
    const app = createSSRApp({ render: () => h(ShowcasePage) });
    app.use(i18n);
    app.use(router);
    app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
    app.use(ToastService);
    app.use(ConfirmService);
    app.directive('tooltip', { getSSRProps: () => ({}) });

    const html = await renderToString(app);
    expect(html).toContain('data-testid="board-collection"');
    expect(html).toContain('data-testid="gantt-collection"');
    expect(html).toContain('data-testid="calendar-collection"');
    expect(html).toContain('data-testid="board-card"');
    // Instance ids are private display vocabulary (SPEC §UI): no surface
    // renders them as text — record headers subtitle the type label, and
    // ids that ride attributes (the preview seed) are not display.
    const { generateUiMappingWorld } = await import('~/test-data/ui-mapping-random.js');
    const world = generateUiMappingWorld(SEED);
    const text = html.replace(/<[^>]*>/g, '');
    for (const id of Object.values(world.instances || {}).flat().slice(0, 20).map(instance => instance.id)) {
      expect(text).not.toContain(id);
    }
  });
});
