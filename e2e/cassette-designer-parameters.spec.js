import { test, expect } from './fixtures.js';

// The profile parameter round (regression: the workpiece row's parameter
// chips must re-evaluate the placed profile, the array position fields
// must hold the typed text — the browser forwarded label clicks onto the
// token panel's first button (a phantom parameter token), and a falsy
// read replaced empty or zero array values with the defaults — and a
// selected profile previews the assembly it is placed in, never a blank
// workpiece pane). The chips are the shared expression editor over the
// cassette's variables: a value naming a global reads it live (the tree
// carries A=500), and naming one never mints a new chip. Parameter names
// rename in place — a global's rename rebinds every tree reference, a
// profile parameter's rename moves its key and bindings — and a
// profile-local parameter shadows a same-named global. Artifacts:
// .playwright/cassette-designer-parameters.png
//
// A fillet bound on a DRAWN corner must drive the placed profile too: the
// drawn sketch's point ids are identity, not position, so the fillet
// resolves by its vertex slot (an id parsed as an index dropped it and
// the chip changed nothing). Clearing the canvas starts the blank
// authoring session — the parameter table empties with the canvas, so
// the template's W/H/R/D/L never ride a hand-drawn profile. Artifacts:
// .playwright/cassette-designer-parameters-fillet.png,
// .playwright/cassette-designer-parameters-edges.png (the profile edge
// chooser offers only arrangeable edges — a fold never carries a
// profile, owner law 2026-10-16).

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

const chipField = (page, key, label = 'Hanger profile') => page
  .locator(`div[aria-label="Parameters ${key} ${label}"] div[contenteditable]`);
const chipText = (locator) => locator.evaluate(el => (el.textContent || '').trim());

test('profile parameter chips re-evaluate the placed profile; array position fields hold drafts', async ({ app }) => {
  test.setTimeout(240_000);
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette'], via: { cassette: 'editor' } });
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette');
  expect(list?.route, 'Expected a compiled cassette list screen').toBeTruthy();
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  // The onboarding tour pops over the palette after a delay — this test
  // runs long enough to hit it; it stays dismissed.
  await page.addInitScript(() => window.localStorage.setItem(
    'perigram:onboarding:cassette-designer-v2',
    JSON.stringify({ dismissed: true, dismissedAt: Date.now() })
  ));
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

  // The saved profile row carries a live expression chip per bound
  // parameter, and the pane with it selected shows the assembly it is
  // placed in.
  const chipW = chipField(page, 'W');
  await expect(chipW).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => chipText(chipW)).toBe('42');
  for (const [key, value] of [['H', '28'], ['R', '3'], ['D', '6']]) {
    await expect.poll(() => chipText(chipField(page, key))).toBe(value);
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
  await page.keyboard.type('84', { delay: 60 });
  await page.waitForTimeout(1500);
  const after = await assemblyGeometry(page);
  expect(after, 'Expected the chip edit to change the drawn profile').not.toEqual(before);
  await expect.poll(() => chipText(chipW)).toBe('84');

  // A chip value naming a cassette variable reads that variable (the
  // tree's A is 500) — no new chip is minted, the raw expression stays.
  const chipCount = () => page.locator('div[aria-label^="Parameters "][aria-label$=" Hanger profile"]').count();
  const chipsBefore = await chipCount();
  await chipW.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('A', { delay: 60 });
  await page.waitForTimeout(1500);
  expect(await assemblyGeometry(page), 'Expected the global-named chip value to re-derive the profile')
    .not.toEqual(after);
  await expect.poll(() => chipText(chipW)).toBe('A');
  expect(await chipCount(), 'Expected no new chip from naming a global').toBe(chipsBefore);

  // Renaming a global in place rebinds every reference: the field keeps
  // the tree's value and the chip's expression follows the new name.
  const globalNameA = page.locator('aside input[aria-label="Parameter name A"]');
  await expect(globalNameA).toBeVisible();
  await globalNameA.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('LENGTH', { delay: 40 });
  await globalNameA.press('Enter');
  await page.waitForTimeout(1200);
  await expect(page.locator('aside input[aria-label="Parameter name LENGTH"]')).toBeVisible();
  await expect.poll(() => chipText(chipField(page, 'W'))).toBe('LENGTH');

  // The renamed global reached the profile's own table — the raw
  // expression, exactly as the rename rewrote it.
  await page.getByRole('button', { name: 'Edit profile' }).first().click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator('input[aria-label="W"]').first()).toHaveValue('LENGTH');

  // Renaming a profile parameter in place moves the key and its
  // bindings: the row's field follows the new name.
  const nameW = dialog.locator('input[aria-label="Parameter name W"]').first();
  await nameW.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('WIDTH', { delay: 40 });
  await nameW.press('Enter');
  await page.waitForTimeout(600);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect.poll(() => chipText(chipField(page, 'WIDTH'))).toBe('LENGTH');

  await page.locator('.designer-workspace__canvas').first().screenshot({
    path: '.playwright/cassette-designer-parameters.png'
  });
  await app.expectCleanRuntime();
});

