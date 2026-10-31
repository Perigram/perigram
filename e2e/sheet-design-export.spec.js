import { test, expect } from './fixtures.js';
import { readFileSync, writeFileSync } from 'node:fs';

// The sheet-design DXF export (a derived export affordance over the
// plugin's binding): pressing it produces a downloaded DXF file — the
// stored export is presented to the caller. Artifacts:
// test-results/sheet-design-export.json
const ART = 'test-results/sheet-design-export.json';
const CUT_SQUARE = [[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]];
const LAYER_DATA = [
  { layer: 'cut.outer', coordinates: CUT_SQUARE },
  { layer: 'fold.route', coordinates: [[20, 150], [280, 150]] }
];

test('exporting a sheet design downloads the DXF', async ({ app }) => {
  test.setTimeout(180_000);
  await app.installPlugins(['tech-drawing', 'documents', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');
  const { manifest } = await app.seedSpeciesProcess({ types: ['sheet-design', 'cassette-design'] });

  const response = await app.request.post('/api/instances/sheet-design', {
    data: {
      fields: {
        name: `Export sheet ${Date.now()}`,
        geometry: {
          data: {
            items: [{ id: 'item-1', design_id: '', coords: CUT_SQUARE, sourceLayers: LAYER_DATA }],
            solution: { layouts: [{ placed_items: [{ item_id: 'item-1', transformation: { rotation: 0, translation: [150, 400] } }] }] },
            sheetPolygon: { outer: [[0, 0], [1220, 0], [1220, 2440], [0, 2440], [0, 0]], inner: [] }
          },
          preview: {
            viewBox: '0 0 1220 2440',
            layers: [
              { name: 'contour.material_sheet', standardCode: 'contour.material_sheet', paths: ['M 0 0 H 1220 V 2440 H 0 Z'] },
              { name: 'cut.outer', standardCode: 'cut.outer', paths: ['M 150 400 H 450 V 700 H 150 Z'] }
            ]
          }
        }
      }
    }
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const sheet = await response.json();

  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'sheet-design');
  expect(list?.route).toBeTruthy();
  await app.gotoClient(list.route);
  await app.page.getByText(`Export sheet`, { exact: false }).first().click();
  const detail = app.page.locator('main');
  await detail.waitFor({ timeout: 30_000 });

  const exportButton = app.page.getByRole('button', { name: /dxf/i }).first();
  await exportButton.waitFor({ timeout: 30_000 });
  const downloadPromise = app.page.waitForEvent('download', { timeout: 30_000 }).catch(async () => {
    // window.open lands the download on a popup page in this browser.
    const popup = await app.page.context().waitForEvent('page', { timeout: 10_000 }).catch(() => null);
    return popup ? popup.waitForEvent('download', { timeout: 20_000 }) : null;
  });
  await exportButton.click();
  const download = await downloadPromise;
  expect(download, 'the export downloads a file').toBeTruthy();
  const fileName = download.suggestedFilename();
  expect(fileName).toMatch(/\.dxf$/i);
  const path = await download.path();
  const content = readFileSync(path, 'utf8');
  expect(content).toContain('AC1015');
  expect(content).toContain('EOF');

  writeFileSync(ART, JSON.stringify({
    sheetId: String(sheet._id),
    fileName,
    bytes: content.length
  }, null, 2));
  await app.expectCleanRuntime();
});
