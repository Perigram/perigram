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

  it('composites the scene outputs of every node into one 3D scene', async () => {
    const html = await render({
      graph: {
        interface: {
          outputs: [{ id: 'number', label: 'Number', contract: { shape: 'item', semantic: { base: 'number' } } }]
        },
        nodes: [
          { id: 'plate', operation: { provider: 'plugin.cad-occt', id: 'tessellate-shape', version: '1' }, config: {}, position: { x: 0, y: 0 } },
          { id: 'tool', operation: { provider: 'plugin.cad-occt', id: 'tessellate-shape', version: '1' }, config: {}, position: { x: 0, y: 200 } }
        ],
        edges: []
      },
      result: {
        outputs: { number: 0 },
        nodeOutputs: {
          plate: { value: { representation: 'perigram.scene-3d', vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 10]], faces: [[0, 1, 2]] } },
          tool: { value: { representation: 'perigram.scene-3d', vertices: [[0, 0, 20], [10, 0, 20], [10, 10, 20]], faces: [[0, 1, 2]] } }
        }
      },
      nodeDefinitions: {
        plate: { provider: 'plugin.cad-occt', label: 'Tessellate', outputs: [{ id: 'value', label: 'Value', semantic: { base: 'json' } }] },
        tool: { provider: 'plugin.cad-occt', label: 'Tessellate', outputs: [{ id: 'value', label: 'Value', semantic: { base: 'json' } }] }
      }
    });
    expect((html.match(/data-scene-3d/g) || []).length).toBe(1);
    expect(html).toContain('3D scene');
    expect(html).not.toContain('Tessellate · Value');
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