test('a fillet bound on a drawn corner drives the placed profile', async ({ app }) => {
  test.setTimeout(240_000);
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');
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
  // Clearing starts the blank session: the previous session's parameter
  // rows die with the canvas — nothing pre-seeds the next drawn profile.
  await expect(dialog.locator('input[aria-label="W"]')).toHaveCount(0);
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
  await fillet.pressSequentially('K', { delay: 80 });
  await fillet.press('Enter');
  await page.waitForTimeout(600);

  const paramK = dialog.locator('input[aria-label="K"]').first();
  await paramK.click();
  await page.keyboard.press('ControlOrMeta+a');
  await paramK.pressSequentially('1', { delay: 80 });
  await paramK.press('Enter');
  await page.waitForTimeout(600);

  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const chipK = page.locator('div[aria-label^="Parameters K "] div[contenteditable]').first();
  await expect(chipK).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => chipText(chipK)).toBe('1');
  await page.waitForTimeout(1200);

  // Driving the chip re-rounds the drawn corner.
  const before = await assemblyGeometry(page);
  expect(before, 'Expected the placed drawn profile to show geometry').not.toBe('');
  await chipK.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('2.5', { delay: 60 });
  await page.waitForTimeout(1500);
  const after = await assemblyGeometry(page);
  expect(after, 'Expected the fillet chip to re-round the drawn profile').not.toBe(before);
  await expect.poll(() => chipText(chipK)).toBe('2.5');

  await page.locator('.designer-workspace__canvas').first().screenshot({
    path: '.playwright/cassette-designer-parameters-fillet.png'
  });
  await app.expectCleanRuntime();
});

test('the profile edge chooser never offers a fold edge', async ({ app }) => {
  test.setTimeout(240_000);
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette'], via: { cassette: 'editor' } });
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette');
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  await app.gotoClient(list.route);

  await page.locator('main').getByRole('button', { name: 'New', exact: true }).click();
  const canvas = page.locator('.designer-workspace__canvas').first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  // Grow a face on E0: the fold consumes that edge.
  await canvas.locator('g line.cursor-pointer').first().dispatchEvent('mouseenter');
  await page.waitForTimeout(600);
  await canvas.locator('g.cursor-pointer', { hasText: '+' }).first().click();
  await page.waitForTimeout(1200);

  // Place the default hanger and open its attachment popup. Profiles
  // from this file's earlier tests make the picker appear first — its
  // New profile entry opens the sketch editor.
  await page.getByRole('button', { name: 'Add profile' }).click();
  const pickerEntry = page.getByRole('button', { name: /Create new|New profile/ }).first();
  if (await pickerEntry.isVisible().catch(() => false)) await pickerEntry.click();
  const dialog = page.locator('[role="dialog"]').filter({ hasText: 'Profile sketch' }).first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  // Author one shape with an operation (the save gate): a rectangle
  // through the CAD engine's command lifecycle.
  const drawButton = dialog.locator('button[aria-label="Rectangle"]').first();
  await drawButton.click();
  await expect(drawButton, 'Rectangle command started').toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.waitForTimeout(150);
  const sketchBox = await dialog.locator('[role="application"]').first().boundingBox();
  await page.mouse.click(sketchBox.x + sketchBox.width * 0.3, sketchBox.y + sketchBox.height * 0.3);
  await page.waitForTimeout(250);
  await page.mouse.click(sketchBox.x + sketchBox.width * 0.6, sketchBox.y + sketchBox.height * 0.6);
  await expect(drawButton, 'Rectangle command ended').not.toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.waitForTimeout(600);

  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1200);

  // The refused default (face_1 › E0 is the fold) leaves the row's
  // Positioning control as the entry to the placement popup.
  await page.locator('aside').getByRole('button', { name: 'Positioning' }).first().click();
  const popup = page.locator('div.z-\\[120\\]').first();
  await expect(popup).toBeVisible({ timeout: 15_000 });
  await popup.locator('[aria-label="Placement"]').click();
  await page.getByRole('option', { name: 'Edge array', exact: true }).click();
  await page.waitForTimeout(600);

  // The chooser offers only arrangeable edges: the fold (E0) is absent,
  // and the stale E0 default snapped to the first arrangeable edge.
  const edgeSelect = popup.locator('[aria-label="Array edge"]');
  await expect(edgeSelect).toBeVisible();
  await expect.poll(() => edgeSelect.evaluate(el => el.querySelector('input')?.value || el.textContent?.trim()))
    .toBe('E1');
  await edgeSelect.click();
  await expect(page.getByRole('option', { name: 'E0', exact: true })).toHaveCount(0);
  for (const edge of ['E1', 'E2', 'E3']) {
    await expect(page.getByRole('option', { name: edge, exact: true })).toBeVisible();
  }
  await page.getByRole('option', { name: 'E2', exact: true }).click();
  await page.waitForTimeout(1000);

  await canvas.screenshot({ path: '.playwright/cassette-designer-parameters-edges.png' });
  await app.expectCleanRuntime();
});
