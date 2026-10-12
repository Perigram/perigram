import { test, expect } from './fixtures.js';
import { createServer } from 'node:http';
import {
  fixtureSurfacePluginListing,
  FIXTURE_SURFACE_PLUGIN_ID,
  FIXTURE_SURFACE_TYPE_ID,
  FIXTURE_SURFACE_MODULE_PATH,
  FIXTURE_SURFACE_MODULE_SOURCE,
  FIXTURE_PREVIEW_MODULE_PATH,
  FIXTURE_PREVIEW_MODULE_SOURCE
} from '../test-tools/fixture-surface-plugin.js';

// M5/M7 proof (TODO §Plugin-delivered editor surfaces): a fixture plugin
// whose editor and preview surfaces are plugin-delivered — published
// through the real catalog API, installed through the real gate, served
// to the browser same-origin through the app's plugin-module proxy (a
// real local executor listener answers the app's server-side fetch),
// mounted by the app's loaders over the host context (host vue, host
// primitives, host locale), saving through the generic persistence
// callbacks and previewing read-only over the resolved payload document.
// Zero app-side code exists for the fixture's surfaces, and the run
// retracts its catalog listing so the marketplace stays clean.
const OPERATOR_TOKEN = process.env.PLATFORM_OPERATOR_TOKEN || 'perigram-dev-operator';

