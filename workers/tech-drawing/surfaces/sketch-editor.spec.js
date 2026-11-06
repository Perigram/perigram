// Read-only degradation (SPEC §4): mount mode 'read' renders the scene
// inert — the sketch svg alone, no tools, no background controls, no
// save; the edit mount keeps the toolbar and the crosshair canvas.
import { describe, it, expect } from 'vitest';
import { createSSRApp, h, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';
import createSurface from './sketch-editor.mjs';

const ButtonStub = (props, { slots }) => h('button', {
  'data-button-icon': props.icon || '',
  'data-button-label': props.label || ''
}, slots?.default ? slots.default() : null);
const InputTextStub = () => h('input', { 'data-input-text': 'true' });
const MessageStub = (props, { slots }) => h('div', { 'data-message': String(props.severity || '') }, slots?.default ? slots.default() : null);
const stub = (props, { slots }) => (slots?.default ? slots.default() : null);

const mountContext = () => ({
  vue: { h, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent },
  components: {
    Button: ButtonStub, ColorPicker: stub, InputText: InputTextStub,
    Message: MessageStub, Popover: stub, Select: stub, SelectButton: stub
  },
  locale: { t: key => key, te: () => true, locale: ref('en') },
  upload: { file: async () => ({ id: 'file-1', url: '/files/file-1' }) }
});

const persistence = {
  title: 'Hanger sketch',
  loadDocument: async () => null,
  saveDocument: async () => {},
  rename: async () => {}
};

describe('sketch-editor surface mount', () => {
  it('mode read renders the scene svg alone without tools or save', async () => {
    const surface = createSurface(mountContext());
    const app = createSSRApp(surface, { record: { _id: 'sketch-1', name: 'Hanger' }, persistence, mode: 'read' });
    const html = await renderToString(app);
    expect(html).toContain('<svg');
    expect(html).toContain('preserveAspectRatio');
    expect(html).not.toContain('data-button-icon');
    expect(html).not.toContain('data-input-text');
    expect(html).not.toContain('cursor-crosshair');
  });

  it('edit mode keeps the toolbar and the crosshair canvas', async () => {
    const surface = createSurface(mountContext());
    const app = createSSRApp(surface, { record: { _id: 'sketch-1', name: 'Hanger' }, persistence });
    const html = await renderToString(app);
    expect(html).toContain('data-button-icon="pi pi-check"');
    expect(html).toContain('cursor-crosshair');
  });
});
