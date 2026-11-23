import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import GraphOutputView from '~/components/shared/GraphOutputView.vue';

// The output-value renderer contract (SPEC §28.14): a value renders its
// best supported view by default; raw JSON is the explicit fallback.
const render = async (props) => {
  const app = createSSRApp({ render: () => h(GraphOutputView, props) });
  app.config.warnHandler = () => {};
  app.use(createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en: {} } }));
  return renderToString(app);
};

describe('graph output value renderer', () => {
  it('renders string values through the Markdown view with text as an explicit view', async () => {
    const html = await render({ value: '# Hello' });
    expect(html).not.toContain('&quot;');
    expect(html).not.toContain('<pre');
    expect(await render({ value: '# Hello', view: 'text' })).toContain('# Hello');
  });

  it('renders record lists as tables', async () => {
    const html = await render({ value: [{ name: 'First' }, { name: 'Second' }] });
    expect(html).toContain('<table');
    expect(html).toContain('First');
    expect(html).toContain('Second');
  });

  it('renders image values as images', async () => {
    const html = await render({ value: { fileId: 'f1', mime: 'image/png' }, alt: 'Render' });
    expect(html).toContain('<img');
    expect(html).toContain('f1');
  });

  it('renders inline file payloads through their declared preview mode', async () => {
    const html = await render({
      value: { payload: { base64: 'YWJj', mime: 'application/pdf', name: 'report.pdf' } },
      alt: 'Report'
    });
    expect(html).toContain('data-file-payload-viewer');
    expect(html).toContain('data-viewer-mode="pdf"');
    expect(html).not.toContain('&quot;base64&quot;');
  });

  it('renders inline image payloads as images', async () => {
    const html = await render({
      value: { payload: { base64: 'YWJj', mime: 'image/png', name: 'preview.png' } },
      alt: 'Preview'
    });
    expect(html).toContain('<img');
    expect(html).toContain('data:image/png;base64,YWJj');
  });

  it('mounts the interactive viewer for 3D scene values', async () => {
    const html = await render({
      value: {
        representation: 'perigram.scene-3d',
        vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 10]],
        faces: [[0, 1, 2]]
      },
      alt: 'Mesh'
    });
    expect(html).toContain('data-scene-3d');
    expect(html).toContain('<canvas');
  });

  it('renders numeric and boolean values as text', async () => {
    expect(await render({ value: 42 })).toContain('42');
    expect(await render({ value: false })).toContain('false');
    expect(await render({ value: 42 })).not.toContain('&quot;');
  });

  it('mounts the interactive canvas for 2D scene values', async () => {
    const html = await render({
      value: { representation: 'perigram.scene-2d', primitives: [{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }] },
      alt: 'Drawing'
    });
    expect(html).toContain('data-scene-2d');
    expect(html).toContain('<line');
  });

  it('uses the selected output port representation for the viewer choice', async () => {
    const html = await render({
      value: { vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 10]], faces: [[0, 1, 2]] },
      representation: 'perigram.scene-3d',
      alt: 'Mesh'
    });
    expect(html).toContain('data-scene-3d');
  });

  it('lets the scene viewer fill its parent when asked', async () => {
    const html = await render({
      value: { vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 10]], faces: [[0, 1, 2]] },
      representation: 'perigram.scene-3d',
      fill: true
    });
    expect(html).toContain('h-full min-h-48');
  });

  it('falls back to JSON for structured values without a better view', async () => {
    const html = await render({ value: { a: 1 } });
    expect(html).toContain('&quot;a&quot;: 1');
  });

  it('honors an explicit JSON choice over the best view', async () => {
    const html = await render({ value: 'plain text', view: 'json' });
    expect(html).toContain('&quot;plain text&quot;');
  });
});
