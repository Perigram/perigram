import { test, expect } from './fixtures.js';
import { writeFileSync } from 'node:fs';

// The sheet editor panel (regression): the working set is the opened
// record's lineage family — sheets sharing its parents — on one wrapped
// rack of movable, rotatable sheets; pickers offer family members and
// cassette designs only, never an org-wide pool. Instance surfaces are
// tiles (SPEC §22.13) and no raw record id ever renders (the UI-labels
// law). Cassette previews and canvas placements follow the layer
// standards: the OCCS base pens, an org-authored override on top.
// Artifacts: .playwright/sheet-editor-panel.png, sheet-editor-family.png

const FACADE_URL = process.env.E2E_FACADE_URL || 'http://facade-executor:8790';
const ORG_PEN_COLOR = '#00ffcc';

const CUT_SQUARE = [[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]];
const FOLD_LINE = [[20, 150], [280, 150]];
const LAYER_DATA = [
  { layer: 'cut.outer', coordinates: CUT_SQUARE },
  { layer: 'fold.route', coordinates: FOLD_LINE }
];

async function createInstance(app, typeId, body) {
  const response = await app.request.post(`/api/instances/${typeId}`, { data: body });
  expect(response.ok(), `${typeId} create: ${await response.text()}`).toBeTruthy();
  return await response.json();
}

function sheetBody(name, designId) {
  return {
    fields: {
      name,
      geometry: {
        data: {
          items: [{
            id: 'item-1',
            design_id: designId ? String(designId) : '',
            coords: CUT_SQUARE,
            sourceLayers: LAYER_DATA
          }],
          solution: {
            layouts: [{
              placed_items: [{ item_id: 'item-1', transformation: { rotation: 0, translation: [150, 400] } }]
            }]
          },
          sheetPolygon: { outer: [[0, 0], [1220, 0], [1220, 2440], [0, 2440], [0, 0]], inner: [] }
        },
        preview: {
          viewBox: '0 0 1220 2440',
          layers: [{
            name: 'contour.material_sheet',
            standardCode: 'contour.material_sheet',
            paths: ['M 0 0 H 1220 V 2440 H 0 Z']
          }]
        }
      }
    }
  };
}

async function openSheetEditor(app, name) {
  const page = app.page;
  const list = (app.seedManifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'sheet-design');
  await app.gotoClient(list.route);
  await page.getByText(name, { exact: true }).first().click();
  const editorAction = page.locator('.surface-header button .pi-file-edit').first();
  await editorAction.waitFor({ timeout: 20000 });
  await editorAction.click();
  await page.locator('.designer-workspace').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
}

// No text node anywhere on the page carries a raw 24-hex record id.
async function expectNoRawIds(page) {
  const hits = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found = [];
    let node;
    while ((node = walker.nextNode())) {
      for (const match of (node.textContent || '').matchAll(/\b[0-9a-f]{24}\b/g)) {
        found.push(match[0]);
      }
    }
    return found;
  });
  expect(hits, `raw record ids rendered: ${JSON.stringify(hits)}`).toEqual([]);
}

