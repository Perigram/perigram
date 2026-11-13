// Editor chrome hand-off and read-only degradation (SPEC §4): the
// surface binds its document state into the host's page-chrome channel
// (the header owns the name and save); mount mode 'read' leaves the
// canvas and the anchor list view-only — no marker authoring, no chrome
// binding; the edit mount keeps them.
import { describe, it, expect, vi } from 'vitest';
import { createSSRApp, h, ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, defineComponent } from 'vue';
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

const mountContext = () => ({
  vue: { h, ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, defineComponent },
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

const chromeChannel = () => reactive({ api: null, bind(next) { this.api = next; } });

describe('dxf-editor surface mount', () => {
  it('mode read renders the canvas shell and anchor list without authoring', async () => {
    const pageChrome = chromeChannel();
    const surface = surfaceModule.default(mountContext());
    const app = createSSRApp(surface, { record: { _id: 'dxf-1', name: 'Frame.dxf' }, persistence, mode: 'read', pageChrome });
    const html = await renderToString(app);
    expect(html).toContain('rounded-panel');
    expect(html).toContain('dxfEditor.markers');
    expect(html).toContain('common.loading');
    expect(html).not.toContain('data-button-label="common.save"');
    expect(html).not.toContain('data-button-icon="pi pi-trash"');
    expect(html).not.toContain('data-input-text');
    expect(html).not.toContain('data-input-number');
    expect(pageChrome.api).toBe(null);
  });

  it('edit mode binds the header chrome and keeps the marker authoring form', async () => {
    const pageChrome = chromeChannel();
    const surface = surfaceModule.default(mountContext());
    const app = createSSRApp(surface, { record: { _id: 'dxf-1', name: 'Frame.dxf' }, persistence, pageChrome });
    const html = await renderToString(app);
    expect(html).toContain('data-input-text');
    expect(html).toContain('data-input-number');
    expect(pageChrome.api?.name).toBe('Frame.dxf');
    expect(pageChrome.api?.dirty).toBe(false);
    expect(typeof pageChrome.api?.save).toBe('function');
    expect(typeof pageChrome.api?.rename).toBe('function');
  });
});
