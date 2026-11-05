import { test, expect } from './fixtures.js';

// The face editor's boolean fold against the face law (workers/facade
// SPEC — a sketch face's result is the region on the child's side of the
// datum; every committed edit refreshes the cassette context live).
// Drives a child face: delete the default rectangle, draw a replacement
// on the parent's side of the datum, flip its op. Artifacts:
// .playwright/cassette-face-editor-*.png

const CANVAS = '[role="application"]';

const shapeRows = async (page) => {
  const panel = page.locator('.designer-workspace__inspector .profile-shapes-panel');
  if (!await panel.count()) return [];
  return panel.evaluate(node => Array.from(node.querySelectorAll(':scope > div')).map(row => ({
    label: row.querySelector('button[aria-label]')?.getAttribute('aria-label'),
    tag: row.querySelector('.p-tag')?.textContent?.trim() || null
  })));
};

// The CadCraft frame's verdict: annotation hatch polygons (the editor's
// live face result), assembly polys per layer, and cut polygons.
const canvasVerdict = async (page) => {
  const frame = page.frames().find(f => f !== page.mainFrame() && f.url().includes('embed=1'));
  if (!frame) return { error: 'no cadcraft frame' };
  return frame.evaluate(() => {
    const ringArea = (pts) => {
      let area = 0;
      for (let i = 0; i < pts.length; i += 2) {
        const j = (i + 2) % pts.length;
        area += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
      }
      return Math.round(area / 2);
    };
    const ringBounds = (pts) => {
      const xs = [], ys = [];
      for (let i = 0; i + 1 < pts.length; i += 2) { xs.push(pts[i]); ys.push(pts[i + 1]); }
      return {
        minX: Math.round(Math.min(...xs)), maxX: Math.round(Math.max(...xs)),
        minY: Math.round(Math.min(...ys)), maxY: Math.round(Math.max(...ys))
      };
    };
    const all = window.cadcraft?.doc?.all?.() || [];
    return {
      hatchLoops: all
        .filter(entity => entity.type === 'hatch' && entity.layer === 'perigram-profile-annotations')
        .flatMap(entity => (entity.loops || []).map(loop => ({
          area: ringArea(loop),
          bounds: ringBounds(loop)
        }))),
      cutInner: all
        .filter(entity => entity.type === 'poly' && entity.layer === 'CUT_INNER')
        .map(entity => {
          const pts = (entity.pts || []).flatMap(point => [point.x, point.y]);
          return { area: ringArea(pts), bounds: ringBounds(pts) };
        })
    };
  });
};

