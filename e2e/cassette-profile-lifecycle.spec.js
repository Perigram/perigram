import { test, expect } from './fixtures.js';

// The profile canvas owns its model: authoring never adopts the cassette's
// globals into the sketch table, Escape cancels a draw command without
// closing the sketch mode, and undo/redo step the sketch history.

const CANVAS = '[role="application"]';

test('profile canvas keeps its own parameter rows, Escape, and history', async ({ app }) => {
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
  await page.locator('main').getByRole('button', { name: /^New( Cassette template( from [A-Za-z]+)?)?$/ }).click();
  await expect(page.locator('.designer-workspace__canvas').first()).toBeVisible({ timeout: 60_000 });

  await page.waitForTimeout(2500);
  // The picker popover can close on a first click that lands during the
  // canvas's initial render pass — retry until the entry is up.
  const pickerEntry = page.getByRole('button', { name: /Create new|New profile/ }).first();
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole('button', { name: 'Add profile' }).first().click();
    if (await pickerEntry.isVisible({ timeout: 4000 }).catch(() => false)) break;
  }
  await pickerEntry.click();
  const dialog = page.locator('[data-sketch-mode="profile"]').first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const inspector = page.locator('.designer-workspace__inspector').first();
  const tools = page.locator('.designer-workspace__palette');
  const canvas = dialog.locator(CANVAS).first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });

  const box = await canvas.boundingBox();
  const click = async (fx, fy) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  const drawRect = async (from, to) => {
    const button = tools.locator('button[aria-label="Rectangle"]').first();
    await button.click();
    await expect(button).toHaveClass(/p-button-primary/, { timeout: 15_000 });
    await page.waitForTimeout(200);
    await click(...from);
    await page.waitForTimeout(300);
    await click(...to);
    await expect(button).not.toHaveClass(/p-button-primary/, { timeout: 15_000 });
    await page.waitForTimeout(900);
  };
  const stripNames = () => inspector.locator('input[aria-label^="Parameter name"]').evaluateAll(
    nodes => nodes.map(node => node.value)
  );
  const rectRows = () => inspector.locator('button[aria-label^="Rectangle s"]').count();

  await drawRect([0.35, 0.3], [0.6, 0.6]);
  expect(await rectRows(), 'the drawn rect lists').toBeGreaterThan(0);

  // A mid-edit invalid expression (the merge refusal path) leaves the
  // sketch table alone: the cassette's globals never become profile rows.
  await inspector.locator('button[aria-label^="Rectangle s"]').first().click();
  await page.waitForTimeout(400);
  const widthField = inspector.locator('input[aria-label^="w s"]').first();
  await widthField.click();
  await page.keyboard.press('ControlOrMeta+a');
  await widthField.pressSequentially('R/', { delay: 60 });
  await widthField.press('Enter');
  await page.waitForTimeout(900);
  expect(await stripNames(), 'the refused merge adopts no cassette globals').toEqual([]);
  await widthField.click();
  await page.keyboard.press('ControlOrMeta+a');
  await widthField.pressSequentially('20', { delay: 60 });
  await widthField.press('Enter');
  await page.waitForTimeout(600);

  // Escape cancels the active draw command and the sketch mode stays.
  const lineButton = tools.locator('button[aria-label="Line"]').first();
  await lineButton.click();
  await expect(lineButton).toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect(lineButton).not.toHaveClass(/p-button-primary/, { timeout: 10_000 });
  await expect(dialog, 'Escape keeps the profile session').toBeVisible();

  // Undo/redo step the sketch history: the second rect goes and returns.
  await drawRect([0.55, 0.72], [0.62, 0.62]);
  const before = await rectRows();
  expect(before).toBe(2);
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.62);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1200);
  await expect.poll(rectRows, { timeout: 10_000 }).toBe(1);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(1200);
  await expect.poll(rectRows, { timeout: 10_000 }).toBe(2);
  await expect(dialog).toBeVisible();

  await page.locator('.designer-workspace__canvas').first().screenshot({
    path: '.playwright/cassette-profile-lifecycle.png'
  });
  await inspector.getByRole('button', { name: 'Back to cassette' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await app.expectCleanRuntime();
});
