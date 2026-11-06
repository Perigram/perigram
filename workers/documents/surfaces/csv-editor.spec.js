// Read-only degradation (SPEC §4): mount mode 'read' renders the table
// and the document name with every editing affordance gone; the edit
// mount keeps the save control, the rename field, and the cell-edit
// table.
import { describe, it, expect } from 'vitest';
import { createSSRApp, h, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent } from 'vue';
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
  vue: { h, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent },
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

describe('csv-editor surface mount', () => {
  it('mode read renders the table and the document name without editing controls', async () => {
    const surface = createSurface(mountContext());
    const app = createSSRApp(surface, { record: { _id: 'csv-1', name: 'Parts.csv' }, persistence, mode: 'read' });
    const html = await renderToString(app);
    expect(html).toContain('Parts.csv');
    expect(html).toContain('data-data-table');
    expect(html).not.toContain('data-edit-mode="cell"');
    expect(html).not.toContain('data-input-text');
    expect(html).not.toContain('data-button-icon="pi pi-save"');
  });

  it('edit mode keeps the save control, the rename field, and the cell-edit table', async () => {
    const surface = createSurface(mountContext());
    const app = createSSRApp(surface, { record: { _id: 'csv-1', name: 'Parts.csv' }, persistence });
    const html = await renderToString(app);
    expect(html).toContain('data-edit-mode="cell"');
    expect(html).toContain('data-button-icon="pi pi-save"');
    expect(html).toContain('data-input-text');
  });
});
