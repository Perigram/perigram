import { describe, expect, it } from 'vitest';
import { createRuntime } from './shared.mjs';
import listing from '../listing.json';

describe('Documents shared runtime', () => {
  const runtime = createRuntime();

  it('declares pure document and CSV operations for browser and server', () => {
    expect(listing.declarations.runtimes).toEqual([
      expect.objectContaining({ id: 'documents-shared', targets: ['browser', 'server'] })
    ]);
    for (const service of listing.declarations.services.filter(item => item.execution?.runtime === 'documents-shared')) {
      expect(service.execution.targets).toEqual(['browser', 'server']);
      expect(service.execution.capabilities).toEqual([]);
    }
  });

  it('serializes row records through the shared spreadsheet engine', () => {
    const csv = runtime.execute('csv-text', { rows: [{ name: 'Panel', width: 600 }, { name: 'Door', width: 450 }] });
    expect(csv).toContain('name,width');
    expect(csv).toContain('Panel,600');
    expect(csv).toContain('Door,450');
    expect(() => runtime.execute('csv-text', { rows: {} })).toThrow(/rows array/);
  });

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

  it('renders a flow document directly as safe HTML', () => {
    const html = runtime.execute('render-document-html', { document: { type: 'text.flow-document', blocks: [{ type: 'paragraph', children: [{ type: 'text', text: '<safe>' }] }] } });
    expect(html).toContain('&lt;safe&gt;');
  });

  it('extracts tables and composes reports from typed documents', () => {
    const rows = [{ sku: 'A-1', quantity: 2 }];
    const document = { type: 'text.flow-document', schemaVersion: 1, blocks: [{ type: 'table', rows }] };
    expect(runtime.execute('extract-table', { document })).toEqual(rows);
    expect(runtime.execute('compose-report', { title: 'Parts', rows })).toMatchObject({ type: 'document.report', title: 'Parts' });
  });

  it('renders escaped standalone HTML from report IR', () => {
    const html = runtime.execute('render-html', { report: { type: 'document.report', sections: [{ blocks: [{ type: 'paragraph', children: [{ type: 'text', text: '<script>' }] }] }] } });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('exports flow documents to Markdown and rejects unknown operations', () => {
    expect(runtime.execute('export-markdown', { document: { type: 'text.flow-document', blocks: [{ type: 'heading', level: 2, children: [{ type: 'text', text: 'Parts' }] }, { type: 'paragraph', children: [{ type: 'text', text: 'Ready' }] }] } })).toBe('## Parts\n\nReady\n');
    expect(() => runtime.execute('unknown-operation', {})).toThrow(/Unsupported Documents shared operation/);
  });
});
