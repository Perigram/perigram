// Presentation contract of the surface declaration authoring components
// (components/type-designer/README.md): the field authoring form composes
// the shared DescriptorEditor beside identifier/reorder/remove, the state
// authoring lane renders the severity-and-icon chips records wear with the
// localized severity vocabulary, transition rows render machine rows with
// per-source chips, and the save control is dirty-gated. SSR-mount pattern
// per sidebar-explorer.
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { describe, expect, it } from 'vitest';
import Re_L from '~/assets/presets/re_l';
import en from '~/i18n/locales/en.json';
import ru from '~/i18n/locales/ru.json';
import DeclarationFieldPanel from './DeclarationFieldPanel.vue';
import DeclarationStatePanel from './DeclarationStatePanel.vue';
import DeclarationStateRow from './DeclarationStateRow.vue';
import DeclarationTransitionRow from './DeclarationTransitionRow.vue';
import DeclarationSaveButton from './DeclarationSaveButton.vue';
import FieldNode from './FieldNode.vue';
import { stateSeverityOptions } from './state-severities.js';

async function render(component, props, provides = {}) {
  const app = createSSRApp({ render: () => h(component, props) });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en } }));
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  for (const [key, value] of Object.entries(provides)) app.provide(key, value);
  return await renderToString(app);
}

const sessionOf = (overrides = {}) => ({
  phase: { value: 'ready' },
  ready: { value: true },
  subtree: { value: overrides.subtree ?? null },
  dirty: { value: overrides.dirty ?? false },
  saving: { value: false },
  diagnostics: { value: overrides.diagnostics ?? [] },
  refusals: { value: overrides.refusals ?? [] },
  typeOptions: { value: overrides.typeOptions ?? [] },
  addStateCarrier: { value: overrides.addStateCarrier ?? 'transition' },
  save: () => {},
  addField: () => 'fld_new',
  renameField: () => {},
  setDescriptor: () => {},
  toggleIdentifier: () => {},
  moveField: () => {},
  removeWithGate: () => true,
  setStateValue: () => {},
  setStateLabel: () => {},
  setStateSeverity: () => {},
  setStateIcon: () => {},
  addState: () => {},
  stateValueOptions: () => overrides.stateOptions ?? [],
  retargetTransition: () => {},
  setTransitionIntent: () => {},
  addTransition: () => {}
});

const fieldOf = (descriptor, name = 'Title') => ({
  node: { id: 'fld_1', type: 'ctsField', data: { refId: 'fld_1', name, descriptor } },
  declareEdgeId: 'declares:fld_1-cls_1'
});

const subtreeOf = (fields) => ({ classNode: { id: 'cls_1' }, fields, states: [], transitions: [], constructs: [] });

describe('DeclarationFieldPanel', () => {
  it('composes the shared DescriptorEditor beside the author affordances', async () => {
    const html = await render(DeclarationFieldPanel, {
      authoring: sessionOf({ subtree: subtreeOf([fieldOf({ base: 'string' })]) }),
      field: fieldOf({ base: 'string' }),
      typeOptions: []
    });
    expect(html).toContain('Title');
    expect(html).toContain('Writable');
    expect(html).toContain('Identifier');
    expect(html).toContain('Move up');
    expect(html).toContain('Move down');
    expect(html).toContain('data-testid="field-author-remove"');
  });

  it('surfaces removal refusals and live diagnostics inline with the save row', async () => {
    const html = await render(DeclarationFieldPanel, {
      authoring: sessionOf({
        subtree: subtreeOf([fieldOf({ base: 'string' })]),
        refusals: ['state published is targeted by a transition'],
        diagnostics: ['class Widget: duplicate field Title'],
        dirty: true
      }),
      field: fieldOf({ base: 'string' })
    });
    expect(html).toContain('targeted by a transition');
    expect(html).toContain('duplicate field Title');
    expect(html).toContain('Unsaved changes');
    expect(html).toContain('data-testid="declaration-save"');
  });
});

describe('DeclarationStatePanel', () => {
  const states = [
    { node: { id: 'st_draft', type: 'ctsState', data: { value: 'draft', severity: 'warn' } }, entryEdgeIds: [] },
    { node: { id: 'st_published', type: 'ctsState', data: { value: 'published', severity: 'success' } }, entryEdgeIds: [] }
  ];
  const transitions = [{
    node: { id: 'tr_1', type: 'processNode', data: { refId: 'tr_1' } },
    record: { id: 'tr_1', kind: 'cts.transition', label: 'Publish', inputDefaults: { state: 'published' } },
    sources: ['draft']
  }];
  const subtree = { classNode: { id: 'cls_1' }, fields: [], states, transitions, constructs: [] };
  const stateOptions = states.map(({ node }) => ({ label: node.data.value, value: node.data.value }));

  it('renders the vocabulary, the add-state carrier consequence, and the machine view entry', async () => {
    const html = await render(DeclarationStatePanel, {
      authoring: sessionOf({ subtree, stateOptions, addStateCarrier: 'initial' })
    });
    expect(html).toContain('draft');
    expect(html).toContain('published');
    expect(html).toContain('becomes the construct');
    expect(html).toContain('State machine');
  });

  it('renders transitions over the live vocabulary with per-source chips', async () => {
    const html = await render(DeclarationStatePanel, {
      authoring: sessionOf({ subtree, stateOptions, addStateCarrier: 'transition' })
    });
    expect(html).toContain('Publish');
    expect(html).toContain('A transition to it is created');
    expect(html).toContain('Add transition');
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

  it('renders the localized severity label in the select', async () => {
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

describe('FieldNode', () => {
  it('renders accepted type labels through the enrichment resolver (SPEC §4)', async () => {
    const html = await render(FieldNode, {
      data: {
        name: 'Parent',
        descriptor: { base: 'ref', accepts: ['t-cassette', 't-sheet'] },
        fieldTypeLabelFor: id => ({ 't-cassette': 'Cassette', 't-sheet': 'Sheet' })[id] || id
      }
    });
    expect(html).toContain('Ref(Cassette|Sheet)');
    expect(html).not.toContain('t-cassette');
  });
});

describe('DeclarationSaveButton', () => {
  it('stays disabled until the session is dirty', async () => {
    const clean = await render(DeclarationSaveButton, { authoring: sessionOf() });
    expect(clean).toContain('disabled');
    const dirty = await render(DeclarationSaveButton, { authoring: sessionOf({ dirty: true }) });
    expect(dirty).toContain('data-testid="declaration-save"');
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
