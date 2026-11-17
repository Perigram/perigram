import { describe, expect, it } from 'vitest';
import { createRuntime } from './server.mjs';
describe('Documents server runtime', () => {
  const runtime = createRuntime();
  it('extracts the first table from a flow document', () => {
    const rows = [{ sku: 'A-1', quantity: 2 }];
    expect(runtime.execute('extract-table', { document: { type: 'text.flow-document', schemaVersion: 1, blocks: [{ type: 'paragraph', children: [] }, { type: 'table', rows }] } })).toEqual(rows);
  });
  it('rejects values outside the flow-document contract', () => {
    expect(() => runtime.execute('extract-table', { document: { type: 'document.report', blocks: [] } })).toThrow(/text\.flow-document/);
  });
  it('rejects flow documents without a table', () => {
    expect(() => runtime.execute('extract-table', { document: { type: 'text.flow-document', blocks: [{ type: 'paragraph', children: [] }] } })).toThrow(/carries no table/);
  });
  it('composes report IR from flow documents and row records', () => {
    const result = runtime.execute('compose-report', { title: 'Parts', rows: [{ sku: 'A-1' }] });
    expect(result).toMatchObject({ type: 'document.report', title: 'Parts', sections: [{ id: 'content', blocks: [{ type: 'table', rows: [{ sku: 'A-1' }] }] }] });
  });

  it('renders escaped standalone HTML from report IR', () => {
    const html = runtime.execute('render-html', { report: { type: 'document.report', sections: [{ blocks: [{ type: 'paragraph', children: [{ type: 'text', text: '<script>' }] }] }] } });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('exports flow documents to Markdown', () => {
    expect(runtime.execute('export-markdown', { document: { type: 'text.flow-document', blocks: [{ type: 'heading', level: 2, children: [{ type: 'text', text: 'Parts' }] }, { type: 'paragraph', children: [{ type: 'text', text: 'Ready' }] }] } })).toBe('## Parts\\n\\nReady\\n');
  });

  it('rejects unknown operations', () => {
    expect(() => runtime.execute('render-html', {})).toThrow(/Unsupported Documents server operation/);
  });
});
