import { describe, expect, it } from 'vitest';
import { createRuntime } from './server.mjs';
describe('Documents server runtime', () => {
  const runtime = createRuntime();
  it('builds typed inline values, blocks, and a flow document from graph operations', () => {
    const text = runtime.execute('inline-text', { text: 'Hello' });
    const strong = runtime.execute('inline-mark', { mark: 'strong', children: [text] });
    const heading = runtime.execute('document-heading', { level: 1, children: [strong] });
    const paragraph = runtime.execute('document-paragraph', { text: 'A paragraph' });
    const table = runtime.execute('document-table', { rows: [{ sku: 'A-1', quantity: 2 }] });
    const document = runtime.execute('compose-document', { title: 'Parts', blocks: [heading, paragraph, table] });
    expect(document).toMatchObject({ type: 'text.flow-document', title: 'Parts', blocks: [{ type: 'heading' }, { type: 'paragraph' }, { type: 'table' }] });
    expect(runtime.execute('append-document-block', { document, block: runtime.execute('document-divider', {}) }).blocks).toHaveLength(4);
  });

  it('rejects malformed document blocks and unsafe links', () => {
    expect(() => runtime.execute('document-heading', { level: 7, text: 'Bad' })).toThrow(/level/);
    expect(() => runtime.execute('compose-document', { blocks: [{ type: 'record' }] })).toThrow(/text.document-block/);
    expect(() => runtime.execute('inline-link', { href: 'javascript:alert(1)', children: [{ type: 'text', text: 'x' }] })).toThrow(/safe/);
  });

  it('exports composed documents as actual Markdown and HTML file payloads', () => {
    const document = runtime.execute('compose-document', { title: 'Parts', blocks: [runtime.execute('document-heading', { text: 'Ready', level: 2 })] });
    const markdown = runtime.execute('export-markdown-file', { document });
    const html = runtime.execute('export-html-file', { document });
    expect(markdown.payload.mime).toBe('text/markdown');
    expect(markdown.payload.name).toBe('Parts.md');
    expect(Buffer.from(markdown.payload.base64, 'base64').toString()).toContain('## Ready');
    expect(html.payload.mime).toBe('text/html');
    expect(Buffer.from(html.payload.base64, 'base64').toString()).toContain('<h2>Ready</h2>');
  });

  it('renders a flow document directly as HTML', () => {
    const html = runtime.execute('render-document-html', { document: { type: 'text.flow-document', blocks: [{ type: 'paragraph', children: [{ type: 'text', text: '<safe>' }] }] } });
    expect(html).toContain('&lt;safe&gt;');
  });

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

  it('removes unsafe link schemes from standalone HTML', () => {
    const html = runtime.execute('render-html', {
      report: {
        type: 'document.report',
        sections: [{
          blocks: [{
            type: 'paragraph',
            children: [
              { type: 'link', href: 'javascript:alert(1)', children: [{ type: 'text', text: 'unsafe' }] },
              { type: 'link', href: 'https://example.com/path?a=1&b=2', children: [{ type: 'text', text: 'safe' }] }
            ]
          }]
        }]
      }
    });
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://example.com/path?a=1&amp;b=2"');
    expect(html).toContain('unsafe');
  });

  it('exports flow documents to Markdown', () => {
    expect(runtime.execute('export-markdown', { document: { type: 'text.flow-document', blocks: [{ type: 'heading', level: 2, children: [{ type: 'text', text: 'Parts' }] }, { type: 'paragraph', children: [{ type: 'text', text: 'Ready' }] }] } })).toBe('## Parts\n\nReady\n');
  });

  it('rejects unknown operations', () => {
    expect(() => runtime.execute('unknown-operation', {})).toThrow(/Unsupported Documents server operation/);
  });
});
