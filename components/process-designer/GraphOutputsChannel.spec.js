import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Re_L from '~/assets/presets/re_l';
import GraphOutputsChannel from '~/components/process-designer/GraphOutputsChannel.vue';

// The outputs channel contract (SPEC §28.14): one evaluated output
// selected and rendered through the shared output view; the per-node
// listing is collapsed diagnostics; node errors stay first-plane.
const payload = {
  nodes: {
    n1: { outputs: { value: { branchCount: 1, itemCount: 1, branches: [{ path: [], items: ['# Report'] }] } } },
    n2: { outputs: { rows: { branchCount: 2, itemCount: 2, branches: [
      { path: [], items: [{ name: 'A' }] },
      { path: [], items: [{ name: 'B' }] }
    ] } }, error: 'capability refused' }
  }
};
const nodes = [
  { id: 'n1', data: { kindLabel: 'Compose', outputSpecs: [{ id: 'value', label: 'Value', type: { base: 'string' } }] } },
  { id: 'n2', data: { kindLabel: 'Query', outputSpecs: [{ id: 'rows', label: 'Rows', type: { base: 'json' } }] } }
];

const render = async (props = {}) => {
  const app = createSSRApp({
    render: () => h(GraphOutputsChannel, { payload, nodes, ...props })
  });
  app.use(createPinia());
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: {} }));
  app.config.warnHandler = () => {};
  app.config.globalProperties.$t = key => key;
  app.config.globalProperties.$te = () => false;
  return renderToString(app);
};

describe('outputs channel', () => {
  it('selects an output and renders its best view first', async () => {
    const html = await render();
    expect(html).toContain('<pre class="whitespace-pre-wrap break-words text-supporting"># Report</pre>');
    expect(html).toContain('Compose · Value');
    expect(html).toContain('>Text</span>');
  });

  it('keeps node errors out of the preview', async () => {
    const html = await render();
    expect(html).not.toContain('Query: capability refused');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('processDesigner.graphNodeOutputs');
  });

  it('prefers a scene output over an earlier text output', async () => {
    const html = await render({
      payload: {
        nodes: {
          n1: { outputs: { value: { branchCount: 1, itemCount: 1, branches: [{ path: [], items: ['first'] }] } } },
          n3: { outputs: { shape: { branchCount: 1, itemCount: 1, branches: [{
            path: [],
            items: [{ representation: 'perigram.scene-3d', vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 10]], faces: [[0, 1, 2]] }]
          }] } } }
        }
      },
      nodes: [
        { id: 'n1', data: { kindLabel: 'Text', outputSpecs: [{ id: 'value', label: 'Value', type: { base: 'string' } }] } },
        { id: 'n3', data: { kindLabel: 'Mesh', outputSpecs: [{ id: 'shape', label: 'Shape', type: { base: 'json' }, representation: 'perigram.scene-3d' }] } }
      ]
    });
    expect(html).toContain('data-scene-3d');
  });

  it('mounts the host scene viewer from the port representation', async () => {
    const html = await render({
      payload: {
        nodes: {
          n3: { outputs: { shape: { branchCount: 1, itemCount: 1, branches: [{
            path: [],
            items: [{ representation: 'perigram.scene-3d', vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 10]], faces: [[0, 1, 2]] }]
          }] } } }
        }
      },
      nodes: [{
        id: 'n3',
        data: {
          kindLabel: 'Mesh',
          outputSpecs: [{ id: 'shape', label: 'Shape', type: { base: 'json' }, representation: 'perigram.scene-3d' }]
        }
      }]
    });
    expect(html).toContain('data-scene-3d');
  });
});
