// The record document's overlay composition (SPEC §26): the authored
// order applies with custom blocks interleaved around the declared
// sections, declared content renders regardless of the order (appended
// in derivation order when the order omits it, dropped when it names
// nothing), and a document with no overlay renders today's fixed flow.
// SSR-mount pattern per declaration-authoring.
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import { describe, expect, it } from 'vitest';
import Re_L from '~/assets/presets/re_l';
import en from '~/i18n/locales/en.json';
import SurfaceDetailBody from './SurfaceDetailBody.vue';
import RegionBlock from './RegionBlock.vue';
import { useInstanceOverlaysStore } from '~/stores/instance-overlays';

globalThis.useState = (_key, init) => ref(typeof init === 'function' ? init() : init || {});
globalThis.$fetch = async () => ({});

async function render(props, provides = {}) {
  const app = createSSRApp({
    render: () => h(SurfaceDetailBody, props, {
      // The host's foreign-section materialization: child collections
      // and the overlay's custom blocks.
      'document-section': ({ section }) => h('div', {
        'data-section': section.key,
        'data-block': section.block?.kind || 'child'
      }, section.block?.kind === 'text'
        ? section.block.text
        : (section.block?.kind === 'view' ? section.block.view.name : ''))
    })
  });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en } }));
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  for (const [key, value] of Object.entries(provides)) app.provide(key, value);
  return await renderToString(app);
}

const SPACING = { stack: 'ck-stack', stackTight: 'ck-stack-tight', specRow: 'ck-spec-row', sectionTitle: 'ck-section-title' };

const TYPE = {
  id: 't-widget',
  class: 'item',
  fields: { Title: { base: 'string', identifier: true }, Note: { base: 'string' } },
  edges: { relations: { linked: { types: ['t-part'] } } }
};

const INSTANCE = {
  id: 'i_1',
  fields: { Note: 'hello' },
  relations: { linked: [{ type: 't-part', id: 'p_1' }] }
};

const CHILD_SECTIONS = [{ key: 'children:t-part' }];

const bodyProps = {
  instance: INSTANCE,
  type: TYPE,
  variant: 'full',
  presentation: 'record',
  // The relation chips resolve their referenced records from the pool —
  // a seeded pool keeps the readable-reference seam idle in SSR mounts.
  pool: { t_part: { p_1: { id: 'p_1', type: 't-part', name: 'Part one', fields: { name: 'Part one' } } } },
  childSections: CHILD_SECTIONS
};

const plainHtml = html => html
  .replaceAll('<!--[-->', '')
  .replaceAll('<!--]-->', '')
  .replaceAll('<!---->', '');

describe('the record document overlay composition', () => {
  it('renders today\'s fixed flow without an overlay: property rows, then the body, no authoring chrome', async () => {
    const html = plainHtml(await render(bodyProps, { uiMappingSpacing: SPACING }));
    expect(html).toContain('Note');
    expect(html).toContain('Linked');
    // The child sections stay the host's after-body rendering: the flow
    // never asks the slot to render one without a live composition.
    expect(html).not.toContain('data-section');
    expect(html).not.toContain('pi pi-arrow-up');
  });

  it('applies the authored order with custom blocks interleaved around the declared sections', async () => {
    const html = plainHtml(await render({
      ...bodyProps,
      overlay: {
        blocks: [{ id: 'b1', kind: 'text', text: 'Site notes' }],
        order: ['b1', 'properties', 'children:t-part', 'editor']
      }
    }, { uiMappingSpacing: SPACING }));
    const textAt = html.indexOf('Site notes');
    const propsAt = html.indexOf('Note');
    const childAt = html.indexOf('data-section="children:t-part"');
    const editorAt = html.indexOf('ck-stack-tight');
    expect(textAt).toBeGreaterThan(-1);
    expect(childAt).toBeGreaterThan(-1);
    expect(textAt).toBeLessThan(propsAt);
    expect(childAt).toBeGreaterThan(propsAt);
    // The declared relation section still renders — appended after the
    // ordered flow in derivation order.
    expect(html.indexOf('Linked')).toBeGreaterThan(childAt);
    expect(editorAt).toBeGreaterThan(-1);
  });

  it('renders declared content the order omits and drops order keys that name nothing', async () => {
    const html = plainHtml(await render({
      ...bodyProps,
      overlay: { blocks: [], order: ['relation:gone', 'editor'] }
    }, { uiMappingSpacing: SPACING }));
    expect(html).toContain('Note');
    expect(html).toContain('Linked');
    expect(html.indexOf('Note')).toBeGreaterThan(html.indexOf('ck-stack-tight'));
  });

  it('renders a stored view block through the host slot with its saved name', async () => {
    const html = plainHtml(await render({
      ...bodyProps,
      overlay: {
        blocks: [{ id: 'b2', kind: 'view', view: { id: 'v_1', name: 'Open walls' } }],
        order: ['b2']
      }
    }, { uiMappingSpacing: SPACING }));
    expect(html).toContain('data-block="view"');
    expect(html).toContain('Open walls');
  });
});

