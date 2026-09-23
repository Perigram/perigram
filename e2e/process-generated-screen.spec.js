import { test, expect } from './fixtures.js';

// Browser evidence for TODO-process-designer.md "P1 — complete generated
// interface construction", checkboxes 6 (post-action refresh) and 7
// (template-matrix browser tests). The matrix is derived from the canonical
// screen contract dimensions (typeId x source mode x binding shapes x
// region action scoping) using the active compiled process of the assigned
// organization; entity endpoints are mocked so every variant is hermetic.

const LIST_VARIANTS = [
  { screenKey: 'auto_project', typeId: 'project', listBase: '/api/project', name: 'Matrix Project One', statusFiltered: true, createLabel: 'Project', canDelete: true },
  { screenKey: 'auto_queue', typeId: 'queue', listBase: '/api/queue', name: 'Matrix Queue One', statusFiltered: true, createLabel: 'Queue', canDelete: true },
  { screenKey: 'auto_library', typeId: 'library', listBase: '/api/libraries', name: 'Matrix Library One', statusFiltered: true, createLabel: 'Library', canDelete: true },
  { screenKey: 'auto_cassette', typeId: 'cassette', listBase: '/api/cassettes', name: 'Matrix Cassette One', statusFiltered: true, createLabel: 'Cassette', canDelete: true },
  { screenKey: 'auto_artifact', typeId: 'artifact', listBase: '/api/artifacts', name: 'Matrix Artifact One', statusFiltered: true, createLabel: 'Artifact', canDelete: true },
  { screenKey: 'auto_facade', typeId: 'facade', listBase: '/api/facades', name: 'Matrix Facade One', statusFiltered: true, createLabel: 'Facade', canDelete: true },
  { screenKey: 'auto_cassette_design', typeId: 'cassette_design', listBase: '/api/cassette-designs', name: 'Matrix Design One', statusFiltered: false, createLabel: null, canDelete: false }
];