test('a plugin-delivered editor surface installs and opens with zero app code', async ({ app }) => {
  test.setTimeout(240_000);

  // The fixture executor: serves the surface modules the proxy fetches
  // server-side (the install's endpoints point here).
  const moduleSources = new Map([
    [FIXTURE_SURFACE_MODULE_PATH, FIXTURE_SURFACE_MODULE_SOURCE],
    [FIXTURE_PREVIEW_MODULE_PATH, FIXTURE_PREVIEW_MODULE_SOURCE]
  ]);
  const executor = createServer((request, response) => {
    const source = moduleSources.get(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    if (source == null) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/javascript' }).end(source);
  });
  await new Promise(resolve => executor.listen(8799, '127.0.0.1', resolve));
  const closeExecutor = () => new Promise(resolve => executor.close(resolve));
  app.trackCleanup(closeExecutor);
  test.info().annotations.push({ type: 'fixture-executor', description: 'http://127.0.0.1:8799' });

  const listing = fixtureSurfacePluginListing();
  const me = await (await app.request.get('/api/auth/me')).json();
  const organizationId = me.organizationId;

  const published = await app.request.post('/api/plugins/catalog', {
    headers: { 'x-operator-token': OPERATOR_TOKEN },
    data: listing
  });
  expect(published.ok(), await published.text()).toBeTruthy();
  app.trackCleanup(async () => {
    await app.request.delete(`/api/organizations/${organizationId}/plugins/${FIXTURE_SURFACE_PLUGIN_ID}`, { failOnStatusCode: false });
    await app.request.delete(`/api/plugins/catalog/${FIXTURE_SURFACE_PLUGIN_ID}`, {
      headers: { 'x-operator-token': OPERATOR_TOKEN },
      failOnStatusCode: false
    });
  });

  const installed = await app.request.post(`/api/organizations/${organizationId}/plugins`, {
    data: { pluginId: FIXTURE_SURFACE_PLUGIN_ID }
  });
  expect(installed.ok(), await installed.text()).toBeTruthy();

  // The connection settings carry the endpoint the surface module URL
  // resolves against; the browser never sees the settings — only the
  // resolved same-origin URL in the served type view.
  const settings = await app.request.post(`/api/organizations/${organizationId}/plugins/${FIXTURE_SURFACE_PLUGIN_ID}/settings`, {
    data: { endpoints: { noop: `${FIXTURE_EXECUTOR_ORIGIN}/noop` }, authToken: '' }
  });
  expect(settings.ok(), await settings.text()).toBeTruthy();

  const view = await (await app.request.get('/api/admin/cts/types')).json();
  const servedSurface = (view.surfaces || []).find(surface => surface.id === 'fx-surface-editor');
  expect(servedSurface, 'Expected the served type view to carry the declared surface').toBeTruthy();
  expect(servedSurface.url).toBe(`/api/plugins/${FIXTURE_SURFACE_PLUGIN_ID}/module${FIXTURE_SURFACE_MODULE_PATH}`);
  expect(servedSurface.surfaceContract).toBe(1);
  expect((view.editors || []).some(editor => editor.type === FIXTURE_SURFACE_TYPE_ID && editor.surface === 'fx-surface-editor')).toBeTruthy();
  const servedPreview = (view.previews || []).find(preview => preview.type === FIXTURE_SURFACE_TYPE_ID);
  expect(servedPreview, 'Expected the served type view to carry the declared preview binding').toBeTruthy();
  expect(servedPreview.url).toBe(`/api/plugins/${FIXTURE_SURFACE_PLUGIN_ID}/module${FIXTURE_PREVIEW_MODULE_PATH}`);

  // A compiled construct for the installed type creates the record the
  // editor opens (the install composed the type into the org registry;
  // the authoring domain joins it explicitly).
  const { manifest } = await app.seedSpeciesProcess({
    types: [FIXTURE_SURFACE_TYPE_ID],
    via: { [FIXTURE_SURFACE_TYPE_ID]: 'editor' },
    domainTypes: listing.declarations.types
  });
  const created = await app.createInstance(FIXTURE_SURFACE_TYPE_ID, { 'fields.name': 'Fixture Note One' });
  const id = String(created._id || created.id);
  expect(id, 'Expected the created fixture record id').toBeTruthy();

  // The modules are served by the plugin's real local executor; the app
  // streams them to the browser same-origin through the plugin-module
  // proxy.
  await app.page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));

  const detail = (manifest.screens || []).find(screen => screen.template === 'instanceDetail' && screen.typeId === FIXTURE_SURFACE_TYPE_ID);
  expect(detail?.route, 'Expected a compiled fixture detail screen').toBeTruthy();
  await app.gotoClient(`${detail.route}?instanceId=${encodeURIComponent(id)}`);

  // The editor action (generic, file-edit glyph) opens the plugin's
  // surface; the workspace mounts it as a page tab.
  const editorAction = app.page.locator('.surface-header button .pi-file-edit').first();
  await expect(editorAction).toBeVisible({ timeout: 20_000 });
  await editorAction.click();

  const editor = app.page.locator('.fx-surface-editor');
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await expect(editor.locator('.fx-surface-record')).toHaveText('Fixture Note One');

  // Save rides the generic persistence callbacks onto the payload
  // channel of the created record.
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor.locator('.fx-surface-status')).toBeVisible({ timeout: 20_000 });
  const record = await (await app.request.get(`/api/instances/${FIXTURE_SURFACE_TYPE_ID}/${id}`)).json();
  const fileId = record?.payload?.fileId;
  expect(fileId, 'Expected the saved document as the record payload').toBeTruthy();
  const download = await app.request.get(`/api/files/download/${fileId}?bucket=files`);
  expect(download.ok(), await download.text()).toBeTruthy();
  expect((await download.json()).note).toBe('fixture');

  // M7: the plugin's preview surface mounts in the detail preview slot —
  // read-only over the record and the host-resolved payload document.
  await app.gotoClient(`${detail.route}?instanceId=${encodeURIComponent(id)}`);
  const preview = app.page.locator('.fx-surface-preview');
  await expect(preview).toBeVisible({ timeout: 20_000 });
  await expect(preview.locator('.fx-surface-preview-record')).toHaveText('Fixture Note One');
  await expect(preview.locator('.fx-surface-preview-payload')).toHaveText('fixture');

  await app.expectCleanRuntime();
});
