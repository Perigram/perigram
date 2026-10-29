// Mount smoke for the sheet-design editor surface: the factory's setup
// path (immediate record watch, geometry, history) and render tree must
// survive a full render — the TDZ class of setup-order bugs never
// reaches the browser again. The inspector structure spec pins the
// working set on instance tiles with lineage (the InstanceInlineRef
// tile variant) and pick-to-add pickers.
import { describe, it, expect } from 'vitest';
import { createSSRApp, h, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';
import createSurface from './sheet-design-editor.mjs';

const stub = (props, { slots }) => (slots?.default ? slots.default() : null);
const renderAllSlots = (props, { slots }) => h('div', {},
  Object.values(slots || {}).map(slot => slot()));
const InstanceInlineRefStub = (props, { slots }) => h('article', {
  'data-ref-type': props.type,
  'data-ref-variant': props.variant,
  'data-ref-active': String(props.active),
  'data-ref-selectable': String(props.selectable)
}, slots?.trailing ? slots.trailing() : null);
const InstanceSelectStub = (props, { attrs }) => h('div', {
  'data-picker-type': props.typeId,
  'data-picker-value': props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue),
  ...(attrs || {})
});
const ButtonStub = (props, { slots }) => h('button', {
  'data-button-icon': props.icon || '',
  'aria-label': props['aria-label'] || ''
}, slots?.default ? slots.default() : null);

function mountContext() {
  return {
    vue: { h, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent },
    components: {
      Button: ButtonStub, Checkbox: stub, InputNumber: stub, InputText: stub,
      Popover: stub, SpeedDial: stub, Tag: stub, InstanceSelect: InstanceSelectStub,
      InstanceInlineRef: InstanceInlineRefStub, DesignerSurface: stub, DesignerWorkspace: renderAllSlots
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

  it('renders the working set on instance tiles with pick-to-add pickers', async () => {
    const surface = createSurface(mountContext());
    const app = createSSRApp(surface, { record, persistence: { patch: async () => {}, rename: async () => {} } });
    const html = await renderToString(app);

    // The active sheet's record and the working-set row are tiles; the
    // working-set row is selectable with its trailing remove control.
    expect(html.match(/data-ref-variant="tile"/g)).toHaveLength(2);
    expect(html).toContain('data-ref-type="sheet-design"');
    expect(html).toContain('data-ref-active="true"');
    expect(html).toContain('data-ref-selectable="true"');
    expect(html).toContain('data-button-icon="pi pi-times"');
    // Pickers carry no lingering selection: picking adds and the control
    // resets.
    expect(html).not.toContain('data-picker-value="null"');
    expect(html).toContain('data-picker-type="cassette-design"');
  });
});