test.describe('process generated screens', () => {
  test('queue collection source has a canonical generated-screen endpoint', async ({ app }) => {
    const queueList = await app.request.get('/api/queue', { failOnStatusCode: false });
    const queueListText = await queueList.text();
    expect(queueList.ok(), queueListText).toBeTruthy();

    const legacyQueueList = await app.request.get('/api/queues', { failOnStatusCode: false });
    expect(legacyQueueList.status()).toBe(404);
  });

  for (const variant of LIST_VARIANTS) {
    test(`list screen ${variant.screenKey} resolves its contracted source endpoint`, async ({ app }) => {
      const auth = await app.switchToAssignedOrganization();
      expect(
        (auth.screens || []).some(screen => screen.screenKey === variant.screenKey),
        `Expected a compiled screen with key ${variant.screenKey}`
      ).toBeTruthy();

      const item = entity(`${variant.typeId}-m1`, variant.name, {
        status: lifecycleStatus('NEW')
      });
      const requested = [];
      const listHandler = route => {
        requested.push(route.request().url());
        return route.fulfill({ json: [item] });
      };
      await app.page.route(`**${variant.listBase}`, listHandler);
      await app.page.route(`**${variant.listBase}?**`, listHandler);
      await mockStatusActions(app.page);

      await app.page.goto(`/screens/${variant.screenKey}`);
      await expect(app.page.getByText(variant.name).first()).toBeVisible();

      expect(requested.length).toBeGreaterThan(0);
      const statusUrls = requested.filter(url => url.includes('primaryState'));
      if (variant.statusFiltered) {
        expect(statusUrls.some(url => url.includes('primaryState=NEW'))).toBeTruthy();
      } else {
        expect(statusUrls).toEqual([]);
      }

      const toolbar = app.page.locator('[data-collection-toolbar]');
      if (variant.createLabel) {
        await expect(toolbar.getByRole('button', { name: variant.createLabel })).toBeVisible();
      } else {
        await expect(toolbar.getByRole('button')).toHaveCount(0);
      }

      // Permission-denied actions stay hidden: delete requires an admin grant,
      // which the assigned role holds for production entities but not for
      // cassette designs (write level only). Card footer actions live behind
      // the card's "More" popover.
      await app.page.getByRole('button', { name: 'More' }).click();
      const deleteButtons = app.page.getByRole('button', { name: 'Delete' });
      if (variant.canDelete) {
        await expect(deleteButtons.first()).toBeVisible();
      } else {
        await expect(deleteButtons).toHaveCount(0);
      }

      await app.expectCleanRuntime();
    });
  }

  test('detail screen resolves single and filtered child sources with region-scoped actions', async ({ app }) => {
    await app.switchToAssignedOrganization();
    const library = entity('library-m1', 'Matrix Library One', {
      status: lifecycleStatus('NEW')
    });
    const cassette = entity('cassette-m1', 'Matrix Cassette One', {
      lineage: { organizationId: 'org-demo-acme', libraryId: 'library-m1' },
      status: lifecycleStatus('NEW')
    });
    const cassetteRequests = [];
    const cassetteHandler = route => {
      cassetteRequests.push(route.request().url());
      return route.fulfill({ json: [cassette] });
    };
    await fulfillJson(app.page, '**/api/libraries/library-m1', library);
    // The route hierarchy breadcrumb resolves the current entity through the
    // list endpoint with an _id query (stores/navigation.js → entityStore).
    await fulfillJson(app.page, '**/api/libraries?**', [library]);
    await app.page.route('**/api/cassettes', cassetteHandler);
    await app.page.route('**/api/cassettes?**', cassetteHandler);
    await mockStatusActions(app.page);

    await app.page.goto('/screens/auto_library_detail?instanceId=library-m1&libraryId=library-m1');
    await expect(app.page.getByText('Matrix Library One').first()).toBeVisible();
    await expect(app.page.getByText('Matrix Cassette One').first()).toBeVisible();

    // The single-mode source resolves its identifier from the
    // $screen.scope.instanceId binding and the child list source resolves its
    // $screen.scope.instanceId filter placeholder plus the access-rule status.
    expect(cassetteRequests.some(url => (
      url.includes('libraryId=library-m1') && url.includes('primaryState=NEW')
    ))).toBeTruthy();

    // Region action scoping: the cassette child region owns the create
    // cassette action, and actions from unrelated screens never leak in.
    // (Exact match: card title buttons contain the entity name as a substring.)
    const childToolbar = app.page.locator('[data-collection-toolbar]');
    await expect(childToolbar.getByRole('button', { name: 'Cassette', exact: true })).toHaveCount(1);
    await expect(childToolbar.getByRole('button')).toHaveCount(1);
    await expect(app.page.getByRole('button', { name: 'Queue' })).toHaveCount(0);
    await expect(app.page.getByRole('button', { name: 'Project' })).toHaveCount(0);

    await app.expectCleanRuntime();
  });

  test('detail screen without contracted actions renders no generated action buttons', async ({ app }) => {
    await app.switchToAssignedOrganization();
    const design = entity('cd-m1', 'Matrix Design One', {
      status: lifecycleStatus('NEW')
    });
    await fulfillJson(app.page, '**/api/cassette-designs/cd-m1', design);
    await fulfillJson(app.page, '**/api/cassette-designs?**', [design]);
    await mockStatusActions(app.page);

    await app.page.goto('/screens/auto_cassette_design_detail?instanceId=cd-m1&cassette_designId=cd-m1');
    await expect(app.page.getByText('Matrix Design One').first()).toBeVisible();

    // The banner breadcrumb carries a screen dropdown button, so generated
    // action absence is asserted inside the main content only.
    const main = app.page.locator('main');
    await expect(main.getByRole('button', { name: 'Cassette Design' })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Cassette', exact: true })).toHaveCount(0);

    await app.expectCleanRuntime();
  });

  test('home screen renders every contracted source section from its own endpoint', async ({ app }) => {
    const auth = await app.switchToAssignedOrganization();
    const home = (auth.screens || []).find(screen => screen.template === 'home');
    expect(home?.route, 'Expected a compiled home screen').toBeTruthy();

    const sections = [
      { typeId: 'project', listBase: '/api/project', name: 'Home Project One' },
      { typeId: 'queue', listBase: '/api/queue', name: 'Home Queue One' },
      { typeId: 'library', listBase: '/api/libraries', name: 'Home Library One' },
      { typeId: 'cassette', listBase: '/api/cassettes', name: 'Home Cassette One' },
      { typeId: 'artifact', listBase: '/api/artifacts', name: 'Home Artifact One' },
      { typeId: 'facade', listBase: '/api/facades', name: 'Home Facade One' },
      { typeId: 'cassette_design', listBase: '/api/cassette-designs', name: 'Home Design One' }
    ];
    for (const section of sections) {
      const item = entity(`${section.typeId}-h1`, section.name, {
        status: lifecycleStatus('NEW')
      });
      await fulfillJson(app.page, `**${section.listBase}`, [item]);
      await fulfillJson(app.page, `**${section.listBase}?**`, [item]);
    }
    await mockStatusActions(app.page);

    await app.page.goto(home.route);
    for (const section of sections) {
      const region = app.page.locator(`[id="home-type-${section.typeId}"]`);
      await expect(region.getByText(section.name).first()).toBeVisible();
    }

    await app.expectCleanRuntime();
  });

  test('patches the affected list source in place after a mapped relation action result', async ({ app }) => {
    await app.switchToAssignedOrganization();
    const project = entity('project-r1', 'Refresh Project One', {
      status: lifecycleStatus('NEW')
    });
    const library = entity('library-r1', 'Refresh Library Two', {
      status: lifecycleStatus('NEW')
    });
    let projectListRequests = 0;
    const projectHandler = route => {
      projectListRequests += 1;
      return route.fulfill({ json: [project] });
    };
    await app.page.route('**/api/project', projectHandler);
    await app.page.route('**/api/project?**', projectHandler);
    await fulfillJson(app.page, '**/api/libraries', [library]);
    await fulfillJson(app.page, '**/api/libraries?**', [library]);
    await fulfillJson(app.page, '**/api/libraries/library-r1', library);
    // Link-action prompt options come from the action options endpoint, not
    // the plain library list (GeneratedScreen.entityOptions).
    await fulfillJson(app.page, '**/api/process-definitions/active/actions/*/options**', [library]);
    await mockStatusActions(app.page);

    let executeBody = null;
    await app.page.route('**/api/process-definitions/active/actions/*/execute', route => {
      executeBody = route.request().postDataJSON();
      return route.fulfill({
        json: {
          owner: {
            ...project,
            identity: { ...project.identity, name: 'Refresh Project Linked' },
            relations: { library: { typeId: 'library', id: 'library-r1' } }
          }
        }
      });
    });

    await app.page.goto('/screens/auto_project');
    await expect(app.page.getByText('Refresh Project One')).toBeVisible();
    await app.page.evaluate(() => {
      window.__e2eNoReload = true;
    });
    const listRequestsAfterLoad = projectListRequests;

    // Card-level relation actions live behind the card's "More" popover.
    await app.page.getByRole('button', { name: 'More' }).click();
    await app.page.getByRole('button', { name: 'Library', exact: true }).click();
    // The closing popover keeps role="dialog" during its leave transition;
    // target the modal dialog by its PrimeVue class instead.
    const dialog = app.page.locator('.p-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.p-select').click();
    await app.page.getByRole('option', { name: /Refresh Library Two/ }).click();
    await dialog.getByRole('button', { name: 'Library' }).click();

    // The owner snapshot returned by the execute endpoint patches the project
    // card in place: no source reload and no page reload are involved.
    await expect(app.page.getByText('Refresh Project Linked')).toBeVisible();
    await app.page.waitForTimeout(400);
    expect(executeBody?.instanceId).toBe('project-r1');
    expect(projectListRequests).toBe(listRequestsAfterLoad);
    await expect(app.page.getByText('Refresh Project One', { exact: true })).toHaveCount(0);
    expect(await app.page.evaluate(() => window.__e2eNoReload)).toBe(true);
    expect(app.page.url()).toContain('/screens/auto_project');

    await app.expectCleanRuntime();
  });

  test('generated create form posts prompt data and opens the created entity detail', async ({ app }) => {
    await app.switchToAssignedOrganization();
    const existing = entity('library-c1', 'Create Existing Library', {
      status: lifecycleStatus('NEW')
    });
    const created = entity('library-c2', 'Created Browser Library', {
      status: lifecycleStatus('NEW')
    });
    await fulfillJson(app.page, '**/api/libraries', [existing]);
    // The detail-page breadcrumb resolves the created entity through the list
    // endpoint with an _id query; everything else lists the existing row.
    await app.page.route('**/api/libraries?**', route => route.fulfill({
      json: route.request().url().includes('_id=library-c2') ? [created] : [existing]
    }));
    await fulfillJson(app.page, '**/api/libraries/library-c2', created);
    await fulfillJson(app.page, '**/api/cassettes', []);
    await fulfillJson(app.page, '**/api/cassettes?**', []);
    await mockStatusActions(app.page);

    let executeBody = null;
    await app.page.route('**/api/process-definitions/active/actions/*/execute', route => {
      executeBody = route.request().postDataJSON();
      return route.fulfill({ json: { created } });
    });

    await app.page.goto('/screens/auto_library');
    await expect(app.page.getByText('Create Existing Library')).toBeVisible();

    const toolbar = app.page.locator('[data-collection-toolbar]');
    await toolbar.getByRole('button', { name: 'Library' }).click();
    const dialog = app.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill('Created Browser Library');
    await dialog.getByRole('button', { name: 'Library' }).click();

    await expect(app.page).toHaveURL(/auto_library_detail/);
    await expect(app.page.getByText('Created Browser Library').first()).toBeVisible();
    expect(executeBody?.data?.identity?.name).toBe('Created Browser Library');

    await app.expectCleanRuntime();
  });
});

async function fulfillJson(page, pattern, json) {
  await page.route(pattern, route => route.fulfill({ json }));
}

async function mockStatusActions(page) {
  await fulfillJson(page, '**/api/state/actions', []);
  await fulfillJson(page, '**/api/state/actions?**', []);
}

function entity(id, name, overrides = {}) {
  return {
    _id: id,
    identity: { uid: id, name },
    origin: {},
    status: {},
    lineage: { organizationId: 'org-demo-acme' },
    relations: {},
    provenance: {},
    summary: {},
    data: {},
    ...overrides
  };
}

function lifecycleStatus(primary) {
  return {
    state: {
      schemaVersion: 2,
      primary,
      active: { main: primary },
      regions: { main: { state: primary, path: [primary] } }
    },
    lifecycle: { actors: [], attachments: {}, data: {} }
  };
}
