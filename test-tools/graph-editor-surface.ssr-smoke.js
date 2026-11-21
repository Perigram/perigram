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
import { useGraphDocumentSession } from '~/composables/useGraphDocumentSession.js';

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

async function renderSurface({ mode = 'edit', record = null, session = null, persistence = null, pageChrome = null } = {}) {
  const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en: {} } });
  const chrome = pageChrome || chromeChannel();
  const app = createSSRApp({
    render: () => h(GraphEditorSurface, {
      record,
      typeId: 'graph-document',
      persistence: persistence || payloadPersistence(),
      mode,
      pageChrome: chrome,
      ...(session ? { session } : {})
    })
  });
  app.use(createPinia());
  app.use(i18n);
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ToastService);
  app.directive('tooltip', { getSSRProps: () => ({}) });
  const html = await renderToString(app);
  return { html, pageChrome: chrome };
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

  it('tracks dirty state through edits and saves blank-first create then update', async () => {
    const session = useGraphDocumentSession({ t: key => key });
    const pageChrome = chromeChannel();
    const saves = [];
    const persistence = {
      load: async () => null,
      save: vi.fn(async (payload, filename) => {
        const record = { _id: 'graph-created', name: 'First graph' };
        saves.push({ created: saves.length === 0, payload, filename });
        return record;
      }),
      rename: vi.fn(async name => ({ _id: 'graph-created', name }))
    };
    await renderSurface({ session, persistence, pageChrome, record: null });

    expect(pageChrome.api.dirty).toBe(false);
    pageChrome.api.rename('First graph');
    expect(pageChrome.api.dirty).toBe(true);
    expect(persistence.rename).not.toHaveBeenCalled();

    const boundaries = session.paletteGroups.value[0].items;
    const input = session.addNode(boundaries[0], { x: 0, y: 0 });
    session.updateBoundaryDeclaration(input.id, {
      contract: { shape: 'item', semantic: { base: 'string' } },
      required: true
    });
    const output = session.addNode(boundaries[1], { x: 240, y: 0 });
    session.onConnect({ source: input.id, sourceHandle: 'value', target: output.id, targetHandle: 'value' });
    session.setGraphInputBinding({ portId: session.graphDocument.value.interface.inputs[0].id, value: 'seed' });

    const firstSave = pageChrome.api.save();
    expect(pageChrome.api.saving).toBe(true);
    await firstSave;

    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ created: true, filename: 'First graph.perigram-graph' });
    const firstPayload = JSON.parse(saves[0].payload);
    expect(firstPayload.name).toBe('First graph');
    expect(firstPayload.format).toBe('perigram.graph');
    expect(pageChrome.api.dirty).toBe(false);

    session.updateBoundaryLabel(input.id, 'Seed text');
    expect(pageChrome.api.dirty).toBe(true);
    await pageChrome.api.save();
    expect(saves).toHaveLength(2);
    expect(saves[1]).toMatchObject({ created: false, filename: 'First graph.perigram-graph' });
    const secondPayload = JSON.parse(saves[1].payload);
    expect(secondPayload.id).toBe(firstPayload.id);
    expect(secondPayload.revision).not.toBe(firstPayload.revision);
    expect(pageChrome.api.dirty).toBe(false);

    pageChrome.api.rename('Renamed graph');
    expect(persistence.rename).toHaveBeenCalledWith('Renamed graph');
  });

  it('refuses to save an invalid graph payload', async () => {
    const session = useGraphDocumentSession({ t: key => key });
    const pageChrome = chromeChannel();
    const persistence = {
      load: async () => null,
      save: vi.fn(async () => ({})),
      rename: vi.fn()
    };
    await renderSurface({ session, persistence, pageChrome, record: null });
    const boundaries = session.paletteGroups.value[0].items;
    session.addNode(boundaries[0], { x: 0, y: 0 });
    session.edges.value = [{
      id: 'dangling-edge',
      source: 'node-missing',
      sourceHandle: 'value',
      target: 'node-also-missing',
      targetHandle: 'value',
      type: 'default'
    }];

    expect(pageChrome.api.dirty).toBe(true);
    await pageChrome.api.save();

    expect(persistence.save).not.toHaveBeenCalled();
    expect(pageChrome.api.saving).toBe(false);
    expect(pageChrome.api.dirty).toBe(true);
  });
});
