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
  const handle = await dialog.locator('iframe').first().elementHandle();
  return handle.contentFrame();
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
  const box = await dialog.locator(CANVAS).first().boundingBox();
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
  await page.locator('main').getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.designer-workspace__canvas').first()).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Add profile' }).click();
  await page.getByRole('button', { name: /Create new|New profile/ }).first().click();
  const dialog = page.locator('[data-sketch-mode="profile"]').first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const canvas = dialog.locator(CANVAS).first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });

  // The embedded edition owns no desktop chrome: no autosave/recovery and
  // none of the native bars or panels on screen.
  const embedded = await page.evaluate(() => {
    const frame = document.querySelector('[role="application"] iframe');
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
    const button = dialog.locator(`button[aria-label="${tool}"]`).first();
    await button.click();
    await expect(button, `${tool} command started`).toHaveClass(/p-button-primary/, { timeout: 15_000 });
    await page.waitForTimeout(150);
    await click(...from);
    await page.waitForTimeout(250);
    await click(...to);
    await expect(button, `${tool} command ended`).not.toHaveClass(/p-button-primary/, { timeout: 15_000 });
    await page.waitForTimeout(600);
  };

  await runDrawTool('Circle', [0.60, 0.30], [0.67, 0.30]);
  await runDrawTool('Rectangle', [0.30, 0.60], [0.60, 0.85]);

  // The primitives panel lists every shape as a row with its op state.
  const circleRow = dialog.locator('button[aria-label^="Circle s"]').first();
  const rectRow = dialog.locator('button[aria-label^="Rectangle s"]').first();
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
  const rowBlock = (kind) => dialog.locator(`button[aria-label^="${kind} s"]`)
    .locator('xpath=ancestor::div[contains(@class,"border-b")]');
  const circleOps = () => rowBlock('Circle').locator('.p-selectbutton').getByRole('button');
  await circleRow.click();
  await expect(circleOps().filter({ hasText: 'Subtract' })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await circleOps().filter({ hasText: 'Construction' }).click();
  await expect(circleOps().filter({ hasText: 'Construction' })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await circleOps().filter({ hasText: 'Subtract' }).click();
  await expect(circleOps().filter({ hasText: 'Subtract' })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

  // Rows follow the authored CSG sequence (drawing order).
  const panelOrder = await dialog.locator('.profile-shapes-panel').evaluate(panel => (
    Array.from(panel.querySelectorAll('button[aria-label]'))
      .map(button => button.getAttribute('aria-label'))
      .filter(label => /^((Rectangle)|(Circle)) s/.test(label || ''))
  ));
  expect(panelOrder[0]?.startsWith('Circle'), `sequence follows drawing order: ${panelOrder.join(', ')}`).toBe(true);
  expect(panelOrder[1]?.startsWith('Rectangle'), `sequence follows drawing order: ${panelOrder.join(', ')}`).toBe(true);
  const metrics = await dialog.locator('.profile-shapes-panel').evaluate(panel => {
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
  const circleDiameterField = dialog.locator('input[aria-label^="d s"]').first();
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
  const reordered = await dialog.locator('.profile-shapes-panel').evaluate(panel => (
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
  await dialog.getByRole('button', { name: 'Add parameter' }).click();
  await page.waitForTimeout(400);
  const valueInput = dialog.locator('input[aria-label="A"], input[aria-label="P1"]').last();
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
  await expect(dialog.locator('.profile-shapes-panel')).toContainText('Circle');
  expect((await nativeDims(dialog)).length, 'native dimensions survive an invalid expression').toBeGreaterThan(0);
  await typeDim(page, dialog, 'diameter', 'A');
  expect((await nativeDims(dialog)).find(dim => dim.field === 'diameter')?.text).toBe('A');

  // Save places the profile; reopening it shows the same authored state.
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(2000);

  // Parameter fields rebuild on commit only: typing into the placed
  // workpiece's instance chip changes nothing until Enter.
  const canvasSignature = () => page.locator('.designer-workspace__canvas').first()
    .evaluate(root => Array.from(root.querySelectorAll('path'))
      .map(path => path.getAttribute('d')).filter(Boolean).sort().join('|').length);
  await page.locator('[data-designer-profile-id]').first().dispatchEvent('click');
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

  await page.getByRole('button', { name: 'Edit profile' }).first().click();
  const reopenedDialog = page.locator('[data-sketch-mode="profile"]').first();
  await expect(reopenedDialog).toBeVisible({ timeout: 30_000 });
  await expect(reopenedDialog.locator(CANVAS).first()).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });
  const reopened = await nativeDims(reopenedDialog);
  expectDrawingScale(reopened);
  const reopenedDiameter = reopened.find(dim => dim.field === 'diameter');
  expect(reopenedDiameter?.text, 'the diameter binding survives the save-load roundtrip').toBe('A');
  expect(reopenedDiameter?.measured, 'the editor evaluates the authored profile A=100, never the cassette chip A=55')
    .toBeCloseTo(100, 1);
  await app.expectCleanRuntime();
});
