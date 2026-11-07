// The record surface's declaration authoring integration (SPEC §1): with
// a provided authoring session the property block projects the draft
// (declared scalar fields in authored order, empty ones included, per-row
// author affordances, add-field at the block end) and the stateless
// record header carries the quiet add-states affordance; without a
// session both surfaces stay byte-identical. SSR-mount pattern per
// sidebar-explorer.
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { describe, expect, it } from 'vitest';
import Re_L from '~/assets/presets/re_l';
import en from '~/i18n/locales/en.json';
import SurfaceHeader from './SurfaceHeader.vue';
import SurfaceDetailBody from './SurfaceDetailBody.vue';

globalThis.useState = (_key, init) => ref(typeof init === 'function' ? init() : init || {});

async function render(component, props, provides = {}) {
  const app = createSSRApp({ render: () => h(component, props) });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en } }));
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  for (const [key, value] of Object.entries(provides)) app.provide(key, value);
  return await renderToString(app);
}

const SPACING = { stack: 'ck-stack', stackTight: 'ck-stack-tight', specRow: 'ck-spec-row', sectionTitle: 'ck-section-title' };

const fieldNode = (id, name, descriptor) => ({
  node: { id, type: 'ctsField', data: { refId: id, typeId: 't-widget', name, descriptor } },
  declareEdgeId: `declares:${id}-cls_1`
});

const sessionOf = (subtree) => ({
  phase: { value: 'ready' },
  ready: { value: true },
  subtree: { value: subtree },
  dirty: { value: false },
  saving: { value: false },
  diagnostics: { value: [] },
  refusals: { value: [] },
  typeOptions: { value: [] },
  save: () => {}
});

const TYPE = { id: 't-widget', fields: { Title: { base: 'string', identifier: true }, Note: { base: 'string' } } };

describe('property block declaration authoring', () => {
  const bodyProps = {
    instance: { id: 'i_1', fields: { Note: 'hello' } },
    type: TYPE,
    variant: 'full',
    presentation: 'record'
  };

  it('projects the draft fields in authored order with per-row affordances and add-field', async () => {
    const subtree = {
      classNode: { id: 'cls_1' },
      fields: [
        fieldNode('fld_qty', 'Qty', { base: 'quantity', unit: 'mm' }),
        fieldNode('fld_note', 'Note', { base: 'string' })
      ],
      states: [],
      transitions: [],
      constructs: []
    };
    const html = await render(SurfaceDetailBody, bodyProps, {
      uiMappingSpacing: SPACING,
      declarationAuthoring: sessionOf(subtree)
    });
    expect(html).toContain('Qty');
    expect(html).toContain('Note');
    expect((html.match(/field-author-open/g) || []).length).toBe(2);
    expect(html).toContain('Add field');
  });

  it('keeps the compiled fact block for non-holders', async () => {
    const html = await render(SurfaceDetailBody, bodyProps, {
      uiMappingSpacing: SPACING
    });
    expect(html).toContain('Note');
    expect(html).not.toContain('field-author-open');
    expect(html).not.toContain('Add field');
  });
});

describe('state surface declaration authoring', () => {
  it('carries the quiet add-states affordance when the record has no state', async () => {
    const html = await render(SurfaceHeader, {
      type: { id: 't-widget' },
      instance: { id: 'i_1' },
      actions: []
    }, {
      uiMappingSpacing: SPACING,
      declarationAuthoring: sessionOf({ states: [], transitions: [], fields: [], constructs: [] })
    });
    expect(html).toContain('Add states');
  });

  it('renders no authoring affordance without a session', async () => {
    const html = await render(SurfaceHeader, {
      type: { id: 't-widget' },
      instance: { id: 'i_1' },
      actions: []
    }, { uiMappingSpacing: SPACING });
    expect(html).not.toContain('Add states');
  });
});
