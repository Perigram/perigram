import { test, expect } from './fixtures.js';

// The profile sketch editor's authored-truth roundtrip: dimensions are
// native CadCraft dim entities, a label opens its field in place, and the
// binding survives save and reopen. Drives the real sketch mode: draw a rect and
// a circle through the CAD engine, bind the circle diameter to a parameter,
// save, reopen — the binding survives and every authored numeric stays at
// drawing scale. Artifacts: .playwright/cassette-profile-editor-*.png on
// failure.

const CANVAS = '[role="application"]';

const frameOf = async (dialog) => {
  const handle = await dialog.page().locator('.designer-workspace__canvas iframe').first().elementHandle();
  return handle.contentFrame();
};

const cadCameraOf = async (page) => {
  const handle = await page.locator('.designer-workspace__canvas iframe').first().elementHandle();
  const frame = await handle.contentFrame();
  return frame.evaluate(() => ({ ...window.cadcraft.view.snapshot() }));
};

const nativeDims = async (dialog) => {
  const frame = await frameOf(dialog);
  return frame.evaluate(() => (window.cadcraft?.doc.all() || [])
    .filter(entity => entity.type === 'dim')
    .map(entity => {
      const rot = entity.kind === 'aligned'
        ? Math.atan2(entity.p2.y - entity.p1.y, entity.p2.x - entity.p1.x)
        : (entity.rot || 0);
      const measured = entity.kind === 'diameter'
        ? 2 * Math.hypot(entity.p1.x - entity.c.x, entity.p1.y - entity.c.y)
        : entity.kind === 'linear'
          ? Math.abs((entity.p2.x - entity.p1.x) * Math.cos(rot) + (entity.p2.y - entity.p1.y) * Math.sin(rot))
          : Math.hypot(entity.p2.x - entity.p1.x, entity.p2.y - entity.p1.y);
      return {
        key: entity.annotationKey,
        field: entity.profile?.fieldKey || null,
        shapeId: entity.profile?.shapeId || null,
        kind: entity.kind,
        dimensionKind: entity.cassette?.dimensionKind || null,
        text: entity.text,
        measured
      };
    }));
};

const dimState = async (dialog) => {
  const out = {};
  for (const dim of await nativeDims(dialog)) {
    out[dim.field || dim.key] = dim.text;
  }
  return out;
};

const expectDrawingScale = (dims) => {
  for (const dim of dims) {
    const numeric = Number(dim.text);
    if (dim.text !== '' && Number.isFinite(numeric)) {
      expect(numeric, `${dim.key} within a drawing-scale window`).toBeLessThan(300);
      expect(String(dim.text).length, `${dim.key} free of float noise`).toBeLessThan(9);
    }
  }
};

const clickDim = async (page, dialog, fieldKey) => {
  const frame = await frameOf(dialog);
  const point = await frame.evaluate(async (field) => {
    const dim = window.cadcraft.doc.all().find(entity => entity.type === 'dim' && entity.profile?.fieldKey === field);
    if (!dim) return null;
    const { dimTextPoint } = await import('./assets/apps/cadcraft/0.7/dims.js');
    const text = dimTextPoint(dim);
    return window.cadcraft.view.toScreen(text.x, text.y);
  }, fieldKey);
  expect(point, `${fieldKey} dimension exists`).toBeTruthy();
  const box = await page.locator('.designer-workspace__canvas iframe').first().boundingBox();
  await page.mouse.click(box.x + point.x, box.y + point.y);
  const input = dialog.locator('input.profile-dim');
  await expect(input).toBeVisible({ timeout: 10_000 });
  return input;
};

const typeDim = async (page, dialog, fieldKey, text) => {
  const input = await clickDim(page, dialog, fieldKey);
  await input.click();
  await input.press('ControlOrMeta+a');
  await input.pressSequentially(text, { delay: 60 });
  await input.press('Enter');
  await page.waitForTimeout(700);
};

// The assembly camera and the sketch camera the canvas session preserves
// across a mode flip.
const assemblyViewBox = async (page) => page
  .locator('.designer-workspace__canvas svg[viewBox]').first()
  .getAttribute('viewBox');