describe('the composed record page (RegionBlock host)', () => {
  const CHILD_TYPE = { id: 't-part', label: 'Part', identifier: 'Name', fields: { Name: { base: 'string', identifier: true } } };
  const childRegion = {
    id: 'parts_region',
    slot: 'children',
    surfaceKind: 'list',
    level: 1,
    typeId: 't-part',
    type: CHILD_TYPE,
    relationKey: null,
    lineageKey: 'parts',
    instances: [{ id: 'p_1', type: 't-part', name: 'Part one', fields: { Name: 'Part one' }, relations: {}, lineage: {} }],
    listControls: { facets: [], sortKeys: [], searchKeys: ['Name'], defaultSort: null, pagination: { paginateAt: 10, rows: 10 } },
    actions: [],
    childRegions: [],
    stubRegions: [],
    dataState: 'ready',
    statePolicy: null,
    crossCut: false,
    childArrangement: { narrow: { mode: 'stack' }, medium: { mode: 'stack' }, wide: { mode: 'stack' } }
  };
  const recordNode = {
    id: 'main',
    surfaceKind: 'detail',
    level: 0,
    typeId: 't-widget',
    type: TYPE,
    instances: [{ id: 'i_1', type: 't-widget', name: 'Widget', fields: { Note: 'hello' }, relations: {}, lineage: {} }],
    variant: 'full',
    actions: [],
    childRegions: [childRegion],
    stubRegions: [],
    dataState: 'ready',
    statePolicy: null,
    crossCut: false,
    childArrangement: { narrow: { mode: 'stack' }, medium: { mode: 'stack' }, wide: { mode: 'stack' } }
  };

  async function renderRecord(overlay) {
    const pinia = createPinia();
    setActivePinia(pinia);
    if (overlay) {
      const store = useInstanceOverlaysStore();
      store.overlays = { 't-widget:i_1': overlay };
      store.loaded = { 't-widget:i_1': true };
    }
    const app = createSSRApp({
      render: () => h(RegionBlock, {
        node: recordNode,
        pool: { t_part: { p_1: childRegion.instances[0] } },
        depth: 0,
        presentation: 'record'
      })
    });
    app.use(pinia);
    app.use(createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en } }));
    app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
    app.use(ToastService);
    app.use(ConfirmationService);
    app.provide('uiMappingSpacing', SPACING);
    return plainHtml(await renderToString(app));
  }

  it('renders child collections after the body without an overlay', async () => {
    const html = await renderRecord(null);
    expect(html).toContain('Part one');
    expect(html.indexOf('Part one')).toBeGreaterThan(html.indexOf('hello'));
  });

  it('composes a child collection at its authored position inside the body flow', async () => {
    const html = await renderRecord({
      blocks: [],
      order: ['children:parts:t-part', 'properties', 'editor']
    });
    expect(html).toContain('Part one');
    expect(html).toContain('hello');
    expect(html.indexOf('Part one')).toBeLessThan(html.indexOf('hello'));
  });
});
