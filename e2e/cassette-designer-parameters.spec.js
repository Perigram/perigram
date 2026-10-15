import { test, expect } from './fixtures.js';

// The profile parameter round (regression: the workpiece row's parameter
// chips must re-evaluate the profile they instantiate, and the authoring
// fields must hold the typed text while focused — the per-keystroke
// normalization used to rewrite drafts under the caret). Artifacts:
// .playwright/cassette-designer-parameters.png

const assemblyGeometry = (page) => page.locator('.designer-workspace__canvas').first()
  .evaluate(el => Array.from(el.querySelectorAll('path, line, polyline, circle, rect'))
    .map(node => node.getAttribute('d') || node.getAttribute('points') ||
      `${node.getAttribute('x1')},${node.getAttribute('y1')},${node.getAttribute('x2')},${node.getAttribute('y2')}` ||
      `${node.getAttribute('cx')},${node.getAttribute('cy')},${node.getAttribute('r')}`)
    .join(';'));

test('profile parameter chips re-evaluate the profile; authoring fields hold drafts', async ({ app }) => {
  test.setTimeout(240_000);
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette'], via: { cassette: 'editor' } });
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette');
  expect(list?.route, 'Expected a compiled cassette list screen').toBeTruthy();
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  await app.gotoClient(list.route);

  const newButton = page.locator('main').getByRole('button', { name: 'New', exact: true });
  await expect(newButton).toBeVisible({ timeout: 30_000 });
  await newButton.click();
  await expect(page.locator('.designer-workspace__canvas').first()).toBeVisible({ timeout: 60_000 });

  // A profile authored through the dialog opens on the parametric hanger:
  // its parameter chips (W/H/R/D) exist to be driven.
  await page.getByRole('button', { name: 'Add profile' }).click();
  const dialog = page.locator('[role="dialog"]').filter({ hasText: 'Profile sketch' }).first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const fxW = dialog.locator('input[aria-label="W"]').first();
  await expect(fxW).toBeVisible({ timeout: 60_000 });

  // While focused, the field is the draft: partial numbers keep their
  // shape instead of being normalized under the caret.
  await fxW.click();
  await page.keyboard.press('ControlOrMeta+a');
  await fxW.pressSequentially('1', { delay: 80 });
  await expect.poll(() => fxW.inputValue()).toBe('1');
  await fxW.pressSequentially('.', { delay: 80 });
  await expect.poll(() => fxW.inputValue()).toBe('1.');
  await fxW.pressSequentially('5', { delay: 80 });
  await expect.poll(() => fxW.inputValue()).toBe('1.5');
  await page.keyboard.press('ControlOrMeta+a');
  await fxW.pressSequentially('42', { delay: 60 });
  await fxW.press('Enter');

  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // The saved profile row carries a live chip per bound parameter.
  const chipW = page.locator('input[aria-label="Parameters W Hanger profile"]');
  await expect(chipW).toBeVisible({ timeout: 20_000 });
  await expect(chipW).toHaveValue('42');
  for (const [key, value] of [['H', '28'], ['R', '3'], ['D', '6']]) {
    await expect(page.locator(`input[aria-label="Parameters ${key} Hanger profile"]`)).toHaveValue(value);
  }

  // Selecting the row shows the assembly; driving the chip re-evaluates
  // the profile geometry in it.
  await page.locator('aside button:has(span.h-2\\.5)').filter({ hasText: 'Hanger profile' }).first().click();
  await page.waitForTimeout(1500);
  const before = await assemblyGeometry(page);
  await chipW.click();
  await page.keyboard.press('ControlOrMeta+a');
  await chipW.pressSequentially('84', { delay: 80 });
  await chipW.press('Enter');
  await page.waitForTimeout(1500);
  const after = await assemblyGeometry(page);
  expect(after, 'Expected the chip edit to change the drawn profile').not.toEqual(before);
  await expect(chipW).toHaveValue('84');

  // The instance value reached the profile's own table.
  await page.getByRole('button', { name: 'Edit profile' }).first().click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator('input[aria-label="W"]').first()).toHaveValue('84');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).first().click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await page.locator('.designer-workspace__canvas').first().screenshot({
    path: '.playwright/cassette-designer-parameters.png'
  });
  await app.expectCleanRuntime();
});
