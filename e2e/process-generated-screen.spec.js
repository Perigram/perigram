import { test, expect } from './fixtures.js';

// Browser evidence for the generated screen matrix over the live
// registry: pack file types (cassette, sketch, text-document, csv-table)
// plus org-authored group/item types, seeded through the real
// declaration + process APIs (seedSpeciesProcess). Collection pools are
// route-mocked so list/detail variants stay hermetic; the create and
// patch flows run live through the process action and instance update
// transports.

const PACK_LIST_TYPES = ['cassette-template', 'sketch', 'text-document', 'csv-table'];
const CHILD_TYPE = 'e2e-mnote';
const PARENT_TYPE = 'e2e-mfolder';

const TYPE_NAMES = {
  sketch: 'Sketch',
  'text-document': 'Text document',
  'csv-table': 'CSV table',
  [PARENT_TYPE]: 'E2E Matrix Folder',
  [CHILD_TYPE]: 'E2E Matrix Note'
};

test.describe('process generated screens', () => {
  test('instance transport serves the generated-screen collection endpoint', async ({ app }) => {
    await app.installPlugins(['tech-drawing', 'facade']);
    const list = await app.request.get('/api/instances/cassette-template', { failOnStatusCode: false });
    expect(list.ok(), await list.text()).toBeTruthy();

    const legacyQueueList = await app.request.get('/api/queues', { failOnStatusCode: false });
    expect(legacyQueueList.status()).toBe(404);
  });

  for (const typeId of [...PACK_LIST_TYPES, PARENT_TYPE]) {
    test(`list screen auto_${typeId} resolves its contracted source endpoint`, async ({ app }) => {
      test.setTimeout(120_000);
      await app.installPlugins(['tech-drawing', 'documents', 'facade']);
      await seedMatrixTypes(app);
      const { manifest } = await app.seedSpeciesProcess({
        types: [...PACK_LIST_TYPES, PARENT_TYPE, CHILD_TYPE],
        via: { [PARENT_TYPE]: 'genericCreate', [CHILD_TYPE]: 'genericCreate' }
      });
      const screenKey = `auto_${typeId}`;
      expect(
        (manifest.screens || []).some(screen => screen.screenKey === screenKey),
        `Expected a compiled screen with key ${screenKey}`
      ).toBeTruthy();

      const item = instanceDto(`${typeId}-m1`, typeId, `Matrix ${TYPE_NAMES[typeId]} One`);
      const requested = [];
      const listHandler = route => {
        requested.push(route.request().url());
        return route.fulfill({ json: [item] });
      };
      await app.page.route(`**/api/instances/${typeId}`, listHandler);
      await app.page.route(`**/api/instances/${typeId}?**`, listHandler);
      await mockStatusActions(app.page);

      await app.page.goto(`/screens/${screenKey}`);
      await expect(app.page.getByText(`Matrix ${TYPE_NAMES[typeId]} One`).first()).toBeVisible({ timeout: 20000 });

      expect(requested.length).toBeGreaterThan(0);
      expect(requested.every(url => url.includes(`/api/instances/${typeId}`))).toBeTruthy();

      const mainRegion = app.page.locator('main');
      await expect(mainRegion.getByRole('button', { name: /^New / })).toBeVisible({ timeout: 20000 });

      // No per-instance delete action is compiled for these constructs,
      // so no Delete entry renders anywhere in the surface.
      await expect(mainRegion.getByRole('button', { name: 'Delete' })).toHaveCount(0);

      await app.expectCleanRuntime();
    });
  }

  test('detail screen resolves the single source and the lineage-scoped child region', async ({ app }) => {
    test.setTimeout(120_000);
    await app.installPlugins(['tech-drawing', 'documents', 'facade']);
    await seedMatrixTypes(app);
    const { manifest } = await app.seedSpeciesProcess({
      types: [...PACK_LIST_TYPES, PARENT_TYPE, CHILD_TYPE],
      via: { [PARENT_TYPE]: 'genericCreate', [CHILD_TYPE]: 'genericCreate' }
    });
    const detail = (manifest.screens || []).find(screen => screen.screenKey === `auto_${PARENT_TYPE}_detail`);
    expect(detail, 'Expected a compiled parent detail screen').toBeTruthy();

    const folder = instanceDto('folder-m1', PARENT_TYPE, 'Matrix Folder One');
    const note = instanceDto('note-m1', CHILD_TYPE, 'Matrix Note One', {
      lineage: { organizationId: 'org', e2eMfolderId: 'folder-m1' }
    });
    const foreignNote = instanceDto('note-m2', CHILD_TYPE, 'Matrix Note Foreign', {
      lineage: { organizationId: 'org', e2eMfolderId: 'folder-m2' }
    });
    const noteHandler = route => route.fulfill({ json: [note, foreignNote] });
    await fulfillJson(app.page, `**/api/instances/${PARENT_TYPE}/folder-m1`, folder);
    await app.page.route(`**/api/instances/${PARENT_TYPE}`, route => route.fulfill({ json: [folder] }));
    await app.page.route(`**/api/instances/${PARENT_TYPE}?**`, route => route.fulfill({ json: [folder] }));
    await app.page.route(`**/api/instances/${CHILD_TYPE}`, noteHandler);
    await app.page.route(`**/api/instances/${CHILD_TYPE}?**`, noteHandler);
    await mockStatusActions(app.page);

    await app.page.goto(`/screens/auto_${PARENT_TYPE}_detail?instanceId=folder-m1`);
    await expect(app.page.getByText('Matrix Folder One').first()).toBeVisible({ timeout: 20000 });
    await expect(app.page.getByText('Matrix Note One').first()).toBeVisible({ timeout: 20000 });

    // The child region resolves its $screen.scope.instanceId filter over
    // the loaded pool: only the opened parent's children render.
    await expect(app.page.getByText('Matrix Note Foreign')).toHaveCount(0);

    // Region action scoping: the child region owns the child create
    // action, and actions from unrelated screens never leak in.
    const mainRegion = app.page.locator('main');
    // Both creates collapse to the localized "New"; the child region
    // owns the only one on this surface (no unrelated type's create
    // leaks in).
    await expect(mainRegion.getByRole('button', { name: /^New / })).toHaveCount(1);

    await app.expectCleanRuntime();
  });

  test('record header renders the declared containment ancestors as breadcrumbs', async ({ app }) => {
    test.setTimeout(120_000);
    await seedMatrixTypes(app);
    const { manifest } = await app.seedSpeciesProcess({
      types: [PARENT_TYPE, CHILD_TYPE],
      via: { [PARENT_TYPE]: 'genericCreate', [CHILD_TYPE]: 'genericCreate' }
    });
    const detail = (manifest.screens || []).find(screen => screen.screenKey === `auto_${CHILD_TYPE}_detail`);
    expect(detail, 'Expected a compiled child detail screen').toBeTruthy();

    const folder = instanceDto('folder-crumb', PARENT_TYPE, 'Crumb Folder');
    const note = instanceDto('note-crumb', CHILD_TYPE, 'Crumb Note', {
      lineage: { organizationId: 'org', e2eMfolderId: 'folder-crumb' }
    });
    const parentHandler = route => route.fulfill({ json: [folder] });
    const childHandler = route => route.fulfill({ json: [note] });
    await app.page.route(`**/api/instances/${PARENT_TYPE}`, parentHandler);
    await app.page.route(`**/api/instances/${PARENT_TYPE}?**`, parentHandler);
    await app.page.route(`**/api/instances/${CHILD_TYPE}`, childHandler);
    await app.page.route(`**/api/instances/${CHILD_TYPE}?**`, childHandler);
    await mockStatusActions(app.page);

    await app.page.goto(`/screens/auto_${CHILD_TYPE}_detail?instanceId=note-crumb`);
    await expect(app.page.getByText('Crumb Note').first()).toBeVisible({ timeout: 20000 });

    const trail = app.page.locator('.p-breadcrumb').filter({ hasText: 'Crumb Folder' });
    await expect(trail.getByRole('button', { name: 'Crumb Folder' })).toBeVisible({ timeout: 20000 });
    await app.page.screenshot({ path: '.playwright/instance-header-breadcrumbs.png' });
    await app.expectCleanRuntime();
  });

  test('detail screen with an unresolvable scope renders the missing state', async ({ app }) => {
    test.setTimeout(120_000);
    await seedMatrixTypes(app);
    const { manifest } = await app.seedSpeciesProcess({
      types: [PARENT_TYPE, CHILD_TYPE],
      via: { [PARENT_TYPE]: 'genericCreate', [CHILD_TYPE]: 'genericCreate' }
    });
    const detail = (manifest.screens || []).find(screen => screen.screenKey === `auto_${PARENT_TYPE}_detail`);
    expect(detail, 'Expected a compiled parent detail screen').toBeTruthy();

    // The list source resolves the type, but the scoped instance is not
    // among the served rows (a deleted record, a stale link): the source
    // is not ready, and the surface reports the missing record instead of
    // mounting the header without an instance.
    const otherFolder = instanceDto('folder-elsewhere', PARENT_TYPE, 'Matrix Folder Elsewhere');
    await app.page.route(`**/api/instances/${PARENT_TYPE}`, route => route.fulfill({ json: [otherFolder] }));
    await app.page.route(`**/api/instances/${PARENT_TYPE}?**`, route => route.fulfill({ json: [otherFolder] }));
    await mockStatusActions(app.page);

    await app.page.goto(`/screens/auto_${PARENT_TYPE}_detail?instanceId=folder-deleted`);
    await expect(app.page.getByText('No record opened').first()).toBeVisible({ timeout: 20_000 });
    await expect(app.page.getByText('Matrix Folder Elsewhere')).toHaveCount(0);
    await app.expectCleanRuntime();
  });

  test('detail inline edit patches the opened instance in place', async ({ app }) => {
    test.setTimeout(150_000);
    await seedMatrixTypes(app);
    await app.seedSpeciesProcess({
      types: [PARENT_TYPE, CHILD_TYPE],
      via: { [PARENT_TYPE]: 'genericCreate', [CHILD_TYPE]: 'genericCreate' }
    });
    const created = await app.createInstance(PARENT_TYPE, { name: 'Patch Folder One', 'fields.note': 'first note' });
    const id = String(created._id || created.id);
    expect(id, 'Expected the created folder id').toBeTruthy();

    let listRequests = 0;
    await app.page.route(`**/api/instances/${PARENT_TYPE}`, route => {
      listRequests += 1;
      return route.fulfill({ json: [created] });
    });
    await app.page.route(`**/api/instances/${PARENT_TYPE}?**`, route => {
      listRequests += 1;
      return route.fulfill({ json: [created] });
    });
    await mockStatusActions(app.page);

    await app.page.goto(`/screens/auto_${PARENT_TYPE}_detail?instanceId=${encodeURIComponent(id)}`);
    await expect(app.page.getByText('Patch Folder One').first()).toBeVisible({ timeout: 20000 });
    const listRequestsAfterLoad = listRequests;

    // Inline edits ride the per-field pencil (no record edit mode): the
    // note fact opens its Inplace editor in place, and confirm patches
    // the instance through the update transport. The surface reconciles
    // in place (no remount): the store's SSE invalidation may refresh
    // the type bucket once in the background, but the surface never
    // reloads through the host.
    const noteFact = app.page.locator('.p-inplace').first();
    await noteFact.click();
    const editor = app.page.locator('.p-inplace input:visible').first();
    await editor.fill('note edited inline');
    await app.page.getByRole('button', { name: 'Done', exact: true }).click();

    await expect(app.page.getByText('note edited inline').first()).toBeVisible({ timeout: 20000 });
    await app.page.waitForTimeout(600);
    expect(listRequests).toBeLessThanOrEqual(listRequestsAfterLoad + 1);
    const reloaded = await app.request.get(`/api/instances/${PARENT_TYPE}/${id}`);
    expect(reloaded.ok()).toBeTruthy();
    expect((await reloaded.json()).fields?.note).toBe('note edited inline');

    await app.expectCleanRuntime();
  });

  test('home screen renders every contracted source section from its own endpoint', async ({ app }) => {
    test.setTimeout(120_000);
    await app.installPlugins(['tech-drawing', 'documents', 'facade']);
    await seedMatrixTypes(app);
    const { manifest } = await app.seedSpeciesProcess({
      types: [...PACK_LIST_TYPES, PARENT_TYPE, CHILD_TYPE],
      via: { [PARENT_TYPE]: 'genericCreate', [CHILD_TYPE]: 'genericCreate' }
    });
    const home = (manifest.screens || []).find(screen => screen.template === 'home');
    expect(home?.route, 'Expected a compiled home screen').toBeTruthy();

    const sections = [...PACK_LIST_TYPES, PARENT_TYPE].map(typeId => ({
      typeId,
      name: `Home ${TYPE_NAMES[typeId]} One`
    }));
    for (const section of sections) {
      const item = instanceDto(`${section.typeId}-h1`, section.typeId, section.name);
      await fulfillJson(app.page, `**/api/instances/${section.typeId}`, [item]);
      await fulfillJson(app.page, `**/api/instances/${section.typeId}?**`, [item]);
    }
    await mockStatusActions(app.page);

    await app.page.goto(home.route);
    for (const section of sections) {
      const panel = app.page.locator('.p-panelmenu-panel', { has: app.page.locator('.p-panelmenu-header', { hasText: TYPE_NAMES[section.typeId] }) });
      await expect(panel).toBeVisible({ timeout: 20000 });
      await expect(panel.getByText(section.name).first()).toBeVisible({ timeout: 20000 });
    }

    await app.expectCleanRuntime();
  });

  test('generated create form posts prompt data and opens the created entity detail', async ({ app }) => {
    test.setTimeout(150_000);
    await seedMatrixTypes(app);
    await app.seedSpeciesProcess({
      types: [PARENT_TYPE, CHILD_TYPE],
      via: { [PARENT_TYPE]: 'genericCreate', [CHILD_TYPE]: 'genericCreate' }
    });

    // The pool reads the live org list: after the live create the detail
    // source must serve the created row back through the same transport.
    const liveList = async route => {
      try {
        const list = await app.request.get(`/api/instances/${PARENT_TYPE}`);
        return route.fulfill({ json: list.ok() ? await list.json() : [] });
      } catch {
        return route.fulfill({ json: [] });
      }
    };
    await app.page.route(`**/api/instances/${PARENT_TYPE}`, liveList);
    await app.page.route(`**/api/instances/${PARENT_TYPE}?**`, liveList);
    await mockStatusActions(app.page);

    await app.page.goto(`/screens/auto_${PARENT_TYPE}`);
    // Gate on the settled data state (loaded rows or the empty message):
    // the create button remounts when the source lands, and a click
    // during that remount is swallowed — so the click retries until the
    // construction dialog actually opens.
    const settled = app.page.locator('main').getByRole('columnheader', { name: 'Name' });
    await expect(settled.or(app.page.getByText('No records')).first()).toBeVisible({ timeout: 20000 });
    const newButton = app.page.locator('main').getByRole('button', { name: /^New / });
    const dialog = app.page.locator('.p-dialog');
    for (let attempt = 0; attempt < 4 && !(await dialog.isVisible()); attempt += 1) {
      await newButton.click();
      await expect(dialog).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const name = app.uniqueName('Created Browser Folder');
    for (const input of await dialog.locator('input:visible').all()) {
      await input.fill(name);
    }
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    // Same-tab creation (SPEC §UI): the created record opens as a home
    // workspace pane tab, never a route outside home — the manifest's
    // home screen owns the destination. The opened tab renders the
    // created record: the create lands its entity in the shared pool
    // before opening, so the tab title and detail body carry the
    // prompted identifier value.
    await expect(app.page).toHaveURL(/\/home$/);
    await expect(app.page.getByText(name).first()).toBeVisible({ timeout: 20000 });
    const list = await app.request.get(`/api/instances/${PARENT_TYPE}`);
    const rows = await list.json();
    const created = (Array.isArray(rows) ? rows : []).find(row => (row.fields || {}).name === name);
    expect(created, 'created record carries the prompted identifier value').toBeTruthy();

    await app.expectCleanRuntime();
  });
});

// The org-authored pair the matrix seeds: an item child and its group
// parent whose children edge stores the lineage key the detail child
// region filters by. Child first: the parent's edge references it.
async function seedMatrixTypes(app) {
  await app.declareType({
    id: CHILD_TYPE,
    name: TYPE_NAMES[CHILD_TYPE],
    class: 'item',
    fields: { name: { base: 'string', identifier: true } },
    states: { main: { initial: 'new', values: ['new'], terminal: ['new'] } }
  });
  await app.declareType({
    id: PARENT_TYPE,
    name: TYPE_NAMES[PARENT_TYPE],
    class: 'group',
    fields: { name: { base: 'string', identifier: true }, note: { base: 'string' } },
    edges: { children: { notes: { types: [CHILD_TYPE], onRemove: 'restrict' } } }
  });
}

async function fulfillJson(page, pattern, json) {
  await page.route(pattern, route => route.fulfill({ json }));
}

async function mockStatusActions(page) {
  await fulfillJson(page, '**/api/state/actions', []);
  await fulfillJson(page, '**/api/state/actions?**', []);
}

function instanceDto(id, type, name, overrides = {}) {
  // The §3 flat wire: `name` and `state` travel as themselves, rows in
  // flat `fields` (the identifier row absorbs the wire name client-side).
  return {
    _id: id,
    type,
    name,
    state: 'CREATED',
    lineage: { organizationId: 'org' },
    relations: {},
    fields: {},
    ...overrides
  };
}
