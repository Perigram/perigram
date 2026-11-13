// The report vertical's acceptance (HAG phases 3-4 over the one
// graph): markdown round-trips through the flow-document IR, report
// composition refuses implicit conversions, and the preview surface
// selects report values by their IR discriminator.
import { describe, expect, it } from 'vitest';
import { composeReport, exportMarkdown, parseMarkdown } from './report.js';
import { services } from './services.js';
import { checkSurfaceModule } from '../../packages/plugin-sdk/src/surface-check.js';
import createReportSurface, { reportsOf } from './surfaces/report-preview.mjs';

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

  it('records dropped constructs as diagnostics instead of silent loss', () => {
    const document = parseMarkdown('<div>drop me</div>\n\n![pic](pic.png)');
    expect(document.diagnostics).toEqual(['UNSUPPORTED_HTML', 'UNSUPPORTED_IMAGE']);
    expect(document.blocks).toEqual([]);
  });

  it('refuses empty and non-string input', () => {
    expect(() => parseMarkdown('')).toThrow('non-empty');
    expect(() => parseMarkdown(null)).toThrow('non-empty');
    expect(() => exportMarkdown({ type: 'other' })).toThrow('text.flow-document');
  });
});

describe('report composition', () => {
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

  it('serves the vertical through the services map', async () => {
    const document = await services['parse-markdown']({ text: '# Title' });
    expect(document.blocks[0].type).toBe('heading');
    const text = await services['export-markdown']({ document });
    expect(text).toBe('# Title\n');
    const report = await services['compose-report']({ flow: document, rows: [{ x: 1 }] });
    expect(report.type).toBe('document.report');
  });
});

describe('report preview surface', () => {
  it('passes the surface-module check', async () => {
    await expect(checkSurfaceModule(new URL('./surfaces/report-preview.mjs', import.meta.url).pathname)).resolves.toBe(true);
  });

  it('selects report values by the IR discriminator across the payload trees', () => {
    const payload = {
      nodes: {
        a: { outputs: { result: { branches: [{ path: [], items: [{ type: 'document.report', sections: [] }, { type: 'other' }] }] } } },
        b: { outputs: { result: { branches: [{ path: [], items: ['plain string'] }] } } }
      }
    };
    expect(reportsOf(payload)).toEqual([{ type: 'document.report', sections: [] }]);
    expect(reportsOf(null)).toEqual([]);
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
