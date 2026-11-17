// The report vertical's acceptance (HAG phases 3-4 over the one
// graph): markdown round-trips through the flow-document IR, report
// composition refuses implicit conversions, and the preview surface
// selects report values by their IR discriminator.
import { describe, expect, it } from 'vitest';
import { composeReport, exportMarkdown, extractTable, parseMarkdown, renderReportHtml, renderReportPdf } from './report.js';
import { services } from './services.js';
import { createRuntime } from './runtime/shared.mjs';
import { checkSurfaceModule } from '@perigram/plugin-sdk/surface-check';
import createReportSurface, { documentsOf } from './surfaces/report-preview.mjs';

const SOURCE = [
  '# Engineering report',
  '',
  'A **bold** intro with *emphasis*, `code`, and a [link](https://example.com).',
  '',
  '- aluminium\n- steel',
  '',
  '1. first\n2. second',
  '',
  '> quoted wisdom',
  '',
  '```python\nprint("hi")\n```',
  '',
  '| material | qty |\n| --- | --- |\n| aluminium | 12 |\n| steel | 3 |',
  '',
  '---'
].join('\n');

describe('markdown ↔ flow-document', () => {
  const runtime = createRuntime();
  it('parses the supported vocabulary into typed blocks', () => {
    const document = parseMarkdown(SOURCE);
    expect(document.type).toBe('text.flow-document');
    expect(document.schemaVersion).toBe(1);
    expect(document.blocks.map(block => block.type)).toEqual([
      'heading', 'paragraph', 'list', 'list', 'blockquote', 'code-block', 'table', 'horizontal-rule'
    ]);
    expect(document.blocks[0]).toEqual({
      type: 'heading', level: 1, children: [{ type: 'text', text: 'Engineering report' }]
    });
    expect(document.blocks[2].items).toHaveLength(2);
    expect(document.blocks[5]).toMatchObject({ language: 'python', text: 'print("hi")' });
    expect(document.blocks[6].rows).toEqual([
      { material: 'aluminium', qty: '12' },
      { material: 'steel', qty: '3' }
    ]);
  });

  it('round-trips the supported vocabulary through export', () => {
    const roundTrip = exportMarkdown(parseMarkdown(SOURCE));
    expect(roundTrip).toBe([
      '# Engineering report',
      '',
      'A **bold** intro with *emphasis*, `code`, and a [link](https://example.com).',
      '',
      '- aluminium\n- steel',
      '',
      '1. first\n2. second',
      '',
      '> quoted wisdom',
      '',
      '```python\nprint("hi")\n```',
      '',
      '| material | qty |\n| --- | --- |\n| aluminium | 12 |\n| steel | 3 |',
      '',
      '---',
      ''
    ].join('\n'));
  });

  it('escapes table delimiters and flattens cell line breaks on export', () => {
    const document = {
      type: 'text.flow-document',
      schemaVersion: 1,
      blocks: [{
        type: 'table',
        rows: [{ label: 'A|B', notes: 'first\\nsecond', path: 'C:\\\\temp' }]
      }]
    };
    const markdown = exportMarkdown(document);
    expect(markdown).toContain('A\\\\|B');
    expect(markdown).toContain('first second');
    expect(markdown).toContain('C:\\\\\\\\temp');
    expect(parseMarkdown(markdown).blocks[0].rows).toEqual([{
      label: 'A|B',
      notes: 'first second',
      path: 'C:\\\\temp'
    }]);
  });

  it('preserves formatted text when projecting Markdown table cells to records', () => {
    const document = parseMarkdown('| label | value |\n| --- | --- |\n| **bold** and *italic* | [site](https://example.com) with `code` |');
    expect(document.blocks[0].rows).toEqual([{
      label: 'bold and italic',
      value: 'site with code'
    }]);
  });

  it('records dropped constructs as diagnostics instead of silent loss', () => {
    const document = parseMarkdown('<div>drop me</div>\n\n![pic](pic.png)');
    expect(document.diagnostics).toEqual(['UNSUPPORTED_HTML', 'UNSUPPORTED_IMAGE']);
    expect(document.blocks).toEqual([]);
  });

  it('creates list items from typed inline values', async () => {
    const strong = await runtime.execute('inline-mark', {
      mark: 'strong',
      children: [{ type: 'text', text: 'Important' }]
    });
    const list = await runtime.execute('document-list', {
      inlineItems: [strong],
      ordered: true
    });
    expect(list).toEqual({
      type: 'list',
      ordered: true,
      items: [[{ type: 'strong', children: [{ type: 'text', text: 'Important' }] }]]
    });
    expect(() => runtime.execute('document-list', { inlineItems: [{ type: 'other' }] }))
      .toThrow('text.inline');
  });

  it('refuses empty and non-string input', () => {
    expect(() => parseMarkdown('')).toThrow('non-empty');
    expect(() => parseMarkdown(null)).toThrow('non-empty');
    expect(() => exportMarkdown({ type: 'other' })).toThrow('text.flow-document');
  });
});

