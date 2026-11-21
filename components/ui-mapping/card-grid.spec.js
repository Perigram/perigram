// Mount CardGrid through vue/server-renderer with the instances store
// active and assert the grid renders the passed instances — the DataView
// value must bind the instances prop, not a store binding of the same
// name.
import { describe, it, expect, beforeEach } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import CardGrid from '~/components/ui-mapping/CardGrid.vue';

const i18n = createI18n({ legacy: false, messages: { en: {} } });

const type = {
  id: 'graph-document',
  class: 'file',
  name: 'Graph',
  identifier: 'name',
  payload: { preview: 'graph' },
  fields: {
    name: { base: 'string', identifier: true },
    graphId: { base: 'string', display: 'hidden' }
  }
};

const instance = index => ({
  id: `graph-${index}`,
  type: type.id,
  state: null,
  lineage: {},
  relations: {},
  fields: { name: `Graph ${index}`, graphId: 'graph-1' },
  payload: { fileId: `file-${index}`, mime: 'application/json', size: 100, name: `graph-${index}.perigram-graph` }
});

function mount(props) {
  const app = createSSRApp({ render: () => h(CardGrid, props) });
  app.use(i18n);
  return renderToString(app);
}

describe('CardGrid instance rendering', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders every passed instance through the DataView value', async () => {
    const html = await mount({
      instances: [instance(1), instance(2)],
      type,
      openable: true,
      pool: {},
      bundle: { types: [type] }
    });
    expect(html).toContain('Graph 1');
    expect(html).toContain('Graph 2');
  });
});
