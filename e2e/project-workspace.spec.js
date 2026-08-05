import { test, expect } from './fixtures.js';

test.describe('generated project workspace', () => {
  test('opens a linked library child cassette in its editor tab and restores it', async ({ app }) => {
    const project = entity('project-1', 'Project One', {
      relations: { library: { entityType: 'library', id: 'library-1' } }
    });
    const library = entity('library-1', 'Library One');
    const cassette = entity('cassette-1', 'Cassette One', {
      lineage: { organizationId: 'org-demo-acme', libraryId: 'library-1' },
      status: lifecycleStatus('ACTIVE'),
      data: { definition: { occs: '0.4-draft', documentType: 'template', parameters: {}, definitions: { workpieces: [] } } }
    });

    await app.page.route('**/api/auth/me', async route => {
      const response = await route.fetch();
      const current = await response.json();
      await route.fulfill({ response, json: { ...current, screens: [...(current.screens || []), ...workspaceScreens()] } });
    });
    await fulfillJson(app.page, '**/api/project/project-1', project);
    await fulfillJson(app.page, '**/api/libraries/library-1', library);
    await fulfillJson(app.page, '**/api/cassettes?**', [cassette]);
    await fulfillJson(app.page, '**/api/cassettes/cassette-1', cassette);
    await fulfillJson(app.page, '**/api/status/actions?**', []);
    await fulfillJson(app.page, '**/api/templates/pens', []);
    await fulfillJson(app.page, '**/api/layer-standards**', []);

    await app.page.goto('/screens/project_workspace_test?entityId=project-1');
    await app.page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.includes('project-workspace')) localStorage.removeItem(key);
      }
    });
    await app.page.reload();

    await app.page.getByRole('treeitem', { name: /linked entities/i }).getByRole('button').click();
    await app.page.getByText('Library One', { exact: true }).first().click();
    await expect(app.page.locator('[data-workspace-pane] header')).toContainText('Library One');
    await expect(app.page.getByText('Cassette One', { exact: true }).first()).toBeVisible();

    await app.page.getByRole('button', { name: 'Cassette One' }).click();
    const paneHeader = app.page.locator('[data-workspace-pane] header');
    await expect(paneHeader.getByRole('tab', { name: 'Library One' })).toBeVisible();
    const cassetteTab = paneHeader.getByRole('tab', { name: 'Cassette One' });
    await expect(cassetteTab).toHaveAttribute('aria-selected', 'true');
    await expect(cassetteTab.locator('..').locator('[data-entity-status="true"] .status-badge-glyph')).toHaveAttribute('aria-label', /active/i);
    await expect(app.page.locator('[data-workspace-pane] .entity-page [data-entity-page-header]')).toHaveCount(0);
    await expect(paneHeader.getByRole('button', { name: /^add$/i })).toBeVisible();

    await expect(paneHeader.getByRole('button', { name: /^edit$/i })).toHaveCount(0);
    await expect(app.page.locator('[data-workspace-pane] [data-tab-actions]').getByRole('button', { name: /^edit$/i })).toHaveCount(0);
    await expect(app.page.locator('[data-workspace-pane]').getByPlaceholder(/cassette name/i)).toBeVisible();

    await app.page.reload();
    await expect(app.page.getByRole('tab', { name: 'Library One' })).toBeVisible();
    const restoredCassetteTab = app.page.getByRole('tab', { name: 'Cassette One' });
    await expect(restoredCassetteTab).toHaveAttribute('aria-selected', 'true');
    await restoredCassetteTab.locator('..').getByRole('button', { name: /^close$/i }).click();
    await expect(app.page.getByRole('tab', { name: 'Cassette One' })).toHaveCount(0);
    await expect(app.page.getByRole('tab', { name: 'Library One' })).toHaveAttribute('aria-selected', 'true');
    await app.expectCleanRuntime();
  });
});

async function fulfillJson(page, pattern, json) {
  await page.route(pattern, route => route.fulfill({ json }));
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

function workspaceScreens() {
  return [
    detailScreen('project_workspace_test', 'project', [
      source('project', 'project', 'single'),
    ], [region('main', 'project')]),
    detailScreen('library_detail_test', 'library', [
      source('library', 'library', 'single'),
      { ...source('cassette_children', 'cassette', 'list'), filters: { libraryId: '$screen.scope.entityId' } }
    ], [region('main', 'library'), region('cassette_children_region', 'cassette_children', 'card')]),
    detailScreen('cassette_detail_test', 'cassette', [
      source('cassette', 'cassette', 'single')
    ], [region('main', 'cassette')])
  ];
}

function detailScreen(screenKey, entityType, sources, regions) {
  return {
    id: screenKey,
    screenKey,
    route: `/screens/${screenKey}`,
    entityType,
    template: 'entityDetail',
    placement: 'detail',
    sources,
    regions,
    actions: []
  };
}

function source(id, entityType, mode) {
  return {
    id,
    entityType,
    mode,
    required: { feature: entityType === 'cassette' ? 'cassettes' : 'projects', level: 'read' },
    ...(mode === 'single' ? { identifier: '$screen.scope.entityId' } : {})
  };
}

function region(id, sourceId, surface = 'detail') {
  return { id, slot: 'main', sourceId, surface, actions: [] };
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
