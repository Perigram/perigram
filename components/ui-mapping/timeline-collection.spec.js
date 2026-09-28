// Mount TimelineCollection through vue/server-renderer with the app's
// stub seam (test-tools) and assert the left-anchoring + truncation.
import { describe, it, expect } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import TimelineCollection from '~/components/ui-mapping/TimelineCollection.vue';

const i18n = createI18n({ legacy: false, messages: { en: {} } });

const type = {
  id: 'log', class: 'file', name: 'Log',
  identifier: 'name',
  fields: {
    name: { base: 'string', identifier: true },
    body: { base: 'string', multiline: true }
  }
};

function mount(props) {
  const app = createSSRApp({ render: () => h(TimelineCollection, props) });
  app.use(i18n);
  return renderToString(app);
}

describe('TimelineCollection left anchoring', () => {
  it('hides the empty opposite column and bounds the identity link', async () => {
    const html = await mount({
      instances: [
        { id: '1', type: 'log', state: null, lineage: {}, relations: {}, fields: { name: 'A very long identity label that must not overflow its row', body: 'first' } },
        { id: '2', type: 'log', state: null, lineage: {}, relations: {}, fields: { name: 'short', body: 'second' } }
      ],
      type,
      openable: true,
      pool: {},
      bundle: { types: [type] }
    });
    expect(html).toMatch(/display:\s*none/);
    expect(html).toMatch(/min-w-0 max-w-full/);
    expect(html).toContain('truncate');
  });
});
