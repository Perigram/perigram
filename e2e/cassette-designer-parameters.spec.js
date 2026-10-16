import { test, expect } from './fixtures.js';

// The profile parameter round (regression: the workpiece row's parameter
// chips must re-evaluate the placed profile, the array position fields
// must hold the typed text — the browser forwarded label clicks onto the
// token panel's first button (a phantom parameter token), and a falsy
// read replaced empty or zero array values with the defaults — and a
// selected profile previews the assembly it is placed in, never a blank
// workpiece pane). Artifacts: .playwright/cassette-designer-parameters.png
//
// A fillet bound on a DRAWN corner must drive the placed profile too: the
// drawn sketch's point ids are identity, not position, so the fillet
// resolves by its vertex slot (an id parsed as an index dropped it and
// the chip changed nothing). Artifact:
// .playwright/cassette-designer-parameters-fillet.png

const assemblyGeometry = (page) => page.locator('.designer-workspace__canvas').first()
  .evaluate(el => Array.from(el.querySelectorAll('path, line, polyline, circle, rect'))
    .map(node => node.getAttribute('d') || node.getAttribute('points') ||
      `${node.getAttribute('x1')},${node.getAttribute('y1')},${node.getAttribute('x2')},${node.getAttribute('y2')}` ||
      `${node.getAttribute('cx')},${node.getAttribute('cy')},${node.getAttribute('r')}`)
    .join(';'));

const arrayValueText = (page) => page.locator('div.z-\\[120\\]').first()
  .evaluate(root => {
    for (const span of root.querySelectorAll('span')) {
      const text = (span.textContent || '').trim();
      if (text === 'Array spacing' || text === 'Array count') {
        return span.parentElement.querySelector('div[contenteditable]')?.textContent ?? null;
      }
    }
    return null;
  });

test('profile parameter chips re-evaluate the placed profile; array position fields hold drafts', async ({ app }) => {
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

  // A profile authored through the dialog opens on the parametric hanger;
  // an open chain edge-embeds when placed by array.
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

  await dialog.getByRole('button', { name: 'Closed shape', exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // The saved profile row carries a live chip per bound parameter, and
  // the pane with it selected shows the assembly it is placed in.
  const chipW = page.locator('input[aria-label="Parameters W Hanger profile"]');
  await expect(chipW).toBeVisible({ timeout: 20_000 });
  await expect(chipW).toHaveValue('42');
  for (const [key, value] of [['H', '28'], ['R', '3'], ['D', '6']]) {
    await expect(page.locator(`input[aria-label="Parameters ${key} Hanger profile"]`)).toHaveValue(value);
  }
  await page.waitForTimeout(1200);
  expect(await assemblyGeometry(page), 'Expected the placed profile pane to show geometry').not.toBe('');

  // Array position settings: the fields are the author's text.
  await page.locator('aside button').filter({ hasText: /→|<-/ }).first().click();
  const popup = page.locator('div.z-\\[120\\]').first();
  await expect(popup).toBeVisible({ timeout: 15_000 });
  await popup.locator('[aria-label="Placement"]').click();
  await page.getByRole('option', { name: 'Edge array', exact: true }).click();
  await page.waitForTimeout(400);
  await popup.locator('[aria-label="Array rule"]').click();
  await page.getByRole('option', { name: 'By spacing', exact: true }).click();
  await page.waitForTimeout(600);

  // Focusing a position field must not insert a token (label forwarding).
  const spacingField = popup.locator('div[contenteditable]').filter({ hasText: '120' });
  await spacingField.click();
  await page.waitForTimeout(400);
  expect(await arrayValueText(page), 'Expected the spacing field to keep its value on focus').toBe('120');

  // Clearing and typing a zero stays the author's text.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  expect(await arrayValueText(page), 'Expected the cleared field to stay empty').toBe('');
  await page.keyboard.type('0', { delay: 100 });
  await page.waitForTimeout(300);
  expect(await arrayValueText(page), 'Expected a typed zero to stay zero').toBe('0');
  await popup.locator('button[aria-label="Close"]').click();
  await page.waitForTimeout(800);

  // Driving the chip re-evaluates the placed profile's geometry.
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

test('a fillet bound on a drawn corner drives the placed profile', async ({ app }) => {
  test.setTimeout(240_000);
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette'], via: { cassette: 'editor' } });
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette');
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  await app.gotoClient(list.route);

  await page.locator('main').getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.designer-workspace__canvas').first()).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Add profile' }).click();
  const dialog = page.locator('[role="dialog"]').filter({ hasText: 'Profile sketch' }).first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const canvas = dialog.locator('div[role="application"]');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);

  // A hand-drawn closed quad: four corners, closed on the first.
  await dialog.getByRole('button', { name: 'Clear canvas', exact: true }).click();
  await page.waitForTimeout(500);
  await dialog.getByRole('button', { name: 'Line', exact: true }).click();
  await page.waitForTimeout(300);
  const box = await canvas.boundingBox();
  const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const corners = [[0.4, 0.4], [0.62, 0.42], [0.6, 0.64], [0.38, 0.62]];
  for (const [fx, fy] of corners) {
    const point = at(fx, fy);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(250);
  }
  const first = at(corners[0][0], corners[0][1]);
  await page.mouse.click(first.x, first.y);
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await dialog.getByRole('button', { name: 'Select', exact: true }).click();
  await page.waitForTimeout(500);

  // Bind the first corner's fillet to a fresh parameter.
  await page.mouse.click(first.x, first.y);
  const fillet = dialog.locator('input[aria-label^="Fillet radius"]').first();
  await expect(fillet).toBeVisible({ timeout: 10_000 });
  await fillet.click();
  await page.keyboard.press('ControlOrMeta+a');
  await fillet.pressSequentially('A', { delay: 80 });
  await fillet.press('Enter');
  await page.waitForTimeout(600);

  const paramA = dialog.locator('input[aria-label="A"]').first();
  await paramA.click();
  await page.keyboard.press('ControlOrMeta+a');
  await paramA.pressSequentially('1', { delay: 80 });
  await paramA.press('Enter');
  await page.waitForTimeout(600);

  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const chipA = page.locator('input[aria-label^="Parameters A "]').first();
  await expect(chipA).toBeVisible({ timeout: 20_000 });
  await expect(chipA).toHaveValue('1');
  await page.waitForTimeout(1200);

  // Driving the chip re-rounds the drawn corner.
  const before = await assemblyGeometry(page);
  expect(before, 'Expected the placed drawn profile to show geometry').not.toBe('');
  await chipA.click();
  await page.keyboard.press('ControlOrMeta+a');
  await chipA.pressSequentially('2.5', { delay: 80 });
  await chipA.press('Enter');
  await page.waitForTimeout(1500);
  const after = await assemblyGeometry(page);
  expect(after, 'Expected the fillet chip to re-round the drawn profile').not.toBe(before);
  await expect(chipA).toHaveValue('2.5');

  await page.locator('.designer-workspace__canvas').first().screenshot({
    path: '.playwright/cassette-designer-parameters-fillet.png'
  });
  await app.expectCleanRuntime();
});
