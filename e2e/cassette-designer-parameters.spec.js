import { test, expect } from './fixtures.js';

// The profile parameter round (regression: the workpiece row's parameter
// chips must re-evaluate the placed profile, the array position fields
// must hold the typed text — the browser forwarded label clicks onto the
// token panel's first button (a phantom parameter token), and a falsy
// read replaced empty or zero array values with the defaults — and a
// selected profile previews the assembly it is placed in, never a blank
// workpiece pane). The dialog drafts blank and parameters are authored:
// a drawn shape's field binds to a parameter by name, and the chips are
// the shared expression editor over the cassette's variables: a value
// naming a global reads it live (the tree carries A=500), and naming one
// never mints a new chip. Parameter names rename in place — a global's
// rename rebinds every tree reference, a profile parameter's rename
// moves its key and bindings — and a profile-local parameter shadows a
// same-named global. Artifacts: .playwright/cassette-designer-parameters.png
//
// A fillet bound on a DRAWN corner must drive the placed profile too: the
// drawn sketch's point ids are identity, not position, so the fillet
// resolves by its vertex slot (an id parsed as an index dropped it and
// the chip changed nothing). The blank session carries no parameter
// rows. Artifacts:
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

const arrayValueText = (page) => page.locator('[data-designer-panel-editor]').first()
  .evaluate(root => root.querySelector('[aria-label="Gap"], [aria-label="Step"], [aria-label="Span"], [aria-label="Count"]')?.value ?? null);

const chipField = (page, key, label = 'Hanger profile') => page
  .locator(`input[aria-label="Parameters ${key} ${label}"]`);
const chipText = (locator) => locator.inputValue();

const openProfilePopup = async (page) => {
  const hit = page.locator('[data-designer-profile-id]').first();
  if (await hit.count()) {
    await hit.dispatchEvent('click');
  } else {
    await page.locator('aside').getByRole('treeitem', { name: /^Hanger profile/ }).first().click();
  }
  await expect(page.locator('[data-designer-panel-editor]').first()).toBeVisible({ timeout: 20_000 });
};