test('a lineage-less sheet edits alone: tiles, pick-to-add designs, OCCS pens', async ({ app }) => {
  test.setTimeout(300_000);
  await app.installPlugins(['tech-drawing', 'documents', 'facade']);
  await app.connectPlugin('facade', FACADE_URL);
  app.seedManifest = (await app.seedSpeciesProcess({
    types: ['cassette-template', 'cassette-design', 'sheet-design'],
    via: { 'cassette-template': 'editor' }
  })).manifest;
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));

  const run = Date.now();
  const design = await createInstance(app, 'cassette-design', {
    fields: {
      name: `Probe design ${run}`,
      geometry: {
        layerData: LAYER_DATA,
        polygons: [{ coordinates: CUT_SQUARE }],
        nestingPolygons: [{ coordinates: CUT_SQUARE }]
      }
    }
  });
  await createInstance(app, 'sheet-design', { fields: { name: `Lonely sheet ${run}` } });
  const opened = await createInstance(app, 'sheet-design', sheetBody(`Probe sheet ${run}`, design._id, run));
  expect(opened.lineage || {}).toEqual({});

  await openSheetEditor(app, `Probe sheet ${run}`);

  // The inspector carries the active record and the working-set row as
  // instance tiles; one face per ref.
  const tiles = page.locator('.instance-inline-tile');
  await expect(tiles).toHaveCount(2, { timeout: 15000 });
  await expect(tiles.filter({ hasText: `Probe sheet ${run}` })).toHaveCount(2);
  await expect(page.locator('.instance-inline-tile ~ .p-chip')).toHaveCount(0);

  // No family, no sheet picker and no add-all: the lonely sibling from
  // the org pool is never offered.
  await expect(page.getByRole('button', { name: 'Select sheet' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /add all sheets/i })).toHaveCount(0);

  // The cassette picker is a trigger; its option rows carry the
  // layer-standard pens (concrete stroke colors, never currentColor).
  await page.getByRole('button', { name: 'Select design' }).click();
  const optionRows = page.locator('.instance-option-row');
  await expect(optionRows).toHaveCount(1, { timeout: 150000 });
  const row = optionRows.first();
  await expect(row.filter({ hasText: `Probe design ${run}` })).toBeVisible();
  await expect(row.locator('svg'), 'the option row preview thumb canvas').toBeVisible({ timeout: 20000 });
  const previewStrokes = await row.locator('svg [stroke]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('stroke')));
  expect(
    previewStrokes.some(stroke => /^#/.test(stroke)),
    `Expected layer-standard pen strokes on the cassette preview, got ${JSON.stringify(previewStrokes)}`
  ).toBeTruthy();
  await page.getByRole('option', { name: `Probe design ${run}` }).click();
  await expect(page.locator('.instance-inline-tile')
    .filter({ hasText: `Probe design ${run}` })).toBeVisible({ timeout: 100_000 });

  await expectNoRawIds(page);
  await page.screenshot({ path: '.playwright/sheet-editor-panel.png', fullPage: false });
  await app.expectCleanRuntime();
});

