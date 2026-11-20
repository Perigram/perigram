import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import GraphOutputView from '~/components/process-designer/GraphOutputView.vue';

// The output-value renderer contract (SPEC §28.14): a value renders its
// best supported view by default; raw JSON is the explicit fallback.
const render = async (props) => {
  const app = createSSRApp({ render: () => h(GraphOutputView, props) });
  app.config.warnHandler = () => {};
  return renderToString(app);
};

describe('graph output value renderer', () => {
  it('renders text values as text, not JSON', async () => {
    const html = await render({ value: '# Hello' });
    expect(html).toContain('# Hello');
    expect(html).not.toContain('&quot;');
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

  it('falls back to JSON for structured values without a better view', async () => {
    const html = await render({ value: { a: 1 } });
    expect(html).toContain('&quot;a&quot;: 1');
  });

  it('honors an explicit JSON choice over the best view', async () => {
    const html = await render({ value: 'plain text', view: 'json' });
    expect(html).toContain('&quot;plain text&quot;');
  });
});
