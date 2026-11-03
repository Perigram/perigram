import { test, expect } from './fixtures.js';

// The designer's assembly canvas is host-painted: no SVG dimension text,
// native dimensions, and the palette's layer rows drive the host layers,
// including hiding every layer. Artifact: .playwright/cassette-designer-native.png

const hostState = async (canvas) => {
  const handle = await canvas.locator('iframe').first().elementHandle();
  const frame = await handle.contentFrame();
  return {
    layers: () => frame.evaluate(() => [...window.cadcraft.doc.layers.values()].map(layer => ({ name: layer.name, on: layer.on }))),
    dimensions: () => frame.evaluate(() => window.cadcraft.doc.all()
      .filter(entity => entity.type === 'dim')
      .map(entity => ({ text: entity.text, color: entity.color }))),
    hatches: () => frame.evaluate(() => window.cadcraft.doc.all()
      .filter(entity => entity.type === 'hatch')
      .map(entity => ({ tr: entity.tr, loops: entity.loops.length })))
  };
};

test('designer canvas paints native dimensions and the palette drives every layer', async ({ app }) => {
  test.setTimeout(300_000);
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');
  await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette-template'], via: { 'cassette-template': 'editor' } });
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette-template');
  expect(list?.route, 'Expected a compiled cassette list screen').toBeTruthy();
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  await page.addInitScript(() => window.localStorage.setItem(
    'perigram:onboarding:cassette-designer-v2',
    JSON.stringify({ dismissed: true, dismissedAt: Date.now() })
  ));
  await app.gotoClient(list.route);
  await page.locator('main').getByRole('button', { name: 'New', exact: true }).click();

  const canvas = page.locator('.designer-workspace__canvas').first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(canvas.locator('iframe').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(5000);

  const svgText = await canvas.locator('svg').first().evaluate(el => (
    [...el.querySelectorAll('text')].map(node => node.textContent.trim()).filter(Boolean)
  ));
  expect(svgText, 'the SVG paints no dimension labels').toEqual([]);
  const host = await hostState(canvas);
  const dims = await host.dimensions();
  expect(dims.map(dim => dim.text), 'the host paints the cassette dimensions').toEqual(expect.arrayContaining(['A', 'B']));
  expect(dims.every(dim => dim.color === 7), 'native dimensions draw in the canvas ink').toBe(true);
  expect((await host.hatches())[0], 'the face layer is a native hatch').toMatchObject({ tr: 90, loops: 1 });
  const dimensionTarget = canvas.locator('svg g.cursor-pointer.select-none').first();
  await expect(dimensionTarget, 'the SVG carries a native dimension edit target').toBeVisible({ timeout: 10_000 });
  await dimensionTarget.click();
  await expect(canvas.locator('[contenteditable="true"]'), 'a native dimension label opens its authored field').toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  const painted = await canvas.screenshot();

  const layers = await host.layers();
  const palette = page.locator('.designer-workspace__palette');
  const labels = palette.locator('label');
  expect(await labels.count(), 'the palette lists the drawing layers').toBeGreaterThan(0);
  for (let index = 0; index < await labels.count(); index++) {
    await labels.nth(index).click({ force: true });
    await page.waitForTimeout(300);
  }
  const hidden = await host.layers();
  expect(
    hidden.filter(layer => layer.on).map(layer => layer.name),
    'unchecking every row hides every host layer'
  ).toEqual([]);

  const dimensionRow = palette.locator('label').filter({ hasText: '5_1_Размер_Кассета' }).first();
  await dimensionRow.click({ force: true });
  await page.waitForTimeout(400);
  const shown = await host.layers();
  expect(shown.filter(layer => layer.on).map(layer => layer.name)).toEqual(['5_1_Размер_Кассета']);
  expect(layers.length).toBeGreaterThan(0);
  expect(Buffer.compare(await canvas.screenshot(), painted), 'the palette repaints the canvas').not.toBe(0);

  await canvas.screenshot({ path: '.playwright/cassette-designer-native.png' });
  await app.expectCleanRuntime();
});