const sketchCamera = async (dialog) => {
  const frame = await frameOf(dialog);
  return frame.evaluate(() => ({ ...window.cadcraft.view.snapshot() }));
};
const moveSketchCamera = async (dialog) => {
  const frame = await frameOf(dialog);
  return frame.evaluate(() => {
    window.cadcraft.view.zoomAt(240, 180, 1.5);
    window.cadcraft.view.panBy(36, 18);
    return { ...window.cadcraft.view.snapshot() };
  });
};

test('profile editor draws at millimetre scale and keeps bindings through save', async ({ app }) => {
  test.setTimeout(300_000);
  await app.installPlugins(['tech-drawing', 'documents', 'facade']);
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
  await expect(page.locator('.designer-workspace__canvas').first()).toBeVisible({ timeout: 60_000 });
  const inspector = page.locator('.designer-workspace__inspector').first();
  await expect(inspector.getByRole('button', { name: 'Add profile' })).toBeVisible();
  expect(await page.locator('[data-designer-toolbar]').getByRole('button', { name: 'Add profile' }).count()).toBe(0);

  await inspector.getByRole('button', { name: 'Add profile' }).click();
  await page.getByRole('button', { name: /Create new|New profile/ }).first().click();
  const dialog = page.locator('[data-sketch-mode="profile"]').first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const tools = page.locator('.designer-workspace__palette');
  await expect(inspector.getByRole('button', { name: 'Back to cassette' })).toBeVisible({ timeout: 10_000 });
  await expect(inspector.getByRole('button', { name: 'Save to library', exact: true })).toBeVisible();
  await expect(page.locator('.designer-workspace__canvas [data-sketch-mode="profile"]')).toHaveCount(1);
  const canvas = dialog.locator(CANVAS).first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });

  // The embedded edition owns no desktop chrome: no autosave/recovery and
  // none of the native bars or panels on screen.
  const embedded = await page.evaluate(() => {
    const frame = document.querySelector('.designer-workspace__canvas iframe');
    const win = frame?.contentWindow;
    const chrome = ['body > header', '.cc-tools', '.cc-panel', '.cc-status']
      .map(selector => win?.document.querySelector(selector))
      .filter(Boolean);
    return {
      search: win?.location?.search || '',
      autosave: win?.cadcraft?.host?.autosave ?? null,
      recovery: Boolean(win?.document?.querySelector('[data-autosave-dialog]')),
      visibleChrome: chrome.filter(node => win.getComputedStyle(node).display !== 'none').length
    };
  });
  expect(embedded.search).toContain('embed=1');
  expect(embedded.autosave, 'Expected no autosave wiring in the embed').toBe(null);
  expect(embedded.recovery, 'Expected no native recovery dialog').toBe(false);
  expect(embedded.visibleChrome, 'Expected no native CadCraft chrome').toBe(0);

  const box = await canvas.boundingBox();
  expect(box, 'canvas box').toBeTruthy();
  const click = async (fx, fy) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);

  // The circle first; the rect follows in the far quadrant.
  const runDrawTool = async (tool, from, to) => {
    const button = tools.locator(`button[aria-label="${tool}"]`).first();
    await button.click();
    await expect(button, `${tool} command started`).toHaveClass(/p-button-primary/, { timeout: 15_000 });
    await page.waitForTimeout(150);
    await click(...from);
    await page.waitForTimeout(250);
    await click(...to);
    await expect(button, `${tool} command ended`).not.toHaveClass(/p-button-primary/, { timeout: 15_000 });
    await page.waitForTimeout(600);
  };

  await runDrawTool('Circle', [0.45, 0.55], [0.52, 0.55]);
  await runDrawTool('Rectangle', [0.30, 0.60], [0.60, 0.85]);

  // The primitives panel lists every shape as a row with its op state.
  const circleRow = inspector.locator('button[aria-label^="Circle s"]').first();
  const rectRow = inspector.locator('button[aria-label^="Rectangle s"]').first();
  await expect(circleRow, 'the drawn circle lists in the panel').toBeVisible({ timeout: 10_000 });
  await expect(rectRow, 'the drawn rect lists in the panel').toBeVisible({ timeout: 10_000 });
  await expect(circleRow.locator('.p-tag')).toHaveText('Subtract');
  await expect(rectRow.locator('.p-tag')).toHaveText('Add');

  // Drawing also produced native CadCraft dimensions, not page-space text.
  const drawnDims = await nativeDims(dialog);
  expect(drawnDims.length, 'native dimensions for the drawn shapes').toBeGreaterThan(0);
  expectDrawingScale(drawnDims);
  expect(drawnDims.some(dim => dim.field === 'diameter'), 'the circle carries a diameter dimension').toBe(true);

  // The op control rides the selected row; switching it regroups the list.
  const rowBlock = (kind) => inspector.locator(`button[aria-label^="${kind} s"]`)
    .locator('xpath=ancestor::div[contains(@class,"border-b")]');
  const circleOps = () => rowBlock('Circle').locator('.p-selectbutton').getByRole('button');
  await circleRow.click();
  await expect(circleOps().filter({ hasText: 'Subtract' })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await circleOps().filter({ hasText: 'Construction' }).click();
  await expect(circleOps().filter({ hasText: 'Construction' })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await circleOps().filter({ hasText: 'Subtract' }).click();
  await expect(circleOps().filter({ hasText: 'Subtract' })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

  // Rows follow the authored CSG sequence (drawing order).
  const panelOrder = await inspector.locator('.profile-shapes-panel').evaluate(panel => (
    Array.from(panel.querySelectorAll('button[aria-label]'))
      .map(button => button.getAttribute('aria-label'))
      .filter(label => /^((Rectangle)|(Circle)) s/.test(label || ''))
  ));
  expect(panelOrder[0]?.startsWith('Circle'), `sequence follows drawing order: ${panelOrder.join(', ')}`).toBe(true);
  expect(panelOrder[1]?.startsWith('Rectangle'), `sequence follows drawing order: ${panelOrder.join(', ')}`).toBe(true);
  const metrics = await inspector.locator('.profile-shapes-panel').evaluate(panel => {
    const rows = Array.from(panel.children);
    const rect = panel.getBoundingClientRect();
    return {
      widths: [...new Set(rows.map(row => Math.round(row.getBoundingClientRect().width)))],
      heights: rows.map(row => Math.round(row.querySelector('button')?.getBoundingClientRect().height ?? 0)),
      overflow: panel.scrollWidth > Math.ceil(rect.width) + 1
    };
  });
  expect(metrics.widths).toHaveLength(1);
  expect(new Set(metrics.heights).size).toBeLessThanOrEqual(2);
  expect(metrics.overflow, 'panel rows never overflow horizontally').toBe(false);

  // The shape's property fields edit in place. The row stays selected
  // from the op switch.
  const circleDiameterField = inspector.locator('input[aria-label^="d s"]').first();
  await expect(circleDiameterField).toBeVisible({ timeout: 10_000 });
  await circleDiameterField.click();
  await page.keyboard.press('ControlOrMeta+a');
  await circleDiameterField.pressSequentially('20', { delay: 50 });
  await circleDiameterField.press('Enter');
  await page.waitForTimeout(600);
  const resized = await nativeDims(dialog);
  expect(resized.find(dim => dim.field === 'diameter')?.text).toBe('20.0');
  await circleRow.click();
  await expect(circleDiameterField).toBeHidden({ timeout: 10_000 });

  // Deleting a shape is atomic and panel-owned; reordering moves a row.
  await rectRow.click();
  await rowBlock('Rectangle').getByRole('button', { name: /^Move earlier/ }).click();
  await page.waitForTimeout(400);
  const reordered = await inspector.locator('.profile-shapes-panel').evaluate(panel => (
    Array.from(panel.querySelectorAll('button[aria-label]'))
      .map(button => button.getAttribute('aria-label'))
      .filter(label => /^((Rectangle)|(Circle)) s/.test(label || ''))
  ));
  expect(reordered[0]?.startsWith('Rectangle'), `move earlier reorders the sequence: ${reordered.join(', ')}`).toBe(true);
  await rowBlock('Rectangle').getByRole('button', { name: /^Delete/ }).click();
  await expect(rectRow).toBeHidden({ timeout: 10_000 });
  await expect(circleRow).toBeVisible({ timeout: 10_000 });
  await expect(circleRow.locator('.p-tag')).toHaveText('Subtract');

  const drawn = await dimState(dialog);
  expect(Object.keys(drawn).length, 'dimension annotations for the drawn shapes').toBeGreaterThan(0);
  expectDrawingScale(await nativeDims(dialog));

  // Bind the circle's diameter to a parameter: add one, then type its
  // name into the diameter dimension — the native label becomes the
  // parameter's editor.
  await inspector.getByRole('button', { name: 'Add parameter' }).click();
  await page.waitForTimeout(400);
  const valueInput = inspector.locator('input[aria-label="A"], input[aria-label="P1"]').last();
  await expect(valueInput).toBeVisible({ timeout: 5000 });
  await valueInput.click();
  await page.keyboard.press('ControlOrMeta+a');
  await valueInput.pressSequentially('100', { delay: 40 });
  await valueInput.press('Enter');
  await page.waitForTimeout(600);

  await typeDim(page, dialog, 'diameter', 'A');
  const bound = await nativeDims(dialog);
  expect(bound.find(dim => dim.field === 'diameter')?.text, 'the diameter label carries its parameter expression').toBe('A');

  // A mid-edit expression never breaks the drawing: the last good
  // geometry and native dimensions stay, and finishing the text restores
  // live evaluation.
  await typeDim(page, dialog, 'diameter', '=');
  await expect(circleRow, 'the panel survives an invalid expression').toBeVisible();
  await expect(inspector.locator('.profile-shapes-panel')).toContainText('Circle');
  expect((await nativeDims(dialog)).length, 'native dimensions survive an invalid expression').toBeGreaterThan(0);
  await typeDim(page, dialog, 'diameter', 'A');
  expect((await nativeDims(dialog)).find(dim => dim.field === 'diameter')?.text).toBe('A');

  // Save places the profile; reopening it shows the same authored state.
  await inspector.getByRole('button', { name: 'Back to cassette' }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  const treeText = await inspector.innerText();
  expect(treeText, 'the inspector tree starts at the workpiece').toContain('Workpiece 1');
  expect(treeText, 'the face row separates the workpiece from its profiles').toContain('main');
  expect(
    (await nativeDims(dialog)).some(dim => dim.dimensionKind === 'placement'),
    'the selected profile carries its placement dimensions along the parent edge'
  ).toBe(true);
  await inspector.getByRole('treeitem', { name: 'main' }).first().click();
  await expect(inspector, 'the selected face details list its placed profiles').toContainText('Hanger profile');
  const assemblyNativeDims = await frameOf(dialog).then(frame => frame.evaluate(() => (
    window.cadcraft.doc.all().filter(entity => entity.type === 'dim').length
  )));
  expect(assemblyNativeDims, 'the assembly canvas draws native dimensions').toBeGreaterThan(0);
  await expect(page.locator('.designer-workspace__palette'), 'the dimension layer is a canvas layer row')
    .toContainText('5_1_Размер_Кассета');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '.playwright/cassette-assembly-native.png' });

  // Parameter fields rebuild on commit only: typing into the placed
  // workpiece's instance chip changes nothing until Enter.
  const canvasSignature = () => page.locator('.designer-workspace__canvas').first()
    .evaluate(root => Array.from(root.querySelectorAll('path'))
      .map(path => path.getAttribute('d')).filter(Boolean).sort().join('|').length);
  await page.locator('[data-designer-profile-id]').first().dispatchEvent('click');
  await expect(inspector.getByText('Anchor', { exact: true }), 'the profile editor lives in the inspector').toBeVisible();
  await expect(page.locator('.designer-workspace__canvas').getByText('Anchor', { exact: true })).toHaveCount(0);

  const chip = page.locator('input[aria-label^="Parameters A"]').first();
  await expect(chip).toBeVisible({ timeout: 20_000 });
  const before = await canvasSignature();
  await chip.click();
  await page.keyboard.press('ControlOrMeta+a');
  await chip.pressSequentially('55', { delay: 60 });
  await page.waitForTimeout(700);
  expect(await canvasSignature(), 'typing alone rebuilds nothing').toBe(before);
  await chip.press('Enter');
  await page.waitForTimeout(1200);
  expect(await canvasSignature(), 'Enter commits and rebuilds').not.toBe(before);

  // The selected profile draws its inner shape dimensions on the assembly
  // canvas; a label opens the authored field in place.
  const innerDimPoint = async (fieldKey) => frameOf(dialog).then(frame => frame.evaluate(async (field) => {
    const dim = window.cadcraft.doc.all().find(entity => (
      entity.type === 'dim'
        && entity.cassette?.dimensionKind === 'inner'
        && String(entity.cassette?.fieldKey || '').endsWith(`:${field}`)
    ));
    if (!dim) return null;
    const { dimTextPoint } = await import('./assets/apps/cadcraft/0.7/dims.js');
    const text = dimTextPoint(dim);
    return window.cadcraft.view.toScreen(text.x, text.y);
  }, fieldKey));
  let centerPoint = null;
  await expect.poll(async () => {
    centerPoint = await innerDimPoint('center-x');
    return Boolean(centerPoint);
  }, { timeout: 10_000 }).toBe(true);
  const canvasBox = await page.locator('.designer-workspace__canvas iframe').first().boundingBox();
  await page.mouse.click(canvasBox.x + centerPoint.x, canvasBox.y + centerPoint.y);
  const dimensionInput = page.locator('.designer-workspace__canvas [contenteditable="true"][role="textbox"]').first();
  await expect(dimensionInput, 'an inner dimension label opens its authored field').toBeVisible({ timeout: 10_000 });
  await dimensionInput.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('50', { delay: 50 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const innerCenterText = await frameOf(dialog).then(frame => frame.evaluate(() => (
    window.cadcraft.doc.all()
      .find(entity => (
        entity.type === 'dim'
          && entity.cassette?.dimensionKind === 'inner'
          && String(entity.cassette?.fieldKey || '').endsWith(':center-x')
      ))?.text
  )));
  expect(innerCenterText, 'typing in the dimension commits the authored field').toBe('50.0');
  await page.keyboard.press('Escape');
  await page.locator('[data-designer-profile-id]').first().dispatchEvent('click');
  await expect(page.getByRole('button', { name: 'Edit profile' }).first())
    .toBeVisible({ timeout: 10_000 });

  const assemblyBefore = await assemblyViewBox(page);
  const cameraBefore = await cadCameraOf(page);
  const faceLayer = page.locator('.designer-workspace__palette').getByLabel('1_1_Лицо_Кассеты').first();
  await faceLayer.click();
  const hiddenInAssembly = await frameOf(dialog).then(frame => frame.evaluate(() => (
    window.cadcraft.doc.layers.get('1_1_Лицо_Кассеты')?.on
  )));
  expect(hiddenInAssembly, 'the layer row hides the native layer').toBe(false);
  await page.getByRole('button', { name: 'Edit profile' }).first().click();
  const reopenedDialog = page.locator('[data-sketch-mode="profile"]').first();
  await expect(reopenedDialog).toBeVisible({ timeout: 30_000 });
  await expect(reopenedDialog.locator(CANVAS).first()).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });
  await page.waitForTimeout(1200);
  const initialView = await frameOf(reopenedDialog).then(frame => frame.evaluate(() => {
    const sketch = window.cadcraft.doc.all().filter(entity => entity.shapeId != null);
    const points = sketch.flatMap(entity => (
      entity.type === 'poly'
        ? entity.pts
        : entity.type === 'line'
          ? [{ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }]
          : entity.type === 'circle'
            ? [{ x: entity.cx, y: entity.cy }]
            : []
    ));
    const bounds = points.reduce((box, point) => ({
      minX: Math.min(box.minX, point.x),
      minY: Math.min(box.minY, point.y),
      maxX: Math.max(box.maxX, point.x),
      maxY: Math.max(box.maxY, point.y)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    return {
      screen: window.cadcraft.view.toScreen(center.x, center.y),
      width: window.cadcraft.view.w,
      height: window.cadcraft.view.h
    };
  }));
  expect(initialView.screen.x, 'the placed sketch is in view horizontally').toBeGreaterThan(0);
  expect(initialView.screen.x).toBeLessThan(initialView.width);
  expect(initialView.screen.y, 'the placed sketch is in view vertically').toBeGreaterThan(0);
  expect(initialView.screen.y).toBeLessThan(initialView.height);
  const entryCamera = await sketchCamera(reopenedDialog);
  expect(entryCamera.zoom, 'the edit keeps the assembly camera').toBeCloseTo(cameraBefore.zoom, 4);
  expect(entryCamera.cx).toBeCloseTo(cameraBefore.cx, 3);
  expect(entryCamera.cy).toBeCloseTo(cameraBefore.cy, 3);
  const hiddenInEdit = await frameOf(reopenedDialog).then(frame => frame.evaluate(() => (
    window.cadcraft.doc.layers.get('1_1_Лицо_Кассеты')?.on
  )));
  expect(hiddenInEdit, 'the hidden assembly layer stays hidden during the edit').toBe(false);
  await expect(inspector.locator('.profile-shapes-panel'), 'the shape list lives in the inspector').toBeVisible();
  expect(await inspector.locator('[data-sketch-mode]').count(), 'the inspector is the edit panel').toBe(0);
  await page.screenshot({ path: '.playwright/cassette-inplace-context.png' });
  await moveSketchCamera(reopenedDialog);
  await inspector.getByRole('button', { name: 'Back to cassette' }).click();
  await expect(reopenedDialog).toBeHidden({ timeout: 30_000 });
  expect(await assemblyViewBox(page), 'the assembly camera survives the flip').toBe(assemblyBefore);
  await faceLayer.click();

  await page.getByRole('button', { name: 'Edit profile' }).first().click();
  await expect(reopenedDialog).toBeVisible({ timeout: 30_000 });
  await expect(reopenedDialog.locator(CANVAS).first()).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });
  await page.waitForTimeout(600);
  const restoredCamera = await sketchCamera(reopenedDialog);
  expect(restoredCamera.zoom, 'the target reopens at the assembly camera').toBeCloseTo(cameraBefore.zoom, 4);
  expect(restoredCamera.cx).toBeCloseTo(cameraBefore.cx, 3);
  expect(restoredCamera.cy).toBeCloseTo(cameraBefore.cy, 3);
  const placed = await frameOf(reopenedDialog).then(frame => frame.evaluate(() => {
    const doc = window.cadcraft.doc;
    const annotationLayers = ['perigram-profile-annotations', 'perigram-profile-dimensions'];
    const lockedLayers = [...doc.layers.values()]
      .filter(layer => layer.locked && layer.name !== '0' && !annotationLayers.includes(layer.name))
      .map(layer => layer.name);
    const context = doc.all().filter(entity => lockedLayers.includes(entity.layer));
    const sketch = doc.all().filter(entity => entity.shapeId != null);
    const pointsOf = list => list.flatMap(entity => (
      entity.type === 'poly'
        ? entity.pts
        : entity.type === 'line'
          ? [{ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }]
          : entity.type === 'circle'
            ? [{ x: entity.cx, y: entity.cy }]
            : []
    ));
    const bounds = points => points.reduce((box, point) => ({
      minX: Math.min(box.minX, point.x),
      minY: Math.min(box.minY, point.y),
      maxX: Math.max(box.maxX, point.x),
      maxY: Math.max(box.maxY, point.y)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const contextBounds = bounds(pointsOf(context));
    const sketchBounds = bounds(pointsOf(sketch));
    const cutBounds = bounds(pointsOf(doc.all().filter(entity => String(entity.layer).includes('CUT_INNER'))));
    const infiniteAxis = doc.all().some(entity => entity.type === 'xline' && entity.layer === 'perigram-profile-annotations');
    const hatch = doc.all().find(entity => entity.type === 'hatch' && entity.layer === 'perigram-profile-annotations');
    const hatchPoints = hatch
      ? hatch.loops.flatMap(loop => {
        const points = [];
        for (let index = 0; index + 1 < loop.length; index += 2) {
          points.push({ x: loop[index], y: loop[index + 1] });
        }
        return points;
      })
      : [];
    const hatchBounds = hatchPoints.length ? bounds(hatchPoints) : null;
    const center = {
      x: (sketchBounds.minX + sketchBounds.maxX) / 2,
      y: (sketchBounds.minY + sketchBounds.maxY) / 2
    };
    const cutCenter = {
      x: (cutBounds.minX + cutBounds.maxX) / 2,
      y: (cutBounds.minY + cutBounds.maxY) / 2
    };
    return {
      lockedLayers,
      contextCount: context.length,
      sketchCount: sketch.length,
      hatchBounds,
      infiniteAxis,
      centerInContext: center.x >= contextBounds.minX && center.x <= contextBounds.maxX
        && center.y >= contextBounds.minY && center.y <= contextBounds.maxY,
      centerOnPlacement: Math.hypot(center.x - cutCenter.x, center.y - cutCenter.y) < 0.5
    };
  }));
  expect(placed.lockedLayers.length, 'the assembly layers are locked').toBeGreaterThan(0);
  expect(placed.contextCount, 'the assembly draws around the sketch').toBeGreaterThan(0);
  expect(placed.sketchCount, 'the authored sketch seeds on its own layer').toBeGreaterThan(0);
  expect(placed.centerInContext, 'the sketch sits inside the assembly bounds').toBe(true);
  expect(placed.centerOnPlacement, 'the sketch stays on its placed profile').toBe(true);
  expect(placed.infiniteAxis, 'the profile axis spans the placed face').toBe(false);
  expect(placed.hatchBounds, 'the profile hatch is the placed parent face').toBeTruthy();
  expect(placed.hatchBounds.maxX - placed.hatchBounds.minX, 'the hatch spans the parent face, never the half-plane stand-in')
    .toBeLessThan(1000);
  expect(placed.hatchBounds.maxY - placed.hatchBounds.minY).toBeLessThan(1000);
  const theme = await frameOf(reopenedDialog).then(frame => frame.evaluate(() => ({
    font: document.documentElement.style.getPropertyValue('--font'),
    sheet: document.documentElement.style.getPropertyValue('--sheet'),
    space: document.documentElement.dataset.space
  })));
  expect(theme.font, 'the canvas takes the app font').toContain('IBM Plex Sans');
  expect(theme.sheet, 'the canvas takes the app surface').toBeTruthy();
  expect(['paper', 'model'], 'the canvas follows the app theme mode').toContain(theme.space);
  const reopened = await nativeDims(reopenedDialog);
  expectDrawingScale(reopened);
  const reopenedDiameter = reopened.find(dim => dim.field === 'diameter');
  expect(reopenedDiameter?.text, 'the diameter binding survives the save-load roundtrip').toBe('A');
  expect(reopenedDiameter?.measured, 'the editor evaluates the placed profile A=55 in place')
    .toBeCloseTo(55, 1);
  await app.expectCleanRuntime();
});

test('escape sheds the sketch selection and a bare escape returns to the cassette', async ({ app }) => {
  test.setTimeout(240_000);
  await app.installPlugins(['tech-drawing', 'documents', 'facade']);
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
  const inspector = page.locator('.designer-workspace__inspector').first();
  await expect(inspector.getByRole('button', { name: 'Add profile' })).toBeVisible({ timeout: 60_000 });

  await inspector.getByRole('button', { name: 'Add profile' }).click();
  await page.getByRole('button', { name: /Create new|New profile/ }).first().click();
  const dialog = page.locator('[data-sketch-mode="profile"]').first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const canvas = dialog.locator(CANVAS).first();
  await expect(canvas).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });

  const tools = page.locator('.designer-workspace__palette');
  const drawButton = tools.locator('button[aria-label="Rectangle"]').first();
  await drawButton.click();
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.waitForTimeout(250);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await expect(drawButton).not.toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.waitForTimeout(600);

  // Selecting the drawn rectangle opens its property row.
  const shapeRow = inspector.locator('button[aria-label^="Rectangle s"]').first();
  await shapeRow.click();
  const widthField = inspector.locator('input[aria-label^="w s"]').first();
  await expect(widthField, 'the selected shape opens its fields').toBeVisible({ timeout: 10_000 });

  // The first escape sheds the selection; the second returns to the cassette.
  await page.keyboard.press('Escape');
  await expect(inspector.locator('input[aria-label^="w s"]'), 'escape sheds the shape selection').toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog, 'a bare escape returns to the cassette').toBeHidden({ timeout: 15_000 });
  await expect(
    page.locator('.designer-workspace__canvas').first(),
    'the assembly canvas returns'
  ).toBeVisible();
  await page.locator('.designer-workspace__canvas').first()
    .screenshot({ path: '.playwright/cassette-profile-escape.png' });

  await app.expectCleanRuntime();
});
