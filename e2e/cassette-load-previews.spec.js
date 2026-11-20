import { test, expect } from './fixtures.js';

// The cassette load picker renders payload-based thumbnails (the same
// previews the platform's card/detail slots mount). Regression probe:
// save a cassette through the designer, open the load picker, and
// assert the row renders a drawing canvas — not the placeholder — with
// a clean runtime. Artifacts: .playwright/cassette-load-previews.png
// and .playwright/cassette-load-previews-console.txt on failure.

test('the cassette load picker renders payload-based previews', async ({ app }) => {
  test.setTimeout(180_000);
  const { manifest } = await (async () => {
    await app.installPlugins(['tech-drawing', 'documents', 'facade']);
    await app.connectPlugin('facade', 'http://facade-executor:8790');
    return app.seedSpeciesProcess({ types: ['cassette-template'], via: { 'cassette-template': 'editor' } });
  })();
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette-template');
  expect(list?.route, 'Expected a compiled cassette list screen').toBeTruthy();

  await app.page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  await app.gotoClient(list.route);

  await app.page.getByRole('button', { name: /^New( Cassette template( from [A-Za-z]+)?)?$/ }).click();
  await expect(app.page.locator('.designer-workspace__canvas').first()).toBeVisible({ timeout: 60_000 });

  // Save the blank designer's tree: the payload round trip is exactly
  // what the picker's thumbnails hydrate.
  await app.page.getByRole('button', { name: 'Save', exact: true }).click();
  await app.page.waitForTimeout(2500);

  await app.page.getByRole('button', { name: 'Load template', exact: true }).click();
  const rows = app.page.locator('.p-popover button:has(span.h-9)');
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });

  const thumbnails = rows.locator('span.h-9');
  await expect(
    thumbnails.filter({ has: app.page.locator('svg') }).first(),
    'Expected a payload-hydrated thumbnail canvas in the load picker'
  ).toBeVisible({ timeout: 30_000 });

  await app.page.screenshot({ path: '.playwright/cassette-load-previews.png' });
  await app.expectCleanRuntime();
});
