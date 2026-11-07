// The collection header's view control (SPEC §22.15 amendment): the
// control renders pinned with its localized label on every host, and the
// header cluster carries full presence — the hover-quiet disclosure is
// gone. SSR-mount pattern per declaration-authoring.
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { describe, expect, it } from 'vitest';
import Re_L from '~/assets/presets/re_l';
import en from '~/i18n/locales/en.json';
import RegionBlock from './RegionBlock.vue';

globalThis.useState = (_key, init) => ref(typeof init === 'function' ? init() : init || {});

async function render(node, provides = {}) {
  const app = createSSRApp({ render: () => h(RegionBlock, { node, pool: {} }) });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en } }));
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  for (const [key, value] of Object.entries(provides)) app.provide(key, value);
  return await renderToString(app);
}

const SPACING = { stack: 'ck-stack', stackTight: 'ck-stack-tight', specRow: 'ck-spec-row', sectionTitle: 'ck-section-title' };

const TYPE = { id: 't-widget', label: 'Widget', fields: { Note: { base: 'string' } } };

// A loaded pool past SEARCH_AT rows makes the search — and with it the
// view control — available.
const listNode = () => ({
  id: 'region-1',
  surfaceKind: 'list',
  level: 1,
  typeId: 't-widget',
  type: TYPE,
  instances: Array.from({ length: 9 }, (_, index) => ({ id: `i_${index}`, name: `Widget ${index}`, fields: {} })),
  listControls: { facets: [], sortKeys: [], defaultSort: null, pagination: { paginateAt: 10, rows: 10 } },
  actions: [],
  childRegions: [],
  dataState: 'ready',
  statePolicy: null,
  crossCut: false
});

describe('region header view control', () => {
  it('renders the view control with its localized label at full presence', async () => {
    const html = await render(listNode(), { uiMappingSpacing: SPACING });
    expect(html).toContain('>View<');
    expect(html).toContain('pi-sliders-h');
    expect(html).not.toContain('opacity-60');
    expect(html).not.toContain('group-hover');
  });
});
