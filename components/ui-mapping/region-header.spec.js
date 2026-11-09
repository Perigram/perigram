// The collection header (SPEC §22.15): the label and its create set
// lead, the view and filter cluster sits right, search stays an icon
// until pressed, and the class name rides the create caption only on
// the empty stub line where the button stands alone. SSR-mount pattern
// per declaration-authoring. The saved-lens and save-the-view contracts
// (SPEC §26) pin here too: a provided view state seeds the region's
// view models (the filter condition count badges the control), the
// label override names the embed, and the save dialog prompts for a
// name under the type label.
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { describe, expect, it, vi } from 'vitest';
import Re_L from '~/assets/presets/re_l';
import en from '~/i18n/locales/en.json';
import RegionBlock from './RegionBlock.vue';
import ViewSaveDialog from './ViewSaveDialog.vue';

// PrimeVue Dialog renders nothing server-side; the stub exposes the
// dialog contract (title/subtitle/slot) to the SSR mount.
vi.mock('../shared/StandardDialog.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      name: 'StandardDialog',
      props: ['visible', 'title', 'subtitle', 'showDefaultFooter', 'cancelLabel', 'saveLabel', 'loading', 'saveDisabled'],
      setup(props, { slots }) {
        return () => (props.visible
          ? h('div', { 'data-dialog': '' }, [
              h('span', { 'data-title': '' }, props.title),
              h('small', { 'data-subtitle': '' }, props.subtitle),
              slots.default?.()
            ])
          : null);
      }
    }
  };
});

globalThis.useState = (_key, init) => ref(typeof init === 'function' ? init() : init || {});

async function render(node, provides = {}, props = {}) {
  const app = createSSRApp({ render: () => h(RegionBlock, { node, pool: {}, ...props }) });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en } }));
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  for (const [key, value] of Object.entries(provides)) app.provide(key, value);
  return await renderToString(app);
}

const SPACING = { stack: 'ck-stack', stackTight: 'ck-stack-tight', specRow: 'ck-spec-row', sectionTitle: 'ck-section-title' };

const TYPE = { id: 't-widget', label: 'Widget', identifier: 'Name', fields: { Name: { base: 'string', identifier: true } } };

// A loaded pool past SEARCH_AT rows makes the search — and with it the
// view control — available.
const CREATE_ACTION = {
  id: 'create-widget',
  actionKind: 'createInstance',
  typeId: 't-widget',
  label: 'New Widget',
  trigger: { mode: 'manual' },
  construction: { mode: 'genericCreate' }
};

const listNode = (overrides = {}) => ({
  id: 'region-1',
  surfaceKind: 'list',
  level: 1,
  typeId: 't-widget',
  type: TYPE,
  instances: Array.from({ length: 9 }, (_, index) => ({
    id: `i_${index}`,
    name: `Widget ${index}`,
    fields: { Name: `Widget ${index}` }
  })),
  listControls: { facets: [], sortKeys: [], searchKeys: ['Name'], defaultSort: null, pagination: { paginateAt: 10, rows: 10 } },
  actions: [CREATE_ACTION],
  childRegions: [],
  dataState: 'ready',
  statePolicy: null,
  crossCut: false,
  ...overrides
});

// Vue hydration anchors carry no DOM footprint; strip them for text
// assertions (phase F's byte-equivalence precedent).
const plainHtml = html => html
  .replaceAll('<!--[-->', '')
  .replaceAll('<!--]-->', '')
  .replaceAll('<!---->', '');

describe('region header controls', () => {
  it('renders the search as an icon until pressed and keeps the filter pinned', async () => {
    const html = await render(listNode(), { uiMappingSpacing: SPACING });
    expect(html).toContain('pi pi-search');
    expect(html).not.toContain('placeholder="Search"');
    expect(html).toContain('pi pi-filter');
    expect(html).not.toContain('opacity-60');
    expect(html).not.toContain('group-hover');
  });

  it('renders the bare New beside the label and the full caption on the empty stub line', async () => {
    const header = await render(listNode(), { uiMappingSpacing: SPACING });
    expect(header).toContain('>New<');
    expect(header).not.toContain('New Widget');

    const stub = await render(
      listNode({ instances: [], dataState: 'empty' }),
      { uiMappingSpacing: SPACING },
      { stub: true }
    );
    expect(stub).toContain('New Widget');
  });
});

describe('saved view lens', () => {
  it('seeds the filter condition count and the label override from the saved state', async () => {
    const viewState = {
      search: '',
      filters: { and: [{ field: 'Name', op: 'contains', value: 'w' }, { field: 'Note', op: 'eq', value: 'x' }] },
      sort: null,
      projection: null
    };
    const html = plainHtml(await render(listNode(), { uiMappingSpacing: SPACING }, { viewState, label: 'Wall crew' }));
    expect(html).toContain('>2</');
    expect(html).toContain('>Wall crew<');
  });

  it('applies the saved search over the collection rows', async () => {
    const viewState = { search: 'Widget 1', filters: null, sort: null, projection: null };
    const html = plainHtml(await render(listNode(), { uiMappingSpacing: SPACING }, { viewState }));
    expect(html).toContain('>Widget 1<');
    expect(html).not.toContain('>Widget 2<');
  });
});

describe('save view dialog', () => {
  it('prompts for a name under the type label and renders no ids', async () => {
    const app = createSSRApp({ render: () => h(ViewSaveDialog, { visible: true, typeLabel: 'Widget' }) });
    app.use(createPinia());
    app.use(createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en } }));
    app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
    const html = await renderToString(app);
    expect(html).toContain('Save view');
    expect(html).toContain('>Widget<');
    expect(html).toContain('aria-label="Name"');
    expect(html).not.toContain('t-widget');
  });
});
