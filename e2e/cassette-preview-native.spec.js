import { test, expect } from './fixtures.js';

// The cassette view is the native CadCraft canvas: dimensions and layers
// come from the host, and the layer button toggles them.

test('cassette view renders native layers and dimensions with layer control', async ({ app }) => {
  test.setTimeout(300_000);
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');
  await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette-template'], via: { 'cassette-template': 'editor' } });
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette-template');
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  await page.addInitScript(() => window.localStorage.setItem(
    'perigram:onboarding:cassette-designer-v2',
    JSON.stringify({ dismissed: true, dismissedAt: Date.now() })
  ));
  await app.gotoClient(list.route);
  await page.locator('main').getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.designer-workspace__canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(4000);
  await page.locator('[data-designer-toolbar]').getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(4000);
  await app.gotoClient(list.route);
  await page.getByText('New Cassette', { exact: false }).first().click();
  const preview = page.locator('[data-cassette-preview="true"]').first();
  await expect(preview).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });
  const frame = await (await preview.locator('iframe').first().elementHandle()).contentFrame();
  const host = await frame.evaluate(() => ({
    layers: [...window.cadcraft.doc.layers.values()].map(layer => ({ name: layer.name, on: layer.on })),
    dims: window.cadcraft.doc.all().filter(entity => entity.type === 'dim').length
  }));
  expect(host.dims, 'the cassette view draws native dimensions').toBeGreaterThan(0);
  expect(host.layers.some(layer => layer.name === '5_1_Размер_Кассета'), 'the dimension layer is native')
    .toBe(true);
  const root = page.locator('[data-cassette-preview-root="true"]').first();
  await root.getByRole('button', { name: 'Layers' }).click();
  const faceLayer = root.locator('label').filter({ hasText: '1_1_Лицо_Кассеты' }).first();
  await faceLayer.click();
  const hidden = await frame.evaluate(() => window.cadcraft.doc.layers.get('1_1_Лицо_Кассеты')?.on);
  expect(hidden, 'the layer control toggles the native layer').toBe(false);
  await page.screenshot({ path: '.playwright/cassette-preview-native.png' });
  await app.expectCleanRuntime();
});
