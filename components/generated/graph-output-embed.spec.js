// The graph-output embed's render policy: a frozen block renders its
// retained snapshot with no resolution, a parameterized block renders the
// pages references seam's answer for its block, and every other block
// resolves its pinned execution live through the collection-outputs
// transport.
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import Re_L from '~/assets/presets/re_l';
import GraphOutputEmbed from './GraphOutputEmbed.vue';
import { collectionEmbedView, frozenCollectionEmbed, liveGraphEmbed, retainedCollectionEmbed } from './graph-output-embed-contract.js';
import en from '~/i18n/locales/en.json';

vi.mock('~/components/shared/InstanceInlineRef.vue', async () => {
  const { defineComponent, h: render } = await import('vue');
  return {
    default: defineComponent({
      props: ['type', 'id', 'entity', 'fetch'],
      setup(props) {
        return () => render('article', {
          'data-instance-ref': props.id,
          'data-type-id': props.type,
          'data-entity-id': props.entity?._id,
          'data-fetch': String(props.fetch)
        });
      }
    })
  };
});

globalThis.$fetch = vi.fn(async () => ({}));
globalThis.useState = (_key, init) => ref(typeof init === 'function' ? init() : init || {});

const SOURCE = {
  kind: 'graph-output',
  executionInstanceId: 'execution-1',
  graphDocumentInstanceId: 'graph-1',
  graphId: 'graph.report',
  graphRevision: 'rev-2',
  outputId: 'rows'
};

const SNAPSHOT = {
  label: 'Rows',
  itemCount: 2,
  truncated: true,
  items: [{ kind: 'value', value: 'frozen-row' }, { kind: 'unavailable' }]
};

async function renderEmbed({ collection, resolution = null } = {}) {
  const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en } });
  const app = createSSRApp({ render: () => h(GraphOutputEmbed, { collection, resolution }) });
  app.use(i18n);
  app.use(createPinia());
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ToastService);
  app.use(ConfirmationService);
  return await renderToString(app);
}

