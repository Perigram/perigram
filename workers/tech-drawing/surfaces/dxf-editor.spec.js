// Read-only degradation (SPEC §4): mount mode 'read' leaves the DXF
// canvas and the anchor list view-only — the fit control and the marker
// rows render, the marker authoring form and save die; the edit mount
// keeps them.
import { describe, it, expect, vi } from 'vitest';
import { createSSRApp, h, ref, computed, watch, onMounted, onBeforeUnmount, nextTick, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';

vi.mock('cadcraft', () => ({ CadCraftHost: class CadCraftHost {} }));

const surfaceModule = await import('./dxf-editor.mjs');

const ButtonStub = (props, { slots }) => h('button', {
  'data-button-icon': props.icon || '',
  'data-button-label': props.label || ''
}, slots?.default ? slots.default() : null);
const InputTextStub = () => h('input', { 'data-input-text': 'true' });
const InputNumberStub = () => h('input', { 'data-input-number': 'true' });
const MessageStub = (props, { slots }) => h('div', { 'data-message': String(props.severity || '') }, slots?.default ? slots.default() : null);
const stub = (props, { slots }) => (slots?.default ? slots.default() : null);

const mountContext = () => ({
  vue: { h, ref, computed, watch, onMounted, onBeforeUnmount, nextTick, defineComponent },
  components: {
    Button: ButtonStub, InputNumber: InputNumberStub, InputText: InputTextStub,
    Message: MessageStub
  },
  locale: { t: key => key, te: () => true, locale: ref('en') },
  notify: () => {}
});

const persistence = {
  title: 'Frame template',
  loadDocument: async () => null,
  saveDocument: async () => {},
  rename: async () => {}
};

describe('dxf-editor surface mount', () => {
  it('mode read renders the canvas shell and title without authoring or save', async () => {
    const surface = surfaceModule.default(mountContext());
    const app = createSSRApp(surface, { record: { _id: 'dxf-1', name: 'Frame.dxf' }, persistence, mode: 'read' });
    const html = await renderToString(app);
    expect(html).toContain('Frame.dxf');
    expect(html).toContain('data-button-icon="pi pi-expand"');
    expect(html).toContain('dxfEditor.markers');
    expect(html).not.toContain('data-button-label="common.save"');
    expect(html).not.toContain('data-button-icon="pi pi-trash"');
    expect(html).not.toContain('data-input-text');
    expect(html).not.toContain('data-input-number');
  });

  it('edit mode keeps the save control and the marker authoring form', async () => {
    const surface = surfaceModule.default(mountContext());
    const app = createSSRApp(surface, { record: { _id: 'dxf-1', name: 'Frame.dxf' }, persistence });
    const html = await renderToString(app);
    expect(html).toContain('data-button-label="common.save"');
    expect(html).toContain('data-input-text');
    expect(html).toContain('data-input-number');
  });
});
