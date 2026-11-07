// Read-only degradation (SPEC §4): mount mode 'read' renders the table
// with every editing affordance gone. The host header owns the document
// chrome (owner direction 2026-11-07): the edit mount renders the cell
// table alone and binds name/save/dirty into the page-chrome channel.
import { describe, it, expect } from 'vitest';
import { createSSRApp, h, reactive, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';
import createSurface from './csv-editor.mjs';

const ButtonStub = (props, { slots }) => h('button', {
  'data-button-icon': props.icon || '',
  'data-button-label': props.label || ''
}, slots?.default ? slots.default() : null);
const DataTableStub = props => h('div', {
  'data-data-table': 'true',
  'data-edit-mode': String(props.editMode || '')
});
const InputTextStub = () => h('input', { 'data-input-text': 'true' });
const stub = (props, { slots }) => (slots?.default ? slots.default() : null);

const mountContext = () => ({
  vue: { h, ref, computed, reactive, watch, onMounted, onBeforeUnmount, defineComponent },
  components: { Button: ButtonStub, Column: stub, DataTable: DataTableStub, InputText: InputTextStub },
  locale: { t: key => key, te: () => true, locale: ref('en') },
  sync: { onRecordChanged: () => {} }
});

const persistence = {
  title: 'Parts list',
  loadDocument: async () => 'A,B\n1,2\n3,4',
  saveDocument: async () => {},
  rename: async () => {}
};

const mount = async (mode, pageChrome = null) => {
  const surface = createSurface(mountContext());
  const app = createSSRApp(surface, { record: { _id: 'csv-1', name: 'Parts.csv' }, persistence, mode, pageChrome });
  return await renderToString(app);
};

describe('csv-editor surface mount', () => {
  it('mode read renders the table without editing controls', async () => {
    const html = await mount('read');
    expect(html).toContain('data-data-table');
    expect(html).not.toContain('data-edit-mode="cell"');
    expect(html).not.toContain('data-input-text');
    expect(html).not.toContain('data-button-icon="pi pi-save"');
  });

  it('edit mode renders the cell table alone, binding the document chrome', async () => {
    const bound = [];
    const pageChrome = reactive({ api: null, bind: next => { pageChrome.api = next; bound.push(next); } });
    const html = await mount('edit', pageChrome);
    expect(html).toContain('data-edit-mode="cell"');
    expect(html).not.toContain('data-button-icon="pi pi-save"');
    expect(bound).toHaveLength(1);
    expect(bound[0].name).toBe('Parts.csv');
    expect(typeof bound[0].save).toBe('function');
    expect(typeof bound[0].rename).toBe('function');
  });
});
