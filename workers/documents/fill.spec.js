import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx/xlsx.mjs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  fillMarkdown,
  fillPdfTemplate,
  fillWorkbook,
  renderPdfFromCsv,
  renderPdfFromDxf,
  renderPdfFromImage,
  renderPdfFromMarkdown,
  renderPdfFromWorkbook
} from './fill.js';
import { services } from './services.js';

const b64 = value => Buffer.from(value, 'utf8').toString('base64');

function workbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'S');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function rowsOf(buffer) {
  const sheet = XLSX.read(buffer, { type: 'buffer' }).Sheets.S;
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).map(row => row.map(String));
}

async function pdfText(buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map(item => item.str).join(' ');
  page.cleanup();
  await pdf.destroy();
  return text;
}

const TEMPLATE_ROWS = [
  ['Report', '{title}'],
  ['{#items}'],
  ['{name}', '{qty}'],
  ['{/items}'],
  ['Total', '{total}']
];

const TEMPLATE_VALUES = {
  title: 'Заказ 7',
  total: 3,
  items: [
    { name: 'Кассета A', qty: 1 },
    { name: 'Кассета B', qty: 2 }
  ]
};

describe('markdown fill', () => {
  it('substitutes {key} tokens and keeps missing placeholders', () => {
    const filled = fillMarkdown('# Заказ {client}\n\n- {item}: {qty}', { client: 'ООО Ромашка', item: 'Кассета', qty: 3 });
    expect(filled).toBe('# Заказ ООО Ромашка\n\n- Кассета: 3');
    expect(fillMarkdown('{missing}', {})).toBe('{missing}');
  });
});

describe('xlsx fill', () => {
  it('exposes both scalar tokens and repeat-section names for HAG forms', () => {
    const metadata = workbookTemplateMetadata(workbookBuffer([
      ['{#items}', ''],
      ['{name}', '{qty}'],
      ['{/items}', '']
    ]));
    expect(metadata).toEqual({ tokens: ['name', 'qty'], sections: ['items'] });
  });

  it('substitutes scalar tokens and repeats section rows per element', () => {
    const rows = rowsOf(fillWorkbook(workbookBuffer(TEMPLATE_ROWS), TEMPLATE_VALUES));
    expect(rows).toEqual([
      ['Report', 'Заказ 7'],
      ['Кассета A', '1'],
      ['Кассета B', '2'],
      ['Total', '3']
    ]);
  });

  it('keeps placeholders for missing keys inside repeated rows', () => {
    const rows = rowsOf(fillWorkbook(workbookBuffer(TEMPLATE_ROWS), { items: [{ name: 'X' }] }));
    expect(rows).toEqual([
      ['Report', '{title}'],
      ['X', '{qty}'],
      ['Total', '{total}']
    ]);
  });

  it('substitutes scalars when the template carries no sections', () => {
    const rows = rowsOf(fillWorkbook(workbookBuffer([['A', '{x}']]), { x: 'v' }));
    expect(rows).toEqual([['A', 'v']]);
  });

  it('translates relative formulas and preserves repeated-row merges and metadata', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Client', '{client}'],
      ['{#items}', ''],
      ['{name}', 0],
      ['{/items}', '']
    ]);
    sheet.B3 = { t: 'n', v: 0, f: 'IF(A3=\"A3\",A$3+$A3+$A$3,0)' };
    sheet['!merges'] = [{ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }];
    sheet['!rows'] = [];
    sheet['!rows'][2] = { hpx: 32, hidden: true, level: 1 };
    sheet['!cols'] = [{ wch: 24 }];
    XLSX.utils.book_append_sheet(workbook, sheet, 'S');
    const filled = fillWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true }), {
      client: 'Ada',
      items: [{ name: 'X' }, { name: 'Y' }]
    });
    const output = XLSX.read(filled, { type: 'buffer', cellStyles: true });
    const result = output.Sheets.S;
    expect(result.B2.f).toBe('IF(A2=\"A3\",A$3+$A2+$A$3,0)');
    expect(result.B3.f).toBe('IF(A3=\"A3\",A$3+$A3+$A$3,0)');
    expect(result['!merges']).toEqual([
      { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }
    ]);
    expect(result['!rows'][1]).toMatchObject({ hpx: 32, hidden: true, level: 1 });
    expect(result['!rows'][2]).toMatchObject({ hpx: 32, hidden: true, level: 1 });
    expect(result['!cols'][0].wch).toBe(24);
  });

  it('refuses nested sections', () => {
    const nested = [['{#a}'], ['{#b}'], ['{name}'], ['{/b}'], ['{/a}']];
    expect(() => fillWorkbook(workbookBuffer(nested), { a: [{}], b: [{}] }))
      .toThrow(/nested section \{#b\}/);
  });

  it('refuses a section close without its open', () => {
    expect(() => fillWorkbook(workbookBuffer([['x'], ['{/items}'], ['{name}']]), {}))
      .toThrow(/has no matching open/);
  });
});