describe('report composition', () => {
  const runtime = createRuntime();
  it('composes flow content and row records into one section', () => {
    const flow = parseMarkdown('## Section\n\nbody text');
    const report = composeReport({ title: 'Report', sectionTitle: 'Section', flow, rows: [{ a: 1 }] });
    expect(report).toEqual({
      type: 'document.report',
      schemaVersion: 1,
      title: 'Report',
      sections: [{
        id: 'content',
        title: 'Section',
        blocks: [{ type: 'flow', document: flow }, { type: 'table', rows: [{ a: 1 }] }]
      }]
    });
  });

  it('composes rows alone and refuses kind mismatches', () => {
    expect(composeReport({ rows: [] }).sections[0].blocks).toEqual([{ type: 'table', rows: [] }]);
    expect(() => composeReport({ flow: { type: 'other' } })).toThrow('text.flow-document');
    expect(() => composeReport({ rows: ['not-a-record'] })).toThrow('row records');
    expect(() => composeReport({})).toThrow('flow document or row records');
  });

  it('composes and exports the report through the shared runtime', async () => {
    const document = await services['parse-markdown']({ text: '# Title' });
    expect(document.blocks[0].type).toBe('heading');
    const text = await runtime.execute('export-markdown', { document });
    expect(text).toBe('# Title\n');
    const report = await runtime.execute('compose-report', { flow: document, rows: [{ x: 1 }] });
    expect(report.type).toBe('document.report');
  });
});

