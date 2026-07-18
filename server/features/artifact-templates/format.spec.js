import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  assertTemplateValues,
  normalizeTemplateLayout,
  parseDxfTemplate,
  parsePdfTemplate,
  renderDxfTemplate,
  renderPdfTemplate,
  templateVariables
} from './format.js';

const DXF = `0
SECTION
2
HEADER
9
$EXTMIN
10
0
20
0
9
$EXTMAX
10
100
20
50
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
5
10A
8
CUT
10
0
20
0
11
100
21
0
0
TEXT
5
10B
8
TEXT
10
10
20
20
40
5
1
PROJECT
0
ENDSEC
0
EOF
`;

describe('artifact template formats', () => {
  it('extracts stable DXF entities and renders move, delete, and variable edits without rebuilding unrelated records', () => {
    const layout = parseDxfTemplate(Buffer.from(DXF));
    expect(layout.format).toBe('DXF');
    expect(layout.pages[0]).toMatchObject({ x: 0, y: 0, width: 100, height: 50 });
    expect(layout.pages[0].items.map(item => item.id)).toEqual(['handle-10A', 'handle-10B']);

    const [line, text] = layout.pages[0].items;
    line.deleted = true;
    text.offset = { x: 5, y: -2 };
    text.variable = { name: 'projectName', type: 'string', required: true, default: 'Default' };

    const rendered = renderDxfTemplate(Buffer.from(DXF), layout, { projectName: 'Facade A' }).toString('utf8');
    expect(rendered).not.toContain('10A');
    expect(rendered).toContain('10B');
    expect(rendered).toContain('Facade A');
    expect(rendered).toMatch(/10\n15\n20\n18/);
  });

  it('extracts positioned PDF text and produces a valid edited PDF', async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([300, 200]);
    const font = await source.embedFont(StandardFonts.Helvetica);
    page.drawText('PROJECT', { x: 40, y: 120, size: 12, font });
    const sourceBuffer = Buffer.from(await source.save());

    const layout = await parsePdfTemplate(sourceBuffer);
    const item = layout.pages[0].items.find(entry => entry.text === 'PROJECT');
    expect(item).toBeTruthy();
    item.variable = { name: 'projectName', type: 'string', required: true, default: 'Default' };
    item.offset = { x: 10, y: -5 };

    const rendered = await renderPdfTemplate(sourceBuffer, layout, { projectName: 'Facade A' });
    const output = await PDFDocument.load(rendered);
    expect(output.getPageCount()).toBe(1);
    expect(rendered.length).toBeGreaterThan(sourceBuffer.length / 2);
  });

  it('normalizes variables and rejects missing required values and duplicate item ids', () => {
    const layout = normalizeTemplateLayout({
      format: 'PDF',
      pages: [{ number: 1, width: 100, height: 100, items: [{
        id: 'field-1', kind: 'text', text: 'A', variable: { name: 'amount', type: 'number', required: true }
      }] }]
    }, 'PDF');
    expect(templateVariables(layout)).toEqual([{ name: 'amount', type: 'number', required: true, default: 'A' }]);
    expect(() => assertTemplateValues(layout, {})).toThrow('Template variable amount must be a number');
    expect(() => normalizeTemplateLayout({
      format: 'DXF',
      pages: [{ items: [{ id: 'same' }, { id: 'same' }] }]
    }, 'DXF')).toThrow('Duplicate template layout item');
  });
});
