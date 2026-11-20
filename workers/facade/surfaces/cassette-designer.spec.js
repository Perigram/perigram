// Read-only degradation (SPEC §4): mount mode 'read' renders the
// cassette view-only — the canvas and inspector keep selection, the
// authoring affordances die (document dock, undo/redo, parameter
// palette, add controls, selection panels, designer edit targets).
import { describe, it, expect, vi } from 'vitest';
import { createSSRApp, h, ref, shallowRef, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, defineComponent, Teleport } from 'vue';
import { renderToString } from 'vue/server-renderer';

vi.mock('cadcraft', () => ({ CadCraftHost: class CadCraftHost {} }));

const surfaceModule = await import('./cassette-designer.mjs');

const ButtonStub = (props, { slots }) => h('button', {
  'data-button-icon': props.icon || '',
  'data-button-label': props.label || ''
}, slots?.default ? slots.default() : null);
const InputTextStub = () => h('input', { 'data-input-text': 'true' });
const TagStub = props => h('span', { 'data-tag-value': String(props.value ?? '') });
const TreeStub = () => h('div', { 'data-tree': 'true' });
const MessageStub = (props, { slots }) => h('div', { 'data-message': String(props.severity || '') }, slots?.default ? slots.default() : null);
const stub = (props, { slots }) => (slots?.default ? slots.default() : null);
const PopoverStub = () => null;
const StandardDialogStub = (props, { slots }) => (props.visible ? h('div', slots?.default ? slots.default() : []) : null);
const renderAllSlots = (props, { slots }) => h('div', {},
  Object.values(slots || {}).map(slot => slot()));
const DesignerWorkspaceStub = (props, { slots }) => h('div', {
  'data-dock-canvas-items': String(props.canvasItems?.length ?? 0)
}, Object.values(slots || {}).map(slot => slot()));
const DrawingCanvasStub = (props, { attrs }) => h('div', {
  'data-drawing-canvas': 'true',
  'data-designer-editable': String(props.designerEditable),
  ...attrs
});

const mountContext = () => ({
  vue: { h, ref, shallowRef, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, defineComponent, Teleport },
  components: {
    Button: ButtonStub, Checkbox: stub, Divider: stub, DrawingCanvas: DrawingCanvasStub,
    DesignerSurface: stub, DesignerWorkspace: DesignerWorkspaceStub, IftaLabel: stub,
    InputNumber: stub, InputText: InputTextStub, InstanceSelect: stub, Message: MessageStub,
    Popover: PopoverStub, ProgressSpinner: stub, ScrollPanel: stub, Select: stub,
    SelectButton: stub, StandardDialog: StandardDialogStub, Tag: TagStub, Tree: TreeStub
  },
  locale: { t: key => key, te: () => true, locale: ref('en') },
  queries: { list: async () => [], get: async () => null },
  records: { create: async () => null, update: async () => null, delete: async () => null },
  notify: () => {},
  access: { canWrite: () => false }
});

const record = { _id: 'cassette-1', name: 'Default hanger', definition: {} };
const persistence = {
  loadDocument: async () => null,
  saveDocument: async () => {},
  rename: async () => {},
  patch: async () => {}
};

describe('cassette-designer surface mount', () => {
  it('mode read renders the canvas and inspector without authoring affordances', async () => {
    const surface = surfaceModule.default(mountContext());
    const app = createSSRApp(surface, { record, persistence, mode: 'read' });
    const html = await renderToString(app);
    expect(html).toContain('data-drawing-canvas');
    expect(html).toContain('data-designer-editable="false"');
    expect(html).toContain('cassette.v2.workpieces');
    expect(html).toContain('common.layers');
    expect(html).toContain('data-dock-canvas-items="3"');
    expect(html).not.toContain('cassette.v2.globalParameters');
    expect(html).not.toContain('data-button-icon="ck-entity-icon ck-entity-icon-bolt"');
    expect(html).not.toContain('data-input-text');
    expect(html).not.toContain('data-designer-panel-editor');
  });

  it('edit mode keeps the authoring affordances', async () => {
    const surface = surfaceModule.default(mountContext());
    const app = createSSRApp(surface, { record, persistence });
    const html = await renderToString(app);
    expect(html).toContain('data-designer-editable="true"');
    expect(html).toContain('data-dock-canvas-items="13"');
    expect(html).toContain('cassette.v2.globalParameters');
    expect(html).toContain('data-button-icon="ck-entity-icon ck-entity-icon-bolt"');
    expect(html).toContain('data-input-text');
  });
});
