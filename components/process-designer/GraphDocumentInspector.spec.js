import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import Re_L from '~/assets/presets/re_l';
import GraphDocumentInspector from '~/components/process-designer/GraphDocumentInspector.vue';
import { GRAPH_OUTPUT_OPERATION } from '@perigram/core';

const i18n = createI18n({
  legacy: false,
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: { processDesigner: { graphInterfaceConsumers: 'Used by {graphs}. Pinned invocations keep their interface.' } } }
});

const boundaryNode = {
  id: 'boundary-1',
  data: {
    label: 'Result',
    operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' },
    config: { interfaceId: 'port-1' }
  }
};

const render = async (props) => {
  const app = createSSRApp({ render: () => h(GraphDocumentInspector, props) });
  app.use(i18n);
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.config.warnHandler = () => {};
  return renderToString(app);
};

describe('graph document inspector boundary declarations', () => {
  it('commits declarations from the controls without an apply action', async () => {
    const html = await render({
      node: boundaryNode,
      boundaryDeclaration: { contract: { shape: 'item', semantic: { base: 'number' } }, required: true }
    });
    expect(html).toContain('p-toggleswitch');
    expect(html).not.toContain('graphApplyInterfaceDeclaration');
    expect(html).not.toMatch(/>Apply interface declaration</);
  });

  it('names the consuming graphs that pin the edited graph', async () => {
    const html = await render({
      node: boundaryNode,
      boundaryDeclaration: { contract: { shape: 'item', semantic: { base: 'number' } }, required: true },
      consumerGraphs: [{ id: 'graph-2', name: 'Report runner' }]
    });
    expect(html).toContain('Used by Report runner');
  });

  it('renders no consumer warning without pinned consumers', async () => {
    const html = await render({
      node: boundaryNode,
      boundaryDeclaration: { contract: { shape: 'item', semantic: { base: 'number' } }, required: true }
    });
    expect(html).not.toContain('Used by');
  });
});
