import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Re_L from '~/assets/presets/re_l';
import GraphDocumentPreviewPanel from '~/components/process-designer/GraphDocumentPreviewPanel.vue';

const graph = {
  interface: {
    outputs: [{
      id: 'shape',
      label: 'Shape',
      contract: { shape: 'item', semantic: { base: 'json', representation: 'perigram.scene-3d' } }
    }]
  },
  nodes: [
    { id: 'mesh', operation: { provider: 'plugin.engine-demo', id: 'make-mesh', version: '1' }, config: {}, position: { x: 0, y: 0 } },
    { id: 'output', operation: { provider: 'perigram.core', id: 'perigram.core.graph-output', version: '1' }, config: { interfaceId: 'shape' }, position: { x: 320, y: 0 } }
  ],
  edges: [{ id: 'edge-1', source: { node: 'mesh', port: 'shape' }, target: { node: 'output', port: 'value' } }]
};

const result = {
  outputs: {
    shape: { representation: 'perigram.scene-3d', vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 10]], faces: [[0, 1, 2]] }
  },
  nodeOutputs: {}
};

const render = async (props) => {
  const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en: {} } });
  const app = createSSRApp({ render: () => h(GraphDocumentPreviewPanel, props) });
  app.use(createPinia());
  app.use(i18n);
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.config.warnHandler = () => {};
  return renderToString(app);
};

describe('graph document preview panel', () => {
  it('renders the selected output through the filling scene viewer', async () => {
    const html = await render({ graph, result, execution: { status: 'succeeded', profile: 'procedural-preview', id: 'execution-1' } });
    expect(html).toContain('data-scene-3d');
    expect(html).toContain('h-full min-h-48');
  });

  it('carries the viewer and compact output controls', async () => {
    const html = await render({ graph, result, execution: { status: 'succeeded', profile: 'procedural-preview', id: 'execution-1' } });
    expect(html).not.toContain('data-graph-input-binding');
    expect(html).not.toContain('data-graph-output-bake');
    expect(html).not.toContain('processDesigner.graphNodeOutputs');
  });

  it('prefers a declared scene output over an earlier text output', async () => {
    const html = await render({
      graph: {
        interface: {
          outputs: [
            { id: 'text', label: 'Text', contract: { shape: 'item', semantic: { base: 'string' } } },
            { id: 'shape', label: 'Shape', contract: { shape: 'item', semantic: { base: 'json', representation: 'perigram.scene-3d' } } }
          ]
        },
        nodes: [],
        edges: []
      },
      result: {
        outputs: {
          text: 'first',
          shape: { representation: 'perigram.scene-3d', vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 10]], faces: [[0, 1, 2]] }
        },
        nodeOutputs: {}
      }
    });
    expect(html).toContain('data-scene-3d');
  });

  it('selects a scene output by its evaluated value when the port carries no representation', async () => {
    const html = await render({
      graph: {
        interface: {
          outputs: [
            { id: 'text', label: 'Text', contract: { shape: 'item', semantic: { base: 'string' } } },
            { id: 'shape', label: 'Shape', contract: { shape: 'item', semantic: { base: 'json' } } }
          ]
        },
        nodes: [],
        edges: []
      },
      result: {
        outputs: {
          text: 'first',
          shape: { representation: 'perigram.scene-3d', vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 10]], faces: [[0, 1, 2]] }
        },
        nodeOutputs: {}
      }
    });
    expect(html).toContain('data-scene-3d');
  });

  it('offers evaluated node outputs beside the declared graph outputs', async () => {
    const html = await render({
      graph: {
        interface: {
          outputs: [{ id: 'number', label: 'Number', contract: { shape: 'item', semantic: { base: 'number' } } }]
        },
        nodes: [
          { id: 'mesh', operation: { provider: 'plugin.cad-occt', id: 'tessellate-shape', version: '1' }, config: {}, position: { x: 0, y: 0 } }
        ],
        edges: []
      },
      result: {
        outputs: { number: 0 },
        nodeOutputs: {
          mesh: { value: { representation: 'perigram.scene-3d', vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 10]], faces: [[0, 1, 2]] } }
        }
      },
      nodeDefinitions: {
        mesh: {
          provider: 'plugin.cad-occt',
          label: 'Tessellate',
          outputs: [{ id: 'value', label: 'Value', semantic: { base: 'json', representation: 'perigram.scene-3d' } }]
        }
      }
    });
    expect(html).toContain('data-scene-3d');
    expect(html).toContain('Tessellate · Value');
  });

  it('prefers a node output with a mounted plugin renderer over the declared output', async () => {
    const OcctPreview = props => h('div', { 'data-occt-preview': '' }, props.value?.handle || '');
    const html = await render({
      graph: {
        interface: {
          outputs: [{ id: 'number', label: 'Number', contract: { shape: 'item', semantic: { base: 'number' } } }]
        },
        nodes: [
          { id: 'box', operation: { provider: 'plugin.cad-occt', id: 'make-box', version: '1' }, config: {}, position: { x: 0, y: 0 } }
        ],
        edges: []
      },
      result: {
        outputs: { number: 0 },
        nodeOutputs: { box: { value: { handle: 'occt-1', brep: 'BREP' } } }
      },
      nodeDefinitions: {
        box: {
          provider: 'plugin.cad-occt',
          label: 'Box',
          outputs: [{ id: 'value', label: 'Value', semantic: { base: 'json', kind: 'geometry.occt.shape' } }],
          preview: { renderer: 'occt-shape' }
        }
      },
      previewRenderers: { 'plugin.cad-occt:occt-shape': OcctPreview }
    });
    expect(html).toContain('data-occt-preview');
    expect(html).toContain('occt-1');
  });

  it('renders the empty state for a graph without outputs', async () => {
    const html = await render({
      graph: { interface: { outputs: [] }, nodes: [], edges: [] },
      result: { outputs: {}, nodeOutputs: {} }
    });
    expect(html).toContain('processDesigner.noPreviewOutputs');
    expect(html).not.toContain('data-scene-3d');
  });
});
