import { test, expect } from './fixtures.js';

// The designer's assembly canvas is host-painted: no SVG dimension text,
// native dimensions, and the palette's layer rows drive the host layers,
// including hiding every layer; the canvas follows CadCraft's navigation
// law (notched wheel zooms in at the cursor, trackpad scrolls pan) and a
// dimension label opens its editor inside the canvas whatever sticky
// position an earlier drag left behind.
// Artifacts: .playwright/cassette-designer-native.png, -nav.png

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
  await page.locator('main').getByRole('button', { name: /^New / }).click();

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

test('assembly canvas wheel follows CadCraft and dimension editors stay in view', async ({ app }) => {
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
  await page.locator('main').getByRole('button', { name: /^New / }).click();

  const canvas = page.locator('.designer-workspace__canvas').first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(canvas.locator('iframe').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(5000);

  const svg = canvas.locator('svg').first();
  const viewBoxOf = async () => {
    const value = await svg.getAttribute('viewBox');
    const [x, y, w, h] = value.split(/\s+/).map(Number);
    return { x, y, w, h };
  };

  // A notched wheel up zooms in at the cursor, like CadCraft.
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await viewBoxOf();
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(300);
  const zoomed = await viewBoxOf();
  expect(zoomed.w, 'wheel up zooms in').toBeLessThan(before.w);

  // A touchpad-style scroll pans with the fingers instead of zooming.
  await svg.evaluate((el, deltaY) => {
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaX: 0,
      deltaY,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    }));
  }, -3.5);
  await page.waitForTimeout(300);
  const panned = await viewBoxOf();
  expect(panned.w, 'trackpad scroll keeps the zoom').toBeCloseTo(zoomed.w, 6);
  expect(panned.x + panned.y, 'trackpad scroll pans').not.toBeCloseTo(zoomed.x + zoomed.y, 6);

  // A dimension editor opens inside the canvas even when an earlier drag
  // left a sticky position beyond the current canvas bounds.
  await page.evaluate(() => window.sessionStorage.setItem(
    'perigram:cassette-designer-v2:inline-editor-position',
    JSON.stringify({ x: 4000, y: 2400 })
  ));
  await canvas.locator('svg g.cursor-pointer.select-none').first().click();
  const editor = canvas.locator('[contenteditable="true"]').first();
  await expect(editor, 'a dimension label opens its authored field').toBeVisible({ timeout: 10_000 });
  const editorBox = await editor.boundingBox();
  const canvasBox = await canvas.boundingBox();
  expect(editorBox.x, 'the editor stays inside the canvas').toBeGreaterThanOrEqual(canvasBox.x);
  expect(editorBox.y, 'the editor stays inside the canvas').toBeGreaterThanOrEqual(canvasBox.y);
  expect(editorBox.x + editorBox.width, 'the editor stays inside the canvas').toBeLessThanOrEqual(canvasBox.x + canvasBox.width + 1);
  expect(editorBox.y + editorBox.height, 'the editor stays inside the canvas').toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 1);

  // A cleared selection keeps every face clickable: the next face click
  // selects it again whatever workpiece owns it. The click lands clear
  // of the section drag handles that own the face's midlines.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const faceHit = canvas.locator('svg path[data-designer-face-id]').first();
  await expect(faceHit, 'faces stay clickable with nothing selected').toBeVisible({ timeout: 10_000 });
  await faceHit.click({ position: { x: 40, y: 40 } });
  await expect(
    page.locator('[data-designer-panel-editor="faceActions"]'),
    'a face click after deselect selects the face'
  ).toBeVisible({ timeout: 10_000 });
  await canvas.screenshot({ path: '.playwright/cassette-designer-native-nav.png' });

  await app.expectCleanRuntime();
});