test('profile parameter chips re-evaluate the placed profile; array position fields hold drafts', async ({ app }) => {
  test.setTimeout(240_000);
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');
  await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette-template'], via: { 'cassette-template': 'editor' } });
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette-template');
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

  const newButton = page.locator('main').getByRole('button', { name: /^New( Cassette template( from [A-Za-z]+)?)?$/ });
  await expect(newButton).toBeVisible({ timeout: 30_000 });
  await newButton.click();
  await expect(page.locator('.designer-workspace__canvas').first()).toBeVisible({ timeout: 60_000 });

  // The sketch mode drafts blank: no parameter rows until the author adds one.
  await page.getByRole('button', { name: 'Add profile' }).click();
  const pickerEntry = page.getByRole('button', { name: /Create new|New profile/ }).first();
  await pickerEntry.waitFor({ timeout: 10_000 }).catch(() => {});
  if (await pickerEntry.isVisible().catch(() => false)) await pickerEntry.click();
  const dialog = page.locator('[data-sketch-mode="profile"]').first();
  const inspector = page.locator('.designer-workspace__inspector').first();
  const tools = page.locator('.designer-workspace__palette');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator('[role="application"]').first()).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });
  await expect(inspector.locator('input[aria-label^="Parameter name"]')).toHaveCount(0);

  // Author one rectangle through the CAD engine's command lifecycle.
  const drawButton = tools.locator('button[aria-label="Rectangle"]').first();
  await drawButton.click();
  await expect(drawButton, 'Rectangle command started').toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.waitForTimeout(150);
  const sketchBox = await dialog.locator('[role="application"]').first().boundingBox();
  await page.mouse.click(sketchBox.x + sketchBox.width * 0.3, sketchBox.y + sketchBox.height * 0.3);
  await page.waitForTimeout(250);
  await page.mouse.click(sketchBox.x + sketchBox.width * 0.6, sketchBox.y + sketchBox.height * 0.6);
  await expect(drawButton, 'Rectangle command ended').not.toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.waitForTimeout(600);

  // The authored parameter renames to W; while focused, its value field is
  // the draft: partial numbers keep their shape instead of being
  // normalized under the caret.
  await inspector.getByRole('button', { name: 'Add parameter' }).click();
  await page.waitForTimeout(400);
  const paramName = inspector.locator('input[aria-label^="Parameter name"]').last();
  await paramName.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('W', { delay: 40 });
  await paramName.press('Enter');
  await page.waitForTimeout(400);
  const fxW = inspector.locator('input[aria-label="W"]').last();
  await expect(fxW).toBeVisible({ timeout: 5000 });
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

  // The rect's width binds to W by name — the field keeps the expression.
  const rectRow = inspector.locator('button[aria-label^="Rectangle s"]').first();
  await rectRow.click();
  await page.waitForTimeout(400);
  const widthField = inspector.locator('input[aria-label^="w s"]').first();
  await expect(widthField).toBeVisible({ timeout: 10_000 });
  await widthField.click();
  await page.keyboard.press('ControlOrMeta+a');
  await widthField.pressSequentially('W', { delay: 60 });
  await widthField.press('Enter');
  await page.waitForTimeout(600);
  await expect(widthField).toHaveValue('W');

  await inspector.getByRole('button', { name: 'Back to cassette' }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // The saved profile row carries a live expression chip per bound
  // parameter, and the pane with it selected shows the assembly it is
  // placed in.
  await openProfilePopup(page);
  await expect(page.locator('aside').getByRole('button', { name: 'Positioning' })).toHaveCount(0);
  const chipW = chipField(page, 'W');
  await expect(chipW).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => chipText(chipW)).toBe('42');
  await page.waitForTimeout(1200);
  expect(await assemblyGeometry(page), 'Expected the placed profile pane to show geometry').not.toBe('');


  // Array position settings: the fields are the author's text.
  const popup = page.locator('[data-designer-panel-editor]').first();
  await expect(popup).toBeVisible({ timeout: 15_000 });
  await popup.locator('[aria-label="Placement"]').click();
  await page.getByRole('option', { name: 'Edge array', exact: true }).click();
  await page.waitForTimeout(400);
  await popup.locator('[aria-label="Array rule"]').click();
  for (const rule of ['Count', 'Step', 'Gap', 'Span']) {
    await expect(page.getByRole('option', { name: rule, exact: true })).toBeVisible();
  }
  await page.getByRole('option', { name: 'Gap', exact: true }).click();
  await page.waitForTimeout(600);

  // The anchor moves the array: start and end must place different geometry.
  const anchor = popup.locator('[aria-label="Anchor"]');
  await anchor.click();
  await page.getByRole('option', { name: 'Start', exact: true }).click();
  await page.waitForTimeout(1200);
  const startBound = await assemblyGeometry(page);
  await anchor.click();
  await page.getByRole('option', { name: 'End', exact: true }).click();
  await page.waitForTimeout(1200);
  const endBound = await assemblyGeometry(page);
  expect(endBound, 'Expected the array anchor to move the placed copies').not.toBe(startBound);
  await anchor.click();
  await page.getByRole('option', { name: 'Center', exact: true }).click();
  await page.waitForTimeout(600);

  // Focusing a position field must not insert a token (label forwarding).
  const spacingField = popup.locator('input[aria-label="Gap"]');
  await spacingField.click();
  await page.waitForTimeout(400);
  expect(await arrayValueText(page), 'Expected the spacing field to keep its value on focus').toBe('120');
  const spacingInput = spacingField;

  // Clearing and typing a zero stays the author's text; the empty value
  // rides the PrimeVue invalid state alone.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  expect(await arrayValueText(page), 'Expected the cleared field to stay empty').toBe('');
  await expect(spacingInput).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.type('0', { delay: 100 });
  await page.waitForTimeout(300);
  expect(await arrayValueText(page), 'Expected a typed zero to stay zero').toBe('0');
  await expect(spacingInput).not.toHaveAttribute('aria-invalid', 'true');
  await popup.locator('button[aria-label="Close"]').click();
  await page.waitForTimeout(800);
  await openProfilePopup(page);

  // Driving the chip re-evaluates the placed profile's geometry.
  const before = await assemblyGeometry(page);
  await chipW.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('84', { delay: 60 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const after = await assemblyGeometry(page);
  expect(after, 'Expected the chip edit to change the drawn profile').not.toEqual(before);
  await expect.poll(() => chipText(chipW)).toBe('84');

  // A chip value naming a cassette variable reads that variable (the
  // tree's A is 500) — no new chip is minted, the raw expression stays.
  const chipCount = () => page.locator('input[aria-label^="Parameters "][aria-label$=" Hanger profile"]').count();
  const chipsBefore = await chipCount();
  await chipW.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('A', { delay: 60 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  expect(await assemblyGeometry(page), 'Expected the global-named chip value to re-derive the profile')
    .not.toEqual(after);
  await expect.poll(() => chipText(chipW)).toBe('A');
  expect(await chipCount(), 'Expected no new chip from naming a global').toBe(chipsBefore);

  // Renaming a global in place rebinds every reference: the field keeps
  // the tree's value and the chip's expression follows the new name.
  await popup.locator('button[aria-label="Close"]').click();
  await page.waitForTimeout(300);
  const globalNameA = page.locator('aside input[aria-label="Parameter name A"]');
  await expect(globalNameA).toBeVisible();
  await globalNameA.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('LENGTH', { delay: 40 });
  await globalNameA.press('Enter');
  await page.waitForTimeout(1200);
  await expect(page.locator('aside input[aria-label="Parameter name LENGTH"]')).toBeVisible();
  await openProfilePopup(page);
  await expect.poll(() => chipText(chipField(page, 'W'))).toBe('LENGTH');

  // The renamed global reached the profile's own table — the raw
  // expression, exactly as the rename rewrote it.
  await page.getByRole('button', { name: 'Edit profile' }).first().click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await inspector.locator('button[aria-label^="Rectangle s"]').first().click();
  const reopenedWidth = inspector.locator('input[aria-label^="w s"]').first();
  await expect(reopenedWidth).toBeVisible({ timeout: 10_000 });
  await expect(reopenedWidth).toHaveValue('W');

  // Renaming a profile parameter in place moves the key and its
  // bindings: the row's field follows the new name.
  const nameW = inspector.locator('input[aria-label="Parameter name W"]').first();
  await nameW.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('WIDTH', { delay: 40 });
  await nameW.press('Enter');
  await page.waitForTimeout(600);
  await expect(reopenedWidth).toHaveValue('WIDTH');
  await inspector.getByRole('button', { name: 'Back to cassette' }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await openProfilePopup(page);
  await expect.poll(() => chipText(chipField(page, 'WIDTH'))).toBe('LENGTH');

  // A profile as wide as its face cannot hold a second column; shrink it
  // so the face grid has room to place its copies.
  const widthChip = chipField(page, 'WIDTH');
  await widthChip.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('42', { delay: 60 });
  await page.keyboard.press('Enter');
  await expect.poll(() => chipText(widthChip)).toBe('42');

  await page.locator('.designer-workspace__canvas').first().screenshot({
    path: '.playwright/cassette-designer-parameters.png'
  });

  // Face-array fields exist in the same placement editor and expose the
  // canonical layout, axis rules, stagger, and radial handles.
  await popup.locator('[aria-label="Placement"]').click();
  await page.getByRole('option', { name: 'Face array', exact: true }).click();
  await page.waitForTimeout(400);
  const layout = popup.locator('[aria-label="Array layout"]');
  await expect(layout).toBeVisible();
  await expect(popup.locator('[aria-label="Anchor"]')).toHaveCount(0);
  await expect(popup.locator('input[aria-label="Columns"]')).toBeVisible();
  await expect(popup.locator('input[aria-label="Rows"]')).toBeVisible();
  await expect(popup.locator('input[aria-label="Left padding"]')).toBeVisible();
  // The grid fills the face: a 2x2 count places four copies flush on the
  // boundaries, and the column field drives the placed geometry live.
  const placedCopies = () => page.locator('.designer-workspace__canvas [data-designer-profile-id]').count();
  await expect.poll(placedCopies).toBe(4);
  const columns = popup.locator('input[aria-label="Columns"]');
  await columns.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('3', { delay: 60 });
  await page.keyboard.press('Enter');
  await expect.poll(placedCopies).toBe(6);
  // An impossible rule reports in the editor instead of silently
  // dropping the placement.
  await columns.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('20', { delay: 60 });
  await page.keyboard.press('Enter');
  await expect(popup.getByRole('alert')).toContainText(/overlaps|fit|no copy/i);
  await expect.poll(placedCopies).toBe(0);
  await columns.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('3', { delay: 60 });
  await page.keyboard.press('Enter');
  await expect.poll(placedCopies).toBe(6);
  await layout.click();
  await page.getByRole('option', { name: 'Hex', exact: true }).click();
  await page.waitForTimeout(300);
  await expect(popup.locator('[aria-label="Stagger"]')).toBeVisible();
  await layout.click();
  await page.getByRole('option', { name: 'Polar', exact: true }).click();
  await page.waitForTimeout(300);
  await expect(popup.locator('input[aria-label="Rings"]')).toBeVisible();
  await expect(popup.locator('input[aria-label="Polar radius"]')).toBeVisible();
  await expect(popup.locator('input[aria-label="Start angle"]')).toBeVisible();
  await expect(popup.locator('input[aria-label="Sweep"]')).toBeVisible();
  await page.locator('.designer-workspace__canvas').first().screenshot({
    path: '.playwright/cassette-designer-face-array.png'
  });
  await app.expectCleanRuntime();
});

test('a dimension edit over an instance override writes the override; clearing starts a fresh session', async ({ app }) => {
  test.setTimeout(240_000);
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
  await page.getByRole('button', { name: 'Add profile' }).click();
  const pickerEntry = page.getByRole('button', { name: /Create new|New profile/ }).first();
  await pickerEntry.waitFor({ timeout: 10_000 }).catch(() => {});
  if (await pickerEntry.isVisible().catch(() => false)) await pickerEntry.click();
  const dialog = page.locator('[data-sketch-mode="profile"]').first();
  const inspector = page.locator('.designer-workspace__inspector').first();
  const tools = page.locator('.designer-workspace__palette');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const canvas = dialog.locator('[role="application"]').first();
  await expect(canvas).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });

  const drawRectangle = async () => {
    const drawButton = tools.locator('button[aria-label="Rectangle"]').first();
    await drawButton.click();
    await expect(drawButton).toHaveClass(/p-button-primary/, { timeout: 15_000 });
    await page.waitForTimeout(150);
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.waitForTimeout(250);
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await expect(drawButton).not.toHaveClass(/p-button-primary/, { timeout: 15_000 });
    await page.waitForTimeout(600);
  };
  const bindWidth = async (value) => {
    await inspector.locator('button[aria-label^="Rectangle s"]').first().click();
    const width = inspector.locator('input[aria-label^="w s"]').first();
    await width.click();
    await page.keyboard.press('ControlOrMeta+a');
    await width.pressSequentially(value, { delay: 60 });
    await width.press('Enter');
    await page.waitForTimeout(600);
    return width;
  };

  await drawRectangle();
  await inspector.getByRole('button', { name: 'Add parameter' }).click();
  const paramName = inspector.locator('input[aria-label^="Parameter name"]').last();
  await paramName.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('W', { delay: 40 });
  await paramName.press('Enter');
  const fxW = inspector.locator('input[aria-label="W"]').last();
  await fxW.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('42', { delay: 40 });
  await fxW.press('Enter');
  await bindWidth('W');
  await inspector.getByRole('button', { name: 'Back to cassette' }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await openProfilePopup(page);
  const chipW = chipField(page, 'W');
  await expect(chipW).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => chipText(chipW)).toBe('42');
  await chipW.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('84', { delay: 60 });
  await page.keyboard.press('Enter');
  await expect.poll(() => chipText(chipW)).toBe('84');

  // A number typed into the dimension bound to W edits the instance
  // override that drives the drawing; the authored row keeps 42.
  await page.getByRole('button', { name: 'Edit profile' }).first().click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });
  await inspector.locator('button[aria-label^="Rectangle s"]').first().click();
  const widthField = inspector.locator('input[aria-label^="w s"]').first();
  await expect(widthField).toHaveValue('W');
  await widthField.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('20', { delay: 60 });
  await widthField.press('Enter');
  await page.waitForTimeout(800);
  await expect(inspector.locator('input[aria-label="W"]').last()).toHaveValue('42');
  await expect(widthField).toHaveValue('W');

  // Renaming the authored row moves the override with it.
  const nameW = inspector.locator('input[aria-label="Parameter name W"]').first();
  await nameW.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('WIDTH', { delay: 40 });
  await nameW.press('Enter');
  await page.waitForTimeout(600);
  await expect(widthField).toHaveValue('WIDTH');
  await inspector.getByRole('button', { name: 'Back to cassette' }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await openProfilePopup(page);
  await expect.poll(() => chipText(chipField(page, 'WIDTH'))).toBe('20');

  // Clearing starts a session whose history begins at the blank sketch:
  // undo cannot cross back into the cleared profile.
  await page.getByRole('button', { name: 'Edit profile' }).first().click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });
  await page.locator('[data-designer-toolbar]').getByRole('button', { name: 'Clear canvas' }).click();
  await expect(inspector.locator('button[aria-label^="Rectangle s"]')).toHaveCount(0);
  await expect(page.locator('[data-designer-toolbar]').getByRole('button', { name: 'Undo' })).toBeDisabled();

  // A sketch bound to a cassette global has no authored row to store in
  // the library: the workpiece saves, the library record refuses.
  await drawRectangle();
  const width = await bindWidth('A');
  await expect(width).toHaveValue('A');
  await expect(inspector.getByRole('button', { name: 'Back to cassette' })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Save to library', exact: true })).toBeDisabled();

  await app.expectCleanRuntime();
});

