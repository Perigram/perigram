// Presentation contract of the in-place declaration editor's rows
// (components/type-designer/README.md → the in-place declaration editor):
// fields render as fact rows (small muted name label, ink kind summary,
// identifier mark, quiet-until-hover affordances), states render as the
// severity-and-icon chips records wear, transitions render as machine
// rows with per-source chips, and the severity select speaks localized
// labels — never the raw enum. SSR-mount pattern per sidebar-explorer.
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { describe, expect, it } from 'vitest';
import Re_L from '~/assets/presets/re_l';
import en from '~/i18n/locales/en.json';
import ru from '~/i18n/locales/ru.json';
import DeclarationFieldRow from './DeclarationFieldRow.vue';
import DeclarationStateRow from './DeclarationStateRow.vue';
import DeclarationTransitionRow from './DeclarationTransitionRow.vue';
import { stateSeverityOptions } from './state-severities.js';

async function render(component, props) {
  const app = createSSRApp({ render: () => h(component, props) });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en } }));
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  return await renderToString(app);
}

const fieldOf = (descriptor, name = 'Title') => ({
  node: { id: 'fld_1', type: 'ctsField', data: { refId: 'fld_1', name, descriptor } },
  declareEdgeId: 'declares:fld_1-cls_1'
});

describe('DeclarationFieldRow', () => {
  it('renders the fact-row anatomy: muted name label, ink summary, identifier mark', async () => {
    const html = await render(DeclarationFieldRow, {
      field: fieldOf({ base: 'string', identifier: true }),
      summary: 'string'
    });
    expect(html).toContain('Title');
    expect(html).toMatch(/text-label[^"]*text-muted|text-muted[^"]*text-label/);
    expect(html).toContain('>string</span>');
    expect(html).toContain('p-tag');
    expect(html).toContain('Identifier');
  });

  it('keeps the row affordances quiet until the row is hovered or focused', async () => {
    const html = await render(DeclarationFieldRow, { field: fieldOf({ base: 'string' }), summary: 'string' });
    expect(html).toContain('[@media(hover:hover)]:opacity-60');
    expect(html).toContain('group-hover/field-row:opacity-100');
    expect(html).toContain('group-focus-within/field-row:opacity-100');
    expect(html).toContain('motion-reduce:transition-none');
  });

  it('renders the identifier mark only on the holder and hosts the descriptor editor when expanded', async () => {
    const plain = await render(DeclarationFieldRow, { field: fieldOf({ base: 'string' }), summary: 'string' });
    expect(plain).not.toContain('p-tag');
    expect(plain).not.toContain('Writable');

    const expanded = await render(DeclarationFieldRow, {
      field: fieldOf({ base: 'string' }),
      summary: 'string',
      expanded: true
    });
    expect(expanded).toContain('Writable');
  });
});

describe('DeclarationStateRow', () => {
  const stateOf = (data) => ({ node: { id: 'st_1', type: 'ctsState', data: { refId: 'st_1', ...data } }, entryEdgeIds: [] });

  it('renders the value as the severity-and-icon chip records wear', async () => {
    const html = await render(DeclarationStateRow, {
      state: stateOf({ value: 'draft', severity: 'warn', icon: 'pi pi-check' })
    });
    expect(html).toContain('draft');
    expect(html).toContain('p-tag');
    expect(html).toContain('pi-check');
  });

  it('renders the localized severity label in the select, never the raw enum', async () => {
    const html = await render(DeclarationStateRow, { state: stateOf({ value: 'draft', severity: 'warn' }) });
    expect(html).toContain('Warning');
    expect(html).not.toContain('>warn<');
  });
});

describe('DeclarationTransitionRow', () => {
  const states = [
    { node: { id: 'st_draft', type: 'ctsState', data: { value: 'draft', severity: 'warn' } }, entryEdgeIds: [] },
    { node: { id: 'st_published', type: 'ctsState', data: { value: 'published', severity: 'success' } }, entryEdgeIds: [] }
  ];
  const stateOptions = states.map(({ node }) => ({ label: node.data.value, value: node.data.value }));
  const entryOf = (sources, label = 'Publish', to = 'published') => ({
    node: { id: 'tr_1', type: 'processNode', data: { refId: 'tr_1' } },
    record: { id: 'tr_1', kind: 'cts.transition', label, inputDefaults: { state: to } },
    sources
  });

  it('renders one severity-styled chip per wiring-derived source state', async () => {
    const html = await render(DeclarationTransitionRow, {
      entry: entryOf(['draft', 'published']),
      states,
      stateOptions
    });
    expect(html).toContain('draft');
    expect(html).toContain('published');
    expect(html).toContain('Publish');
  });

  it('renders the any chip for a transition with no derived sources', async () => {
    const html = await render(DeclarationTransitionRow, {
      entry: entryOf([]),
      states,
      stateOptions
    });
    expect(html).toContain('any');
  });
});

describe('stateSeverityOptions', () => {
  it('localizes the severity vocabulary in both locales', () => {
    const enI18n = createI18n({ legacy: false, locale: 'en', messages: { en } });
    expect(stateSeverityOptions(enI18n.global.t).map(option => option.label))
      .toEqual(['Info', 'Success', 'Warning', 'Danger', 'Neutral']);
    const ruI18n = createI18n({ legacy: false, locale: 'ru', messages: { ru } });
    expect(stateSeverityOptions(ruI18n.global.t).map(option => option.label))
      .toEqual(['Информация', 'Успех', 'Предупреждение', 'Опасность', 'Нейтрально']);
  });
});
