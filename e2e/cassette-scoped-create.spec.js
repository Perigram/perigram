import { test, expect } from './fixtures.js';

// A cassette created from its parent collection keeps the launch parent:
// the record is created under the library before the editor saves, and the
// first save fills its payload without dropping the lineage binding.
test('cassette create from a library collection keeps its parent', async ({ app }) => {
  test.setTimeout(300_000);
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');
  await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');
  await app.declareType({
    id: 'e2e-library',
    name: 'Library',
    class: 'group',
    fields: { name: { base: 'string', identifier: true } },
    edges: {
      children: {
        cassettes: { types: ['cassette-template'], lineageKey: 'libraryId', onRemove: 'restrict' }
      }
    }
  });
  const { manifest } = await app.seedSpeciesProcess({
    types: ['e2e-library', 'cassette-template'],
    via: { 'cassette-template': 'editor' },
    children: [{ parent: 'e2e-library', child: 'cassette-template', key: 'libraryId' }]
  });
  const library = await app.createInstance('e2e-library', { name: 'Library one' });
  const libraryId = String(library._id || library.id || '');
  expect(libraryId).toBeTruthy();
  const detail = (manifest.screens || []).find(screen => screen.template === 'instanceDetail' && screen.typeId === 'e2e-library');
  expect(detail?.route, 'Expected a compiled library detail screen').toBeTruthy();
  const page = app.page;
  await page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  await page.addInitScript(() => window.localStorage.setItem(
    'perigram:onboarding:cassette-designer-v2',
    JSON.stringify({ dismissed: true, dismissedAt: Date.now() })
  ));
  await app.gotoClient(`${detail.route}?instanceId=${encodeURIComponent(libraryId)}`);
  await page.getByRole('button', { name: /^New Cassette template/ }).click();

  const save = page.getByRole('button', { name: 'Save', exact: true }).first();
  await save.waitFor({ timeout: 60_000 });
  await expect.poll(async () => {
    const rows = await (await app.request.get('/api/instances/cassette-template')).json();
    return (Array.isArray(rows) ? rows : []).some(row => String(row.lineage?.libraryId || '') === libraryId);
  }, { timeout: 30_000 }).toBe(true);

  const savedPayload = page.waitForResponse(response => (
    response.request().method() === 'PUT'
    && /\/api\/instances\/cassette-template\/[^/]+\/payload$/.test(response.url())
  ));
  await save.click();
  await savedPayload;
  await expect(save).toBeDisabled({ timeout: 30_000 });

  const rows = await (await app.request.get('/api/instances/cassette-template')).json();
  const created = (Array.isArray(rows) ? rows : []).find(row => String(row.lineage?.libraryId || '') === libraryId);
  expect(created?._id, 'the created cassette carries the launch parent').toBeTruthy();
  expect(created?.payload?.fileId, 'the first save filled the cassette payload').toBeTruthy();
  await app.expectCleanRuntime();
});
