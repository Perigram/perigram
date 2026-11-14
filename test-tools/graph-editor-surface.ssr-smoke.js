// SSR smoke for the graph editor surface: boots the real SFC (session
// composable, chrome binding, canvas component imports) and renders it
// to string with the Nuxt globals stubbed — the same guard the process
// page smoke is for its page. The payload load rides onMounted, so the
// server render is the boot state; the chrome channel binding happens
// in setup and is asserted here.
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, reactive } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import Re_L from '~/assets/presets/re_l';
import GraphEditorSurface from '~/components/process-designer/GraphEditorSurface.vue';

globalThis.$fetch = vi.fn(async () => ({ types: [], processCapabilities: null }));

function chromeChannel() {
  return reactive({ api: null, bind(next) { this.api = next; } });
}

function payloadPersistence() {
  return {
    typeId: 'graph-document',
    instanceId: 'g-1',
    title: 'Fixture graph',
    load: async () => JSON.stringify({ dataflowVersion: 5, processNodes: {} }),
    save: vi.fn(),
    rename: vi.fn()
  };
}

async function renderSurface({ mode = 'edit', record = null } = {}) {
  const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en: {} } });
  const pageChrome = chromeChannel();
  const app = createSSRApp({
    render: () => h(GraphEditorSurface, { record, typeId: 'graph-document', persistence: payloadPersistence(), mode, pageChrome })
  });
  app.use(createPinia());
  app.use(i18n);
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ToastService);
  app.directive('tooltip', { getSSRProps: () => ({}) });
  const html = await renderToString(app);
  return { html, pageChrome };
}

describe('graph editor surface SSR smoke', () => {
  it('boots the session, binds the document chrome, and renders the boot state', async () => {
    const { html, pageChrome } = await renderSurface({ record: { _id: 'g-1', name: 'Fixture graph' } });
    expect(html).toContain('common.loading');
    expect(pageChrome.api?.name).toBe('Fixture graph');
    expect(pageChrome.api?.dirty).toBe(false);
    expect(typeof pageChrome.api?.save).toBe('function');
    expect(typeof pageChrome.api?.rename).toBe('function');
  });

  it('binds the name alone in read mode', async () => {
    const { html, pageChrome } = await renderSurface({ mode: 'read', record: { _id: 'g-1', name: 'Fixture graph' } });
    expect(html).toContain('common.loading');
    expect(pageChrome.api?.name).toBe('Fixture graph');
    expect(pageChrome.api?.save).toBeUndefined();
    expect(pageChrome.api?.rename).toBeUndefined();
  });
});
