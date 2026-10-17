// SSR smoke for the chats page: boots the real ChatSupport surface
// (inbox, dialogs, composer components, message rendering) with the
// Nuxt globals stubbed. The chat content components have their own
// smoke; this one guards the assembled surface — a render-time crash
// anywhere in the chat tree (the missing renderMarkdown import class)
// must fail here, not as a runtime 500 on every chat route.
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import Re_L from '~/assets/presets/re_l';
import ChatsPage from '~/pages/chats.vue';

globalThis.$fetch = vi.fn(async () => ({}));
globalThis.definePageMeta = () => {};
globalThis.navigateTo = () => {};
const nuxtState = new Map();
globalThis.useState = (key, init) => {
  if (!nuxtState.has(key)) nuxtState.set(key, ref(typeof init === 'function' ? init() : null));
  return nuxtState.get(key);
};

const bootPage = async () => {
  const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} }
  });
  const app = createSSRApp({ render: () => h(ChatsPage) });
  app.use(i18n);
  app.use(createPinia());
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ConfirmationService);
  app.use(ToastService);
  app.directive('tooltip', { getSSRProps: () => ({}) });
  return await renderToString(app);
};

describe('chats page SSR smoke', () => {
  beforeEach(() => nuxtState.clear());

  it('boots the chat surface and renders the inbox without throwing', async () => {
    const html = await bootPage();

    expect(html).toContain('chats-new-menu');
    expect(html).toContain('chat-empty');
  });
});