describe('report export representations', () => {
  const runtime = createRuntime();
  const report = composeReport({
    title: 'Materials <Q3>',
    sectionTitle: 'Takeoff',
    flow: parseMarkdown('Body with **bold** and <script>alert(1)</script>.'),
    rows: [{ material: 'aluminium', qty: 12 }]
  });

  it('extracts the flow document\'s table as row records', () => {
    const withTable = parseMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |\n\nno table elsewhere');
    expect(extractTable(withTable)).toEqual([{ a: '1', b: '2' }]);
    expect(() => extractTable(parseMarkdown('# no table'))).toThrow('carries no table');
    expect(() => extractTable({ type: 'other' })).toThrow('text.flow-document');
  });

  it('renders the report as a standalone HTML document with escaped content', () => {
    const html = renderReportHtml(report);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>Materials &lt;Q3&gt;</title>');
    expect(html).toContain('<h2>Takeoff</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<th>material</th>');
    expect(() => renderReportHtml({ type: 'other' })).toThrow('document.report');
  });

  it('renders the report as a PDF payload through the services map', async () => {
    const output = await services['render-report-pdf']({ report });
    expect(output.payload.mime).toBe('application/pdf');
    expect(output.payload.name).toBe('Materials <Q3>.pdf');
    const bytes = Buffer.from(output.payload.base64, 'base64');
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('serves pure report and document operations through the shared runtime', async () => {
    const flow = parseMarkdown('| k | v |\n| --- | --- |\n| x | 1 |');
    expect(await runtime.execute('extract-table', { document: flow })).toEqual([{ k: 'x', v: '1' }]);
    const html = await runtime.execute('render-html', { report });
    expect(html).toContain('<!doctype html>');
  });
});


describe('document graph vertical slice', () => {
  it('creates, previews, and exports a typed document value', async () => {
    const runtime = createRuntime();
    const inline = await runtime.execute('inline-text', { text: 'Release ' });
    const emphasis = await runtime.execute('inline-mark', {
      mark: 'strong',
      children: [{ type: 'text', text: 'notes' }]
    });
    const paragraph = await runtime.execute('document-paragraph', {
      children: [inline, emphasis]
    });
    const list = await runtime.execute('document-list', { inlineItems: [emphasis] });
    const document = await runtime.execute('compose-document', {
      title: 'Release',
      blocks: [paragraph, list]
    });

    const calls = [];
    const surface = createReportSurface({
      vue: { h: (tag, props, children) => {
        calls.push(tag);
        return { tag, props, children };
      } }
    });
    surface.payload = {
      nodes: { document: { outputs: { result: { branches: [{ items: [document] }] } } } }
    };
    expect(surface.render()).toBeTruthy();
    expect(calls).toContain('article');
    expect(calls).toContain('strong');

    const markdown = await runtime.execute('export-markdown', { document });
    expect(markdown).toContain('Release **notes**');
    const markdownFile = await runtime.execute('export-markdown-file', { document, name: 'release' });
    expect(markdownFile.payload).toMatchObject({ mime: 'text/markdown', name: 'release.md' });
    expect(Buffer.from(markdownFile.payload.base64, 'base64').toString('utf8')).toBe(markdown);

    const htmlFile = await runtime.execute('export-html-file', { document, name: 'release' });
    expect(htmlFile.payload).toMatchObject({ mime: 'text/html', name: 'release.html' });
    expect(Buffer.from(htmlFile.payload.base64, 'base64').toString('utf8')).toContain('<strong>notes</strong>');

    const pdfFile = await services['render-document-pdf']({ document, name: 'release' });
    expect(pdfFile.payload).toMatchObject({ mime: 'application/pdf', name: 'release.pdf' });
    expect(Buffer.from(pdfFile.payload.base64, 'base64').subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('report preview surface', () => {
  it('passes the surface-module check', async () => {
    await expect(checkSurfaceModule(new URL('./surfaces/report-preview.mjs', import.meta.url).pathname)).resolves.toBe(true);
  });

  it('selects flowing documents and reports by their IR discriminators across payload trees', () => {
    const payload = {
      nodes: {
        a: { outputs: { result: { branches: [{ path: [], items: [{ type: 'document.report', sections: [] }, { type: 'text.flow-document', blocks: [] }, { type: 'other' }] }] } } },
        b: { outputs: { result: { branches: [{ path: [], items: ['plain string'] }] } } }
      }
    };
    expect(documentsOf(payload)).toEqual([{ type: 'document.report', sections: [] }, { type: 'text.flow-document', blocks: [] }]);
    expect(documentsOf(null)).toEqual([]);
  });

  it('renders every flowing-document block and rejects unsafe preview links', () => {
    const calls = [];
    const h = (tag, props, children) => {
      calls.push({ tag, props, children });
      return { tag, props, children };
    };
    const component = createReportSurface({ vue: { h } });
    component.payload = {
      nodes: { n: { outputs: { result: { branches: [{ items: [{
        type: 'text.flow-document',
        title: 'Graph document',
        blocks: [
          { type: 'paragraph', children: [{ type: 'text', text: 'plain' }, { type: 'strong', children: [{ type: 'text', text: 'bold' }] }, { type: 'emphasis', children: [{ type: 'text', text: 'italic' }] }, { type: 'code', text: 'x' }, { type: 'link', href: 'javascript:alert(1)', children: [{ type: 'text', text: 'unsafe' }] }] },
          { type: 'heading', level: 2, children: [{ type: 'text', text: 'Heading' }] },
          { type: 'list', ordered: true, items: [[{ type: 'text', text: 'item' }]] },
          { type: 'blockquote', blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'quote' }] }] },
          { type: 'code-block', language: 'js', text: 'const x = 1;' },
          { type: 'table', rows: [{ a: 'cell' }] },
          { type: 'horizontal-rule' }
        ]
      }] }] } } }
    };
    const tree = component.render();
    expect(tree).toBeTruthy();
    expect(calls.map(call => call.tag)).toEqual(expect.arrayContaining([
      'article', 'h2', 'p', 'strong', 'em', 'code', 'span', 'h2', 'ol', 'li',
      'blockquote', 'pre', 'table', 'thead', 'tbody', 'hr'
    ]));
    expect(calls.some(call => call.tag === 'a' && String(call.props?.href).startsWith('javascript:'))).toBe(false);
  });

  it('renders report sections through the factory component', () => {
    const calls = [];
    const h = (tag, options, children) => {
      calls.push(tag);
      return { tag, children };
    };
    const component = createReportSurface({ vue: { h } });
    expect(component.props).toMatchObject({ record: { type: Object }, payload: { type: Object } });
    component.payload = {
      nodes: { n: { outputs: { result: { branches: [{ path: [], items: [composeReport({
        title: 'T', flow: parseMarkdown('# H\n\nwords'), rows: [{ a: 1 }]
      })] }] } } } }
    };
    const tree = component.render();
    expect(calls).toContain('article');
    expect(calls).toContain('h2');
    expect(calls).toContain('table');
    expect(tree).toBeTruthy();
  });
});
