import { test, expect } from './fixtures.js';

// The cassette record view previews through the plugin's SVG surface:
// the payload document renders in-place on the shared drawing canvas,
// outline and folds visible, no engine mount in the preview slot.

test('cassette record previews as in-place SVG', async ({ app }) => {
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
  await page.locator('main').getByRole('button', { name: /^New / }).click();
  await expect(page.locator('.designer-workspace__canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(4000);
  await page.locator('[data-designer-toolbar]').getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(4000);
  // The record opens by route: the designer's first save races its own
  // default title, so the row's label is not a stable address.
  const saved = await (await app.request.get('/api/instances/cassette-template')).json();
  const record = (Array.isArray(saved) ? saved : [])
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  expect(record?._id, 'the designer save created a record').toBeTruthy();
  const detail = (manifest.screens || []).find(screen => screen.template === 'instanceDetail' && screen.typeId === 'cassette-template');
  const detailRoute = detail?.route || `${list.route}_detail`;
  await app.gotoClient(`${detailRoute}?instanceId=${encodeURIComponent(String(record._id))}`);

  const preview = page.locator('[data-cassette-preview-root="true"]').first();
  await expect(preview.locator('svg')).toBeVisible({ timeout: 30_000 });
  await expect(preview.locator('svg path').first()).toBeVisible();
  // The preview stays engine-free: the record view carries no CadCraft
  // iframe anywhere in its preview band.
  await expect(preview.locator('iframe')).toHaveCount(0);
  await preview.screenshot({ path: '.playwright/cassette-preview-svg.png' });
  await app.expectCleanRuntime();
});