test('the working set is the lineage family on a movable wrapped rack', async ({ app }) => {
  test.setTimeout(300_000);
  await app.installPlugins(['tech-drawing', 'documents', 'facade']);
  await app.connectPlugin('facade', FACADE_URL);

  // The family parent: an org-declared type whose children edge names
  // sheet-design and keys the lineage — the generic containment
  // contract, no domain hardcoding.
  await app.declareType({
    id: 'probe-family',
    class: 'item',
    name: 'Probe family',
    fields: { name: { base: 'string', identifier: true } },
    edges: { children: { sheets: { types: ['sheet-design'], lineageKey: 'familyId' } } }
  });
  app.seedManifest = (await app.seedSpeciesProcess({
    types: ['probe-family', 'cassette-design', 'sheet-design', 'layer-standard', 'pen-template']
  })).manifest;
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  const run = Date.now();

  // An org layer standard overriding cut.outer's pen: previews and the
  // canvas must both follow it.
  const pen = await createInstance(app, 'pen-template', {
    fields: { name: 'Probe pen', stroke: { color: ORG_PEN_COLOR, weight: 2, pattern: 'DOTTED' } }
  });
  await createInstance(app, 'layer-standard', {
    fields: { code: 'cut.outer' },
    relations: { defaultPen: { type: 'pen-template', id: String(pen._id) } }
  });

  const design = await createInstance(app, 'cassette-design', {
    fields: {
      name: `Family design ${run}`,
      geometry: {
        layerData: LAYER_DATA,
        polygons: [{ coordinates: CUT_SQUARE }],
        nestingPolygons: [{ coordinates: CUT_SQUARE }]
      }
    }
  });
  const parent = await createInstance(app, 'probe-family', { fields: { name: `Job ${run}` } });
  const withFamily = body => ({ ...body, lineage: { familyId: String(parent._id) } });
  await createInstance(app, 'sheet-design', withFamily(sheetBody(`Family sheet 2 ${run}`, design._id, run)));
  await createInstance(app, 'sheet-design', withFamily(sheetBody(`Family sheet 3 ${run}`, design._id, run)));
  const opened = await createInstance(app, 'sheet-design', withFamily(sheetBody(`Family sheet 1 ${run}`, design._id)));
  // An org sheet outside the family: never offered.
  await createInstance(app, 'sheet-design', sheetBody(`Stranger sheet ${run}`, design._id));
  expect(String((opened.lineage || {}).familyId || '')).toContain(String(parent._id));

  await openSheetEditor(app, `Family sheet 1 ${run}`);

  // The family joined the canvas: three sheets on the rack, the active
  // record and three working-set rows as tiles. Tiles carry no lineage
  // breadcrumb (the trace chain owns lineage) and no raw id renders.
  const canvas = page.locator('svg[role="application"]');
  await expect(canvas.getByText(`Family sheet 2 ${run}`)).toBeVisible({ timeout: 150000 });
  await expect(canvas.getByText(`Family sheet 3 ${run}`)).toBeVisible();
  await expect(page.locator('.instance-inline-tile')).toHaveCount(4, { timeout: 150000 });
  await expectNoRawIds(page);

  // All family members sit on the canvas: the sheet picker stays away
  // and the stranger is never listed.
  await expect(page.getByRole('button', { name: 'Select sheet' })).toHaveCount(0);

  // Previews and placements follow the org standard's pen.
  await page.getByRole('button', { name: 'Select design' }).click();
  await page.waitForTimeout(2500);
  const pickerStrokes = await page.locator('.instance-option-row svg [stroke]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('stroke')));
  expect(pickerStrokes, `org pen on the picker preview: ${JSON.stringify(pickerStrokes)}`)
    .toContain(ORG_PEN_COLOR);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Select design' }).click();
  await page.getByRole('option', { name: `Family design ${run}` }).click();
  await page.waitForTimeout(1500);
  const canvasStrokes = await canvas.locator('[stroke]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('stroke')));
  expect(canvasStrokes, `org pen on the placed cut.outer: ${JSON.stringify(canvasStrokes)}`)
    .toContain(ORG_PEN_COLOR);

  // A removed family member is the picker's only offer; add-all brings
  // the family back. Removal rides the row menu (§22.12).
  const sheet3Row = page.locator('.instance-inline-tile').filter({ hasText: `Family sheet 3 ${run}` });
  await sheet3Row.locator('button[aria-label="More"]').click();
  await page.getByRole('button', { name: 'Remove sheet' }).click();
  await page.waitForTimeout(800);
  await expect(canvas.getByText(`Family sheet 3 ${run}`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Select sheet' }).click();
  const sheetRows = page.locator('.instance-option-row');
  await expect(sheetRows).toHaveCount(1, { timeout: 150000 });
  await expect(sheetRows.first()).toContainText(`Family sheet 3 ${run}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /add all sheets/i }).click();
  await expect(canvas.getByText(`Family sheet 3 ${run}`)).toBeVisible({ timeout: 150000 });

  // Sheets move by their label band and rotate by their action dial.
  const canvasBox = await canvas.boundingBox();
  const clampInto = (x, y) => ({
    x: Math.min(Math.max(x, canvasBox.x + 8), canvasBox.x + canvasBox.width - 8),
    y: Math.min(Math.max(y, canvasBox.y + 8), canvasBox.y + canvasBox.height - 8)
  });
  const movingGroup = canvas.locator('g', { hasText: `Family sheet 2 ${run}` }).first();
  const before = await movingGroup.getAttribute('transform');
  const labelBox = await canvas.getByText(`Family sheet 2 ${run}`).boundingBox();
  const labelPoint = clampInto(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
  await page.mouse.move(labelPoint.x, labelPoint.y);
  await page.mouse.down();
  await page.mouse.move(labelPoint.x + 250, labelPoint.y + 150, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await movingGroup.getAttribute('transform');
  expect(after, `sheet moved: ${before} -> ${after}`).not.toBe(before);

  const sheet3Box = await canvas.locator('g', { hasText: `Family sheet 3 ${run}` }).first().boundingBox();
  const sheet3Point = clampInto(sheet3Box.x + sheet3Box.width * 0.5, sheet3Box.y + sheet3Box.height * 0.7);
  await page.mouse.click(sheet3Point.x, sheet3Point.y);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Actions' }).first().click({ force: true });
  await page.getByRole('menuitem', { name: 'Rotate' }).first().click({ force: true });
  await page.waitForTimeout(800);
  const rotated = await canvas.locator('g', { hasText: `Family sheet 3 ${run}` }).first()
    .getAttribute('transform');
  expect(rotated, `sheet rotated: ${rotated}`).toContain('rotate(90');

  // A deleted parent leaves every tile on resolved names — the raw id
  // never renders.
  const deleted = await app.request.delete(`/api/instances/probe-family/${parent._id}`);
  expect(deleted.ok(), await deleted.text()).toBeTruthy();
  await openSheetEditor(app, `Family sheet 1 ${run}`);
  await expect(page.locator('.instance-inline-tile')).toHaveCount(4, { timeout: 150000 });
  await expectNoRawIds(page);

  await page.screenshot({ path: '.playwright/sheet-editor-family.png', fullPage: false });
  writeFileSync('.playwright/sheet-editor-family.json', JSON.stringify({
    run,
    opened: String(opened._id),
    parent: String(parent._id)
  }));
  await app.expectCleanRuntime();
});
