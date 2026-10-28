// Mount smoke for the sheet-design editor surface: the factory's setup
// path (immediate record watch, geometry, history) and render tree must
// survive a full render — the TDZ class of setup-order bugs never
// reaches the browser again.
import { describe, it, expect } from 'vitest';
import { createSSRApp, h, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';
import createSurface from './sheet-design-editor.mjs';

const stub = (props, { slots }) => (slots?.default ? slots.default() : null);

function mountContext() {
  return {
    vue: { h, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent },
    components: {
      Button: stub, Checkbox: stub, InputNumber: stub, InputText: stub,
      Popover: stub, SpeedDial: stub, Tag: stub, InstanceSelect: stub,
      InstanceInlineRef: stub, DesignerSurface: stub, DesignerWorkspace: stub
    },
    locale: { t: key => key, te: () => true, locale: ref('en') },
    queries: { list: async () => [] },
    notify: () => {},
    access: { canWrite: () => true },
    open: { instance: () => {} }
  };
}

const record = {
  _id: 'sheet-1',
  fields: {
    name: 'Drill sheet',
    geometry: { data: { items: [], layouts: [{ placed_items: [] }] } }
  }
};

describe('sheet-design-editor surface mount', () => {
  it('renders the opened record without a contract-4 host throwing', async () => {
    const surface = createSurface(mountContext());
    const app = createSSRApp(surface, { record, persistence: { patch: async () => {}, rename: async () => {} } });
    const html = await renderToString(app);
    expect(html).toContain('sheetDesign.editor');
  });

  it('throws the contract error for a mount context missing open', () => {
    const context = mountContext();
    delete context.open;
    expect(() => createSurface(context)).toThrow(/contract-4 mount context/);
  });
});