describe('pdf render', () => {
  it('renders markdown with cyrillic, lists, tables, and code into a readable PDF', async () => {
    const markdown = [
      '# Отчёт по раскрою',
      '',
      'Заказчик: **{client}**',
      '',
      '| Код | Кол-во |',
      '| --- | --- |',
      '| A-1 | 12 |',
      '| B-2 | 4 |',
      '',
      '- пункт один',
      '- пункт два',
      '',
      '```',
      'let x = 1;',
      '```'
    ].join('\n');
    const pdf = await renderPdfFromMarkdown(markdown, { client: 'ООО Ромашка' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(PDFDocument.load(pdf)).resolves.toBeTruthy();
    const text = await pdfText(pdf);
    expect(text).toContain('ООО Ромашка');
    expect(text).toContain('Код');
  });

  it('renders a workbook sheet as a table PDF', async () => {
    const pdf = await renderPdfFromWorkbook(workbookBuffer([['Код', 'Кол-во'], ['A', '1'], ['B', '2']]));
    await expect(PDFDocument.load(pdf)).resolves.toBeTruthy();
    expect(await pdfText(pdf)).toContain('Код');
  });

  it('renders CSV text as a table PDF', async () => {
    const pdf = await renderPdfFromCsv('code,qty\nA,1\n');
    expect(await pdfText(pdf)).toContain('code');
  });

  it('renders a DXF into a landscape drawing PDF', async () => {
    const dxf = ['0','SECTION','2','ENTITIES','0','LINE','8','0','10','0','20','0','11','100','21','50','0','TEXT','8','0','10','10','20','60','40','8','1','Лист 1','0','ENDSEC','0','EOF',''].join('\n');
    const pdf = await renderPdfFromDxf(Buffer.from(dxf, 'utf8'));
    const loaded = await PDFDocument.load(pdf);
    await expect(loaded).toBeTruthy();
    expect(loaded.getPage(0).getWidth()).toBeGreaterThan(loaded.getPage(0).getHeight());
  });

  it('renders an image onto a centered A4 page', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const pdf = await renderPdfFromImage(png, 'image/png');
    await expect(PDFDocument.load(pdf)).resolves.toBeTruthy();
  });

  it('refuses a DXF without drawable entities', async () => {
    const empty = ['0','SECTION','2','ENTITIES','0','ENDSEC','0','EOF',''].join('\n');
    await expect(renderPdfFromDxf(Buffer.from(empty, 'utf8'))).rejects.toThrow(/no drawable entities/);
  });
});

describe('pdf template fill', () => {
  async function templatePdf(text) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([595.28, 841.89]).drawText(text, { x: 100, y: 700, size: 14, font });
    return Buffer.from(await doc.save());
  }

  it('masks {key} tokens and redraws substituted text once per run', async () => {
    const filled = await fillPdfTemplate(await templatePdf('Client: {client}  Date: {date}'), { client: 'ООО Ромашка', date: '2026-10-26' });
    const text = await pdfText(filled);
    expect(text).toContain('Client: ООО Ромашка Date: 2026-10-26');
    expect(text.split('Ромашка').length - 1).toBe(1);
  });

  it('leaves a template without tokens byte-shape compatible', async () => {
    const filled = await fillPdfTemplate(await templatePdf('No tokens here'), {});
    await expect(PDFDocument.load(filled)).resolves.toBeTruthy();
  });
});

describe('services dispatch', () => {
  it('fill names the composed file for the operator\'s typed name and returns the template tokens', async () => {
    const output = await services.fill({
      refs: { template: { name: 'spec.md', payloadMime: 'text/markdown', payloadBase64: b64('# {a}\n{b} and {a}') } },
      draft: { data: { name: 'Out', values: { a: 1 } } }
    });
    expect(output.payload.mime).toBe('text/markdown');
    expect(output.payload.name).toBe('Out.md');
    expect(Buffer.from(output.payload.base64, 'base64').toString()).toBe('# 1\n{b} and 1');
    expect(output.meta.tokens).toEqual(['a', 'b']);
  });

  it('fill returns a filled workbook payload named for the template when no name is typed', async () => {
    const output = await services.fill({
      refs: { template: { name: 'spec.xlsx', payloadMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', payloadBase64: workbookBuffer([['{x}']]).toString('base64') } },
      draft: { data: { values: { x: 'ok' } } }
    });
    expect(output.payload.mime).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(output.payload.name).toBe('spec.xlsx');
    expect(rowsOf(Buffer.from(output.payload.base64, 'base64'))).toEqual([['ok']]);
  });

  it('render-pdf dispatches on the source kind', async () => {
    const output = await services['render-pdf']({
      refs: { source: { name: 'spec.md', payloadMime: 'text/markdown', payloadBase64: b64('# {t}') } },
      draft: { data: { name: 'Out', values: { t: 'v' } } }
    });
    expect(output.payload.mime).toBe('application/pdf');
    expect(output.payload.name).toBe('Out.pdf');
    expect(Buffer.from(output.payload.base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('fill refuses an unsupported template kind', async () => {
    await expect(services.fill({
      refs: { template: { name: 'spec.txt', payloadMime: 'text/plain', payloadBase64: b64('x') } }
    })).rejects.toThrow(/accepts markdown, xlsx, or pdf/);
  });

  it('fill refuses a template ref without a payload', async () => {
    await expect(services.fill({ refs: { template: { name: 'x.md' } } })).rejects.toThrow(/template ref with a payload/);
  });
});