test('a fillet bound on a drawn corner drives the placed profile', async ({ app }) => {
  test.setTimeout(240_000);
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');
  await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette-template'], via: { 'cassette-template': 'editor' } });
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette-template');
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  await app.gotoClient(list.route);

  await page.locator('main').getByRole('button', { name: /^New( Cassette template( from [A-Za-z]+)?)?$/ }).click();
  await expect(page.locator('.designer-workspace__canvas').first()).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Add profile' }).click();
  const pickerEntry = page.getByRole('button', { name: /Create new|New profile/ }).first();
  await pickerEntry.waitFor({ timeout: 10_000 }).catch(() => {});
  if (await pickerEntry.isVisible().catch(() => false)) await pickerEntry.click();
  const dialog = page.locator('[data-sketch-mode="profile"]').first();
  const inspector = page.locator('.designer-workspace__inspector').first();
  const tools = page.locator('.designer-workspace__palette');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const canvas = dialog.locator('div[role="application"]');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });
  // The blank session carries no parameter rows — nothing pre-seeds a
  // drawn profile.
  await expect(inspector.locator('input[aria-label^="Parameter name"]')).toHaveCount(0);

  // Author one rectangle through the engine's command lifecycle.
  const drawButton = tools.locator('button[aria-label="Rectangle"]').first();
  await drawButton.click();
  await expect(drawButton, 'Rectangle command started').toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.waitForTimeout(150);
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.waitForTimeout(250);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await expect(drawButton, 'Rectangle command ended').not.toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.waitForTimeout(600);

  // Bind the first corner's fillet radius to a fresh parameter: typing a
  // free identifier into the row's field adopts it (adopt-on-bind).
  await inspector.locator('button[aria-label^="Rectangle s"]').first().click();
  const fillet = inspector.locator('input[aria-label^="r0 s"]').first();
  await expect(fillet).toBeVisible({ timeout: 10_000 });
  await fillet.click();
  await page.keyboard.press('ControlOrMeta+a');
  await fillet.pressSequentially('K', { delay: 80 });
  await fillet.press('Enter');
  await page.waitForTimeout(600);

  const paramK = inspector.locator('input[aria-label="K"]').first();
  await paramK.click();
  await page.keyboard.press('ControlOrMeta+a');
  await paramK.pressSequentially('1', { delay: 80 });
  await paramK.press('Enter');
  await page.waitForTimeout(600);

  await inspector.getByRole('button', { name: 'Back to cassette' }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await openProfilePopup(page);
  const chipK = page.locator('input[aria-label^="Parameters K "]').first();
  await expect(chipK).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => chipText(chipK)).toBe('1');
  await page.waitForTimeout(1200);

  // Driving the chip re-rounds the drawn corner.
  const before = await assemblyGeometry(page);
  expect(before, 'Expected the placed drawn profile to show geometry').not.toBe('');
  await chipK.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('2.5', { delay: 60 });
  await page.keyboard.press('Enter');
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
  await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette-template'], via: { 'cassette-template': 'editor' } });
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette-template');
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  await app.gotoClient(list.route);

  await page.locator('main').getByRole('button', { name: /^New( Cassette template( from [A-Za-z]+)?)?$/ }).click();
  const canvas = page.locator('.designer-workspace__canvas').first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  // Grow a face on E0: the fold consumes that edge.
  await canvas.locator('g line.cursor-pointer').first().dispatchEvent('mouseenter');
  await page.waitForTimeout(600);
  await canvas.locator('g.cursor-pointer', { hasText: '+' }).first().click();
  await page.getByRole('button', { name: 'Add face', exact: true }).click();
  await page.waitForTimeout(1200);

  // Place the default hanger and open its attachment popup. Profiles
  // from this file's earlier tests make the picker appear first — its
  // New profile entry opens the sketch editor.
  await page.getByRole('button', { name: 'Add profile' }).click();
  const pickerEntry = page.getByRole('button', { name: /Create new|New profile/ }).first();
  await pickerEntry.waitFor({ timeout: 10_000 }).catch(() => {});
  if (await pickerEntry.isVisible().catch(() => false)) await pickerEntry.click();
  const dialog = page.locator('[data-sketch-mode="profile"]').first();
  const inspector = page.locator('.designer-workspace__inspector').first();
  const tools = page.locator('.designer-workspace__palette');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator('[role="application"]').first()).toHaveAttribute('data-cadcraft-ready', 'true', { timeout: 120_000 });

  // Author one shape with an operation (the save gate): a rectangle
  // through the CAD engine's command lifecycle.
  const drawButton = tools.locator('button[aria-label="Rectangle"]').first();
  await drawButton.click();
  await expect(drawButton, 'Rectangle command started').toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.waitForTimeout(150);
  const sketchBox = await dialog.locator('[role="application"]').first().boundingBox();
  await page.mouse.click(sketchBox.x + sketchBox.width * 0.3, sketchBox.y + sketchBox.height * 0.3);
  await page.waitForTimeout(250);
  await page.mouse.click(sketchBox.x + sketchBox.width * 0.6, sketchBox.y + sketchBox.height * 0.6);
  await expect(drawButton, 'Rectangle command ended').not.toHaveClass(/p-button-primary/, { timeout: 15_000 });
  await page.waitForTimeout(600);

  await inspector.getByRole('button', { name: 'Back to cassette' }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1200);

  // The refused default (face_1 › E0 is the fold) leaves the profile
  // row as the entry to the placement popup.
  await openProfilePopup(page);
  const popup = page.locator('[data-designer-panel-editor]').first();
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
