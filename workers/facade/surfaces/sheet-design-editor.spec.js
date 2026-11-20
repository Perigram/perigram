// Mount smoke for the sheet-design editor surface: the factory's setup
// path (immediate record watch, geometry, history) and render tree must
// survive a full render — the TDZ class of setup-order bugs never
// reaches the browser again. The inspector structure spec pins the
// working set on instance tiles with lineage (the InstanceInlineRef
// tile variant) and pick-to-add pickers.
import { describe, it, expect } from 'vitest';
import { createSSRApp, h, ref, reactive, computed, watch, onMounted, onBeforeUnmount, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';
import createSurface, { sameLineage } from './sheet-design-editor.mjs';

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
  'data-picker-options': (props.options || []).map(option => option.value).join(','),
  ...(attrs || {})
});
const ButtonStub = (props, { slots }) => h('button', {
  'data-button-icon': props.icon || '',
  'aria-label': props['aria-label'] || ''
}, slots?.default ? slots.default() : null);

// The chain renders only for records carrying ancestry — the real
// component's contract.
const ActionsChainStub = (props) => (
  props.entity?.lineage && Object.keys(props.entity.lineage).length
    ? h('nav', { 'data-trace-chain': String(props.typeId || ''), 'aria-label': 'Traceability' })
    : null
);
const mountContext = ({ queries } = {}) => {
  return {
    vue: { h, ref, reactive, computed, watch, onMounted, onBeforeUnmount, defineComponent },
    components: {
      Button: ButtonStub, Checkbox: stub, InputNumber: stub, InputText: stub,
      Popover: stub, SpeedDial: stub, Tag: stub, InstanceSelect: InstanceSelectStub,
      InstanceInlineRef: InstanceInlineRefStub, TraceChain: ActionsChainStub,
      DesignerSurface: stub, DesignerWorkspace: renderAllSlots
    },
    locale: { t: key => key, te: () => true, locale: ref('en') },
    queries: queries || { list: async () => [] },
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
    // working-set row is selectable with its trailing remove control on
    // the identity line.
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

  it('scopes the working set to the lineage family and lists no org pool', async () => {
    const sheetQueryCalls = [];
    const family = ['sibling-2', 'sibling-3'].map(id => ({
      _id: id,
      fields: { name: `Sibling ${id}` },
      lineage: { familyId: 'parent-1' }
    }));
    const queries = {
      list: async (typeId, params = {}) => {
        if (typeId === 'sheet-design') sheetQueryCalls.push(params);
        if (typeId === 'cassette-design') return [];
        return family;
      }
    };
    const opened = { ...record, lineage: { familyId: 'parent-1' } };
    const surface = createSurface(mountContext({ queries }));
    const app = createSSRApp(surface, { record: opened, persistence: { patch: async () => {}, rename: async () => {} } });
    await renderToString(app);
    // The family query rides the record's lineage keys; the pool query
    // feeds the explicit picker.
    await Promise.resolve();
    expect(sheetQueryCalls).toEqual([{ 'lineage.familyId': 'parent-1' }, {}]);
  });

  it('never queries lineage for a lineage-less record', async () => {
    const sheetQueryCalls = [];
    const queries = {
      list: async (typeId, params = {}) => {
        if (typeId === 'sheet-design') sheetQueryCalls.push(params);
        return [];
      }
    };
    const surface = createSurface(mountContext({ queries }));
    const app = createSSRApp(surface, { record, persistence: { patch: async () => {}, rename: async () => {} } });
    const html = await renderToString(app);
    await Promise.resolve();

    expect(sheetQueryCalls).toEqual([{}]);
    expect(html.match(/data-ref-variant="tile"/g)).toHaveLength(2);
    // No lineage, no chain anywhere.
    expect(html).not.toContain('data-trace-chain');
  });

  it('renders no chain for the opened record — the page host owns it', async () => {
    const opened = { ...record, lineage: { familyId: 'parent-1' } };
    const surface = createSurface(mountContext());
    const app = createSSRApp(surface, { record: opened, persistence: { patch: async () => {}, rename: async () => {} } });
    const html = await renderToString(app);
    // The surface is content: the record header (detail mount) and the
    // workspace page host (page mount) carry the record's chain. The
    // opened record's working-set tile states nothing above it.
    expect(html).not.toContain('data-trace-chain');
  });

  it('flags lineage deviation exactly', () => {
    const baseline = { familyId: 'parent-1' };
    expect(sameLineage(baseline, { familyId: 'parent-1' })).toBe(true);
    expect(sameLineage(baseline, { familyId: 'parent-1', orderId: 'order-9' })).toBe(false);
    expect(sameLineage(baseline, { familyId: 'parent-2' })).toBe(false);
    expect(sameLineage(baseline, {})).toBe(false);
    expect(sameLineage({}, {})).toBe(true);
    // Stored shapes — the { id } object and the bare id — are one value.
    expect(sameLineage({ familyId: { id: 'parent-1' } }, baseline)).toBe(true);
  });
});
