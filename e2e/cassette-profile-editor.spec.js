import { test, expect } from './fixtures.js';

// The profile sketch editor's authored-truth roundtrip (regression:
// the extraction merge once dropped rotated expression-bound shapes —
// helpers returned as draw defaults that rode the booleans into the
// cassette, drawn numerics carried float noise, and the blank canvas
// booted at pixel scale). Drives the real dialog: draw a rect and a
// circle through the CAD engine, add a parameter, bind the diameter
// dim to it, save, reopen — the binding survives and every authored
// numeric stays at drawing scale. Artifacts: console.log dim states
// in the run log; .playwright/cassette-profile-editor-*.png on
// failure.

const CANVAS = '[role="application"]';

const dimState = async dialog => {
  const dims = dialog.locator('input.profile-dim');
  const out = {};
  for (const input of await dims.all()) {
    out[await input.getAttribute('aria-label')] = await input.inputValue();
  }
  return out;
};

const expectDrawingScale = (state) => {
  for (const [label, value] of Object.entries(state)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value !== '') {
      expect(Number(value), `${label} within a drawing-scale window`).toBeLessThan(300);
      expect(String(value).length, `${label} free of float noise`).toBeLessThan(9);
    }
  }
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
  const dialog = page.locator('[role="dialog"]').filter({ hasText: 'Profile sketch' }).first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const canvas = dialog.locator(CANVAS).first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2500);

  const box = await canvas.boundingBox();
  expect(box, 'canvas box').toBeTruthy();
  const click = async (fx, fy) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);

  // The circle first — its clicks land on a dim-free canvas; the rect
  // follows in the far quadrant, away from the circle's dimension
  // annotations (the dim inputs are HTML overlays that swallow clicks).
  // The toolbar's active state is the command lifecycle: draw clicks
  // land only while the command runs, and the chip strip appears when
  // the extraction lands.
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

  // The primitives panel lists every shape as a row with its op state
  // visible at a glance (owner direction 2026-10-19). Selecting a row
  // expands its op control and property fields.
  const circleRow = dialog.locator('button[aria-label^="Circle s"]').first();
  const rectRow = dialog.locator('button[aria-label^="Rectangle s"]').first();
  await expect(circleRow, 'the drawn circle lists in the panel').toBeVisible({ timeout: 10_000 });
  await expect(rectRow, 'the drawn rect lists in the panel').toBeVisible({ timeout: 10_000 });
  await expect(circleRow.locator('.p-tag')).toHaveText('Subtract');
  await expect(rectRow.locator('.p-tag')).toHaveText('Add');

  // The op control rides the selected row — switching it regroups the
  // list (adds before subtracts, construction apart).
  const rowBlock = (kind) => dialog.locator(`button[aria-label^="${kind} s"]`)
    .locator('xpath=ancestor::div[contains(@class,"border-b")]');
  const circleOps = () => rowBlock('Circle').locator('.p-selectbutton').getByRole('button');
  await circleRow.click();
  await expect(circleOps().filter({ hasText: 'Subtract' })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await circleOps().filter({ hasText: 'Construction' }).click();
  await expect(circleOps().filter({ hasText: 'Construction' })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await circleOps().filter({ hasText: 'Subtract' }).click();
  await expect(circleOps().filter({ hasText: 'Subtract' })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

  // The rows list the authored CSG sequence (drawing order): the
  // circle drawn first sits above the rect drawn second. Row anatomy
  // holds: one width, consistent heights, nothing overflows.
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

  // Selecting a row expands its property fields — the shape's whole
  // authoring table edits in place (owner direction: shape properties
  // in the same tree). The row stays selected from the op switch.
  const circleDiameterField = dialog.locator('input[aria-label^="d s"]').first();
  await expect(circleDiameterField).toBeVisible({ timeout: 10_000 });
  await circleDiameterField.click();
  await page.keyboard.press('ControlOrMeta+a');
  await circleDiameterField.pressSequentially('20', { delay: 50 });
  await circleDiameterField.press('Enter');
  await page.waitForTimeout(600);
  await expect(dialog.locator('input.profile-dim[aria-label^="diameter"]')).toHaveValue('20', { timeout: 10_000 });
  await circleRow.click();
  await expect(circleDiameterField).toBeHidden({ timeout: 10_000 });

  // Deleting a shape is atomic and panel-owned: the rect row's trash
  // removes the whole primitive; the circle keeps its op, fields, and
  // geometry. Reordering moves the rect ahead of the circle first —
  // the sequence control is real.
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
  expectDrawingScale(drawn);

  // Bind the circle's diameter to a parameter: add one, then type its
  // name into the diameter dim — the dim becomes that parameter's
  // editor and keeps the expression as its label.
  await dialog.getByRole('button', { name: 'Add parameter' }).click();
  await page.waitForTimeout(400);
  const valueInput = dialog.locator('input[aria-label="A"], input[aria-label="P1"]').last();
  await expect(valueInput).toBeVisible({ timeout: 5000 });
  await valueInput.click();
  await page.keyboard.press('ControlOrMeta+a');
  await valueInput.pressSequentially('100', { delay: 40 });
  await valueInput.press('Enter');
  await page.waitForTimeout(600);

  const diameterDim = dialog.locator('input.profile-dim[aria-label^="diameter"]').first();
  await diameterDim.click();
  await page.keyboard.press('ControlOrMeta+a');
  await diameterDim.pressSequentially('A', { delay: 60 });
  await diameterDim.press('Enter');
  await page.waitForTimeout(800);
  const bound = await dimState(dialog);
  const boundDiameter = Object.entries(bound).find(([label]) => label.startsWith('diameter'));
  expect(boundDiameter?.[1], 'the diameter dim carries its parameter expression').toBe('A');

  // A mid-edit expression never breaks the drawing (owner law: what
  // the user did is sacred) — '=' holds the last good geometry, dims,
  // and panel; finishing the text restores live evaluation.
  await diameterDim.click();
  await page.keyboard.press('ControlOrMeta+a');
  await diameterDim.pressSequentially('=', { delay: 60 });
  await diameterDim.press('Enter');
  await page.waitForTimeout(700);
  await expect(dialog.locator('input.profile-dim[aria-label^="diameter"]'), 'dims survive an invalid expression').toBeVisible();
  await expect(circleRow, 'the panel survives an invalid expression').toBeVisible();
  await expect(dialog.locator('.profile-shapes-panel')).toContainText('Circle');
  await diameterDim.click();
  await page.keyboard.press('ControlOrMeta+a');
  await diameterDim.pressSequentially('A', { delay: 60 });
  await diameterDim.press('Enter');
  await page.waitForTimeout(700);
  await expect(dialog.locator('input.profile-dim[aria-label^="diameter"]')).toHaveValue('A');

  // Save places the profile; reopening it shows the same authored
  // state — expressions intact, values unchanged.
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(2000);

  // Parameter fields rebuild on commit only (owner direction
  // 2026-10-20): typing into the placed workpiece's instance chip
  // changes nothing until Enter.
  const canvasSignature = () => page.locator('.designer-workspace__canvas').first()
    .evaluate(root => Array.from(root.querySelectorAll('path'))
      .map(path => path.getAttribute('d')).filter(Boolean).sort().join('|').length);
  const chip = page.locator('div[aria-label^="Parameters A"] div[contenteditable]').first();
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

  await page.getByRole('button', { name: /Edit/ }).first().click();
  const reopenedDialog = page.locator('[role="dialog"]').filter({ hasText: 'Profile sketch' }).first();
  await expect(reopenedDialog).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  const reopened = await dimState(reopenedDialog);
  expectDrawingScale(reopened);
  expect(Object.entries(reopened).find(([label]) => label.startsWith('diameter'))?.[1]).toBe('A');
  for (const [label, value] of Object.entries(bound)) {
    if (label.startsWith('diameter')) continue;
    expect(reopened[label], `${label} unchanged through the save-load roundtrip`).toBe(value);
  }
  await app.expectCleanRuntime();
});
