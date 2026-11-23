import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Re_L from '~/assets/presets/re_l';
import GraphDocumentInspector from '~/components/process-designer/GraphDocumentInspector.vue';
import { GRAPH_INPUT_OPERATION, GRAPH_OUTPUT_OPERATION } from '@perigram/core';

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

const inputNode = {
  id: 'input-1',
  data: {
    label: 'Amount',
    operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' },
    config: { interfaceId: 'input-port' }
  }
};

const outputNode = {
  id: 'output-1',
  data: {
    label: 'Shape',
    operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' },
    config: { interfaceId: 'output-port' }
  }
};

const render = async (props) => {
  const app = createSSRApp({ render: () => h(GraphDocumentInspector, props) });
  app.use(createPinia());
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

  it('renders the graph input binding in the Graph Input node inspector', async () => {
    const html = await render({
      node: inputNode,
      boundaryDeclaration: { contract: { shape: 'item', semantic: { base: 'number' } }, required: false },
      graphInputs: [{
        id: 'input-port',
        label: 'Amount',
        contract: { shape: 'item', semantic: { base: 'number' } },
        required: false,
        default: 0
      }],
      inputBindings: {}
    });
    expect(html).toContain('data-graph-input-binding');
    expect(html).toContain('graph-input-input-port');
  });

  it('renders the selected node evaluation error', async () => {
    const html = await render({
      node: { ...outputNode, data: { ...outputNode.data, error: 'Node output-1 is missing required input document' } },
      boundaryDeclaration: { contract: { shape: 'item', semantic: { base: 'json' } }, required: true },
      graphOutputs: [{ id: 'output-port', label: 'Shape', contract: { shape: 'item', semantic: { base: 'json' } }, required: true }]
    });
    expect(html).toContain('Node output-1 is missing required input document');
  });

  it('renders the selected node output in the inspector', async () => {
    const html = await render({
      node: {
        id: 'mesh',
        data: {
          label: 'Tessellate',
          definition: {
            provider: 'plugin.cad-occt',
            id: 'tessellate-shape',
            version: '1',
            outputs: [{ id: 'value', label: 'Value', semantic: { base: 'json', representation: 'perigram.scene-3d' } }]
          }
        }
      },
      nodeOutput: {
        value: { representation: 'perigram.scene-3d', vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 10]], faces: [[0, 1, 2]] }
      }
    });
    expect(html).toContain('data-node-output-preview');
    expect(html).toContain('data-scene-3d');
  });

  it('renders Bake in the Graph Output node inspector', async () => {
    const html = await render({
      node: outputNode,
      boundaryDeclaration: { contract: { shape: 'item', semantic: { base: 'json' } }, required: true },
      graphOutputs: [{
        id: 'output-port',
        label: 'Shape',
        contract: { shape: 'item', semantic: { base: 'json' } },
        required: true
      }],
      execution: { status: 'succeeded', profile: 'procedural-preview' }
    });
    expect(html).toContain('data-graph-output-bake');
    expect(html).toContain('graph-bake-page');
  });
});