test('face editor keeps the datum side live through the cassette', async ({ app }) => {
  test.setTimeout(420_000);
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.connectPlugin('facade', process.env.E2E_FACADE_URL || 'http://facade-executor:8790');
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
  const inspector = page.locator('.designer-workspace__inspector').first();

  // Grow a child face from the root face's top edge shard.
  const edgePoint = async () => page.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll('svg'));
    const svg = svgs.find(node => node.querySelectorAll('line[stroke-width="20"]').length);
    if (!svg) return null;
    const lines = Array.from(svg.querySelectorAll('line[stroke-width="20"]'));
    const pts = lines.map(line => {
      const point = svg.createSVGPoint();
      point.x = (Number(line.getAttribute('x1')) + Number(line.getAttribute('x2'))) / 2;
      point.y = (Number(line.getAttribute('y1')) + Number(line.getAttribute('y2'))) / 2;
      const screen = point.matrixTransform(svg.getScreenCTM());
      return { x: screen.x, y: screen.y };
    }).filter(item => Number.isFinite(item.x));
    pts.sort((a, b) => a.y - b.y);
    return pts[0] || null;
  });
  let edge = await edgePoint();
  for (let attempt = 0; attempt < 10 && !edge; attempt += 1) {
    await page.waitForTimeout(1500);
    edge = await edgePoint();
  }
  expect(edge, 'a free edge shard handle').toBeTruthy();
  await page.mouse.move(edge.x, edge.y);
  await page.waitForTimeout(600);
  await page.mouse.click(edge.x, edge.y);
  await page.getByRole('button', { name: 'Add face' }).click();
  await page.waitForTimeout(1500);

  // Open the child face's shape editor.
  await page.mouse.click(edge.x, edge.y - 30);
  await page.waitForTimeout(1200);
  await inspector.getByRole('button', { name: 'Edit shape' }).click();
  const dialog = page.locator('[data-sketch-mode="face"]').first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const canvas = dialog.locator(CANVAS).first();
  await expect(canvas).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });
  await page.waitForTimeout(1500);
  const panel = await shapeRows(page);
  expect(panel.length, 'the converted face seeds its default rectangle').toBe(1);
  expect(panel[0].tag).toBe('Add');

  // Replace the default rectangle with one drawn on the parent's side of
  // the datum (inside the host panel, below the top edge).
  await inspector.locator('.profile-shapes-panel button[aria-label^="Rectangle s"]').first().click();
  await page.waitForTimeout(400);
  await inspector.locator('.profile-shapes-panel button[aria-label^="Rectangle s"]')
    .locator('xpath=ancestor::div[contains(@class,"border-b")]')
    .first()
    .getByRole('button', { name: /^Delete/ }).click();
  await page.waitForTimeout(900);
  expect(await shapeRows(page), 'the default rectangle is gone').toEqual([]);

  const tools = page.locator('.designer-workspace__palette');
  const drawButton = tools.locator('button[aria-label="Rectangle"]').first();
  await drawButton.click();
  await expect(drawButton).toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.waitForTimeout(200);
  const cbox = await canvas.boundingBox();
  await page.mouse.click(cbox.x + cbox.width * 0.4, cbox.y + cbox.height * 0.42);
  await page.waitForTimeout(300);
  await page.mouse.click(cbox.x + cbox.width * 0.6, cbox.y + cbox.height * 0.58);
  await expect(drawButton).not.toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.waitForTimeout(1500);

  // The face keeps the material on its side of the datum: a rectangle on
  // the parent's side authors no face region, and the editor says so.
  const afterDraw = await canvasVerdict(page);
  const parentSideHatch = afterDraw.hatchLoops.filter(loop => loop.area > 0 && loop.bounds.maxY < 400);
  expect(parentSideHatch, 'the hatch carries no region on the parent side').toEqual([]);
  await expect(inspector.getByText('The section resolves to nothing', { exact: false }))
    .toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: '.playwright/cassette-face-editor-01-parent-side-add.png' });

  // The cassette follows the edit live: the parent cut rides the context
  // before the editor closes.
  await expect.poll(async () => (await canvasVerdict(page)).cutInner.length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  await page.screenshot({ path: '.playwright/cassette-face-editor-02-live-cut.png' });

  // A subtract set is a modifier over the base host: the face keeps its
  // own region and the drawn rectangle stays a parent cut.
  const rectRow = inspector.locator('.profile-shapes-panel button[aria-label^="Rectangle s"]').first();
  await rectRow.click();
  await page.waitForTimeout(500);
  await rectRow.locator('xpath=ancestor::div[contains(@class,"border-b")]')
    .first()
    .locator('.p-selectbutton')
    .getByRole('button', { name: 'Subtract' })
    .click();
  await page.waitForTimeout(1500);
  const afterSubtract = await canvasVerdict(page);
  expect(afterSubtract.hatchLoops.some(loop => loop.area > 0 && loop.bounds.minY >= 400),
    'the child face region stays on its side of the datum').toBe(true);
  await expect(inspector.getByText('The section resolves to nothing', { exact: false })).toBeHidden();
  await page.screenshot({ path: '.playwright/cassette-face-editor-03-subtract.png' });

  // Leaving the edit keeps the child face on the cassette.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const escaped = await canvasVerdict(page);
  expect(escaped.cutInner.length, 'the parent keeps the rectangle cut').toBeGreaterThan(0);
  await page.screenshot({ path: '.playwright/cassette-face-editor-04-escaped.png' });
  await app.expectCleanRuntime();
});
