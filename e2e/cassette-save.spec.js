import { test, expect } from './fixtures.js';

// A blank cassette editor creates and saves on the first Save. The save
// reloads the stored template; the tab then closes without an unsaved
// confirmation and the collection lists the new record.
test('cassette first save leaves a clean record', async ({ app }) => {
  test.setTimeout(300_000);
  await app.installPlugins(['tech-drawing', 'facade']);
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
  await page.locator('main').getByRole('button', { name: /^New( Cassette template( from [A-Za-z]+)?)?$/ }).click();
  const save = page.getByRole('button', { name: 'Save', exact: true }).first();
  await save.waitFor({ timeout: 60_000 });
  const savedPayload = page.waitForResponse(response => (
    response.request().method() === 'PUT'
    && /\/api\/instances\/cassette-template\/[^/]+\/payload$/.test(response.url())
  ));
  await save.click();
  await savedPayload;
  await expect(save).toBeDisabled({ timeout: 30_000 });

  await expect.poll(async () => {
    const rows = await (await app.request.get('/api/instances/cassette-template')).json();
    return Array.isArray(rows) ? rows.length : 0;
  }, { timeout: 30_000 }).toBe(1);

  const designerTab = page.getByRole('tab', { name: 'cassette-designer' });
  await designerTab.first().getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await expect(designerTab).toHaveCount(0);

  await page.evaluate(target => {
    history.pushState({}, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, list.route);
  await expect(page.getByText('New Cassette', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await app.expectCleanRuntime();
});
