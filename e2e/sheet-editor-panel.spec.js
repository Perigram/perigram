import { test, expect } from './fixtures.js';

// The sheet editor panel (regression): the inspector's working set and
// selected records render through the shared instance tile — preview,
// identity, lineage slot, compact facts — with no panel-local card
// chrome. Pickers are triggers (SPEC §22.13): picking a sheet or design
// adds it, and the selected instance never renders inside a text input.
// Cassette previews bake the OCCS layer-standard pens (concrete stroke
// colors), whatever preview channel renders them. Artifacts:
// .playwright/sheet-editor-panel.png

const FACADE_URL = process.env.E2E_FACADE_URL || 'http://facade-executor:8790';

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

test('the sheet editor inspector runs on instance tiles and pick-to-add pickers', async ({ app }) => {
  test.setTimeout(300_000);
  await app.installPlugins(['tech-drawing', 'documents', 'facade']);
  await app.connectPlugin('facade', FACADE_URL);
  const { manifest } = await app.seedSpeciesProcess({
    types: ['cassette-template', 'cassette-design', 'sheet-design'],
    via: { 'cassette-template': 'editor' }
  });
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));

  const run = Date.now();
  // The bake construct's stored shape: the evaluated geometry rides
  // fields.geometry, so the declared preview channel
  // (fields.geometry.layerData) resolves like a construct-created record.
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
  const opened = await createInstance(app, 'sheet-design', {
    fields: {
      name: `Probe sheet ${run}`,
      geometry: {
        data: {
          items: [{
            id: 'item-1',
            design_id: String(design._id),
            coords: CUT_SQUARE,
            sourceLayers: LAYER_DATA
          }],
          solution: {
            layouts: [{
              placed_items: [{ item_id: 'item-1', transformation: { rotation: 0, translation: [150, 400] } }]
            }]
          }
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
    },
  });
  await createInstance(app, 'sheet-design', { fields: { name: `Sibling sheet ${run}` } });

  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'sheet-design');
  expect(list?.route, 'Expected a compiled sheet-design list screen').toBeTruthy();
  await app.gotoClient(list.route);
  await page.getByText(`Probe sheet ${run}`, { exact: true }).first().click();
  const editorAction = page.locator('.surface-header button .pi-file-edit').first();
  await expect(editorAction).toBeVisible({ timeout: 20_000 });
  await editorAction.click();
  const workspace = page.locator('.designer-workspace').first();
  await expect(workspace).toBeVisible({ timeout: 30_000 });

  // The inspector carries the active record and the working-set row as
  // instance tiles — the record identity reads on the tile, not through
  // panel-local fact rows.
  const tiles = page.locator('.instance-inline-tile');
  await expect(tiles).toHaveCount(2, { timeout: 15_000 });
  await expect(tiles.filter({ hasText: `Probe sheet ${run}` })).toHaveCount(2);

  // The cassette picker is a trigger; its option rows carry the
  // layer-standard pens (concrete stroke colors, never currentColor).
  await page.getByRole('button', { name: 'Select design' }).click();
  const optionRows = page.locator('.instance-option-row');
  await expect(optionRows).toHaveCount(1, { timeout: 15_000 });
  const row = optionRows.first();
  await expect(row.filter({ hasText: `Probe design ${run}` })).toBeVisible();
  await expect(row.locator('svg'), 'the option row preview thumb canvas').toBeVisible({ timeout: 20_000 });
  const previewStrokes = await row.locator('svg [stroke]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('stroke')));
  expect(
    previewStrokes.some(stroke => /^#/.test(stroke)),
    `Expected layer-standard pen strokes on the cassette preview, got ${JSON.stringify(previewStrokes)}`
  ).toBeTruthy();

  // Picking a design places it on the active sheet (pick-to-add) and the
  // inspector shows the placed record as its own tile.
  await page.getByRole('option', { name: `Probe design ${run}` }).click();
  await expect(page.locator('.instance-inline-tile')
    .filter({ hasText: `Probe design ${run}` })).toBeVisible({ timeout: 10_000 });

  // Picking a sheet from the sheet picker joins the working set.
  await page.getByRole('button', { name: 'Select sheet' }).click();
  const sheetRow = page.locator('.instance-option-row').filter({ hasText: `Sibling sheet ${run}` }).first();
  await expect(sheetRow).toBeVisible({ timeout: 15_000 });
  await page.getByRole('option', { name: `Sibling sheet ${run}` }).click();
  // The active record's tile, the joined sibling's tile, and the two
  // working-set rows.
  await expect(page.locator('.instance-inline-tile')).toHaveCount(3, { timeout: 15_000 });

  await page.screenshot({ path: '.playwright/sheet-editor-panel.png', fullPage: false });
  await app.expectCleanRuntime();
});