describe('graph output embed', () => {
  it('serves the frozen snapshot, the page resolution, or the live fetch by block mode', () => {
    expect(collectionEmbedView({ collection: { source: SOURCE, parameters: {}, snapshot: SNAPSHOT } }))
      .toEqual({ phase: 'ready', mode: 'frozen', result: SNAPSHOT });
    expect(collectionEmbedView({ collection: { source: SOURCE, parameters: { limit: 20 } } }))
      .toEqual({ phase: 'loading', mode: 'parameterized' });
    expect(collectionEmbedView({ collection: { source: SOURCE, parameters: { limit: 20 } }, resolution: { blockId: 'c', status: 'unavailable' } }))
      .toEqual({ phase: 'unavailable', mode: 'parameterized' });
    const resolved = { blockId: 'c', status: 'resolved', label: 'Rows', itemCount: 1, items: [{ kind: 'value', value: 'bound' }] };
    expect(collectionEmbedView({ collection: { source: SOURCE, parameters: { limit: 20 } }, resolution: resolved }))
      .toEqual({ phase: 'ready', mode: 'parameterized', result: resolved });
    expect(collectionEmbedView({ collection: { source: SOURCE, parameters: {} }, loading: true }))
      .toEqual({ phase: 'loading', mode: 'pinned' });
    const live = { label: 'Rows', itemCount: 0, items: [] };
    expect(collectionEmbedView({ collection: { source: SOURCE, parameters: {} }, live }))
      .toEqual({ phase: 'ready', mode: 'pinned', result: live });
    expect(collectionEmbedView({ collection: { source: SOURCE, parameters: {} } }))
      .toEqual({ phase: 'unavailable', mode: 'pinned' });
  });

  it('serves a live embed from its page resolution entry alone', () => {
    const liveSource = {
      kind: 'graph-output',
      graphDocumentInstanceId: 'graph-1',
      graphId: 'graph.report',
      graphRevision: 'rev-2',
      outputId: 'rows'
    };
    expect(collectionEmbedView({ collection: { source: liveSource, parameters: {}, resultPolicy: 'live' } }))
      .toEqual({ phase: 'loading', mode: 'live' });
    expect(collectionEmbedView({ collection: { source: liveSource, parameters: { limit: 2 }, resultPolicy: 'live' }, resolution: { blockId: 'c', status: 'unavailable' } }))
      .toEqual({ phase: 'unavailable', mode: 'live' });
    const resolved = { blockId: 'c', status: 'resolved', label: 'Rows', itemCount: 1, items: [] };
    expect(collectionEmbedView({ collection: { source: liveSource, parameters: {}, resultPolicy: 'live' }, resolution: resolved }))
      .toEqual({ phase: 'ready', mode: 'live', result: resolved });
  });

  it('authors live picks at the pinned revision and frozen picks with the captured collection', () => {
    expect(retainedCollectionEmbed({ executionInstanceId: 'execution-1', graphDocumentInstanceId: 'graph-1', graphId: 'graph.report', graphRevision: 'rev-2', outputId: 'rows', label: 'Rows' }))
      .toEqual({ source: SOURCE, parameters: {}, resultPolicy: 'pinned' });
    expect(frozenCollectionEmbed(
      { executionInstanceId: 'execution-1', graphDocumentInstanceId: 'graph-1', graphId: 'graph.report', graphRevision: 'rev-2', outputId: 'rows', label: 'Rows' },
      { label: 'Rows', itemCount: 2, truncated: true, items: SNAPSHOT.items }
    )).toEqual({ source: SOURCE, parameters: {}, resultPolicy: 'frozen', snapshot: SNAPSHOT });
  });

  it('renders a frozen snapshot without resolving anything', async () => {
    globalThis.$fetch.mockClear();
    const html = await renderEmbed({ collection: { source: SOURCE, parameters: {}, snapshot: SNAPSHOT, resultPolicy: 'frozen' } });
    expect(html).toContain('>Rows · 2<');
    expect(html).toContain('>frozen-row<');
    expect(html).toContain('unavailable');
    expect(globalThis.$fetch).not.toHaveBeenCalled();
  });

  it('renders frozen record items through the instance ref with the captured projection', async () => {
    globalThis.$fetch.mockClear();
    const snapshot = { label: 'Rows', itemCount: 2, truncated: false, items: [
      { kind: 'record', typeId: 'part', instanceId: 'part-1', instance: { _id: 'part-1', type: 'part', fields: { code: 'A' } } },
      { kind: 'unavailable' }
    ] };
    const html = await renderEmbed({ collection: { source: SOURCE, parameters: {}, snapshot, resultPolicy: 'frozen' } });
    expect(html).toContain('data-instance-ref="part-1"');
    expect(html).toContain('data-type-id="part"');
    expect(html).toContain('data-entity-id="part-1"');
    expect(html).toContain('data-fetch="false"');
    expect(html).toContain('unavailable');
    expect(globalThis.$fetch).not.toHaveBeenCalled();
  });

  it('renders a parameterized embed from its page resolution entry without fetching', async () => {
    globalThis.$fetch.mockClear();
    const html = await renderEmbed({
      collection: { source: SOURCE, parameters: { limit: 20 }, resultPolicy: 'pinned' },
      resolution: { blockId: 'c', status: 'resolved', label: 'Rows', itemCount: 1, items: [{ kind: 'value', value: 'bound-row' }] }
    });
    expect(html).toContain('>bound-row<');
    expect(globalThis.$fetch).not.toHaveBeenCalled();
  });

  it('renders the unavailable state for a parameterized embed the page could not resolve', async () => {
    const html = await renderEmbed({
      collection: { source: SOURCE, parameters: { limit: 20 }, resultPolicy: 'pinned' },
      resolution: { blockId: 'c', status: 'unavailable' }
    });
    expect(html).toContain('Graph result is unavailable');
  });

  it('resolves an unparameterized embed live through the collection-outputs transport', async () => {    globalThis.$fetch.mockClear();
    await renderEmbed({ collection: { source: SOURCE, parameters: {}, resultPolicy: 'pinned' } });
    expect(globalThis.$fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.$fetch).toHaveBeenCalledWith('/api/graph-executions/collection-outputs/execution-1/rows', {
      query: { graphDocumentInstanceId: 'graph-1', graphId: 'graph.report', graphRevision: 'rev-2' }
    });
  });

  it('authors a live embed from the graph, revision, output, and parameters', () => {
    expect(liveGraphEmbed(
      { graphDocumentInstanceId: 'graph-1', graphId: 'graph.report', graphRevision: 'rev-2' },
      { id: 'rows' },
      { limit: 2 }
    )).toEqual({
      source: {
        kind: 'graph-output',
        graphDocumentInstanceId: 'graph-1',
        graphId: 'graph.report',
        graphRevision: 'rev-2',
        outputId: 'rows'
      },
      parameters: { limit: 2 },
      resultPolicy: 'live'
    });
  });

  it('renders a live embed from its resolution entry without fetching', async () => {
    globalThis.$fetch.mockClear();
    const html = await renderEmbed({
      collection: {
        source: { kind: 'graph-output', graphDocumentInstanceId: 'graph-1', graphId: 'graph.report', graphRevision: 'rev-2', outputId: 'rows' },
        parameters: {},
        resultPolicy: 'live'
      },
      resolution: { blockId: 'c', status: 'resolved', label: 'Rows', itemCount: 2, items: [{ kind: 'value', value: 'live-row' }] }
    });
    expect(html).toContain('>live-row<');
    expect(globalThis.$fetch).not.toHaveBeenCalled();
  });

  it('renders structured values through the representation contract', async () => {
    globalThis.$fetch.mockClear();
    const html = await renderEmbed({
      collection: { source: SOURCE, parameters: {}, snapshot: {
        label: 'Rows', itemCount: 3, truncated: false,
        items: [
          { kind: 'value', value: 'plain text' },
          { kind: 'value', value: [{ name: 'a', qty: 1 }, { name: 'b', qty: 2 }] },
          { kind: 'value', value: { nested: true } }
        ]
      }, resultPolicy: 'frozen' }
    });
    expect(html).toContain('plain text');
    expect(html).toContain('<td');
    expect(html).toContain('>a<');
    expect(html).toMatch(/<pre[^>]*>\s*\{\s*(?:&quot;|")nested(?:&quot;|")\s*:\s*true/);
    expect(globalThis.$fetch).not.toHaveBeenCalled();
  });
});
