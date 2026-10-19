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
  await app.installPlugins(['documents', 'tech-drawing', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette'], via: { cassette: 'editor' } });
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette');
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
  await expect(
    dialog.locator('button[aria-label^="Subtract s"]'),
    'the drawn circle lands as a subtract shape'
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    dialog.locator('button[aria-label^="Add s"]'),
    'the drawn rect lands as an add shape'
  ).toBeVisible({ timeout: 10_000 });

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

  // Save places the profile; reopening it shows the same authored
  // state — expressions intact, values unchanged.
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(2000);
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
