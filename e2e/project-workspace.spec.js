import { test, expect } from './fixtures.js';

test.describe('generated project workspace', () => {
  test('opens a linked library child cassette in its editor tab and restores it', async ({ app }) => {
    const auth = await app.switchToAssignedOrganization();
    const projectScreen = (auth.screens || []).find(screen => (
      screen.template === 'entityDetail' && screen.entityType === 'project'
    ));
    expect(projectScreen?.route).toBeTruthy();
    const project = entity('project-1', 'Project One', {
      lineage: { organizationId: auth.organizationId },
      relations: { library: { entityType: 'library', id: 'library-1' } }
    });
    const library = entity('library-1', 'Library One', {
      lineage: { organizationId: auth.organizationId },
      summary: { cassetteCount: 1, cassettePreview: [{ entityType: 'cassette', id: 'cassette-1' }] },
      data: { description: 'Library summary marker' }
    });
    const queue = entity('queue-1', 'Queue One', {
      lineage: { organizationId: auth.organizationId, projectId: 'project-1' }
    });
    const cassette = entity('cassette-1', 'Cassette One', {
      lineage: { organizationId: auth.organizationId, libraryId: 'library-1' },
      status: lifecycleStatus('ACTIVE'),
      data: { definition: { occs: '0.4-draft', documentType: 'template', parameters: {}, definitions: { workpieces: [] } } }
    });

    await fulfillJson(app.page, '**/api/project/project-1', project);
    await fulfillJson(app.page, '**/api/libraries/library-1', library);
    await fulfillJson(app.page, '**/api/queue?**', [queue]);
    await fulfillJson(app.page, '**/api/cassettes?**', [cassette]);
    await fulfillJson(app.page, '**/api/cassettes/cassette-1', cassette);
    await fulfillJson(app.page, '**/api/status/actions?**', []);
    await fulfillJson(app.page, '**/api/templates/pens', []);
    await fulfillJson(app.page, '**/api/layer-standards**', []);

    await app.page.goto(`${projectScreen.route}?entityId=project-1&projectId=project-1`);
    await app.page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.includes('project-workspace')) localStorage.removeItem(key);
      }
    });
    await app.page.reload();
    await expect(app.page.locator('[data-project-action-palette]').getByRole('button', { name: /^queue$/i })).toHaveCount(1);
    await expect(app.page.getByRole('treeitem', { name: /^queue$/i })).toBeVisible();

    await app.page.getByRole('treeitem', { name: /linked entities/i }).getByRole('button').click();
    await app.page.getByText('Library One', { exact: true }).first().click();
    await expect(app.page.locator('[data-workspace-pane] header')).toContainText('Library One');
    await expect(app.page.getByText('Cassette One', { exact: true }).first()).toBeVisible();
    await expect(app.page.locator('[data-workspace-pane] [data-tab-actions]').getByRole('button', { name: /^cassette$/i })).toHaveCount(0);
    await expect(app.page.locator('[data-workspace-pane]').getByRole('button', { name: /^cassette$/i })).toHaveCount(1);
    await expect(app.page.locator('[data-workspace-pane] .data-block dt').filter({ hasText: /^cassette$/i })).toHaveCount(0);
    await expect(app.page.locator('[data-workspace-pane]').getByText('Library summary marker', { exact: true })).toBeVisible();
    const collectionToolbar = app.page.locator('[data-workspace-pane] [data-collection-toolbar]');
    await expect(collectionToolbar.getByPlaceholder(/^search$/i)).toBeVisible();
    await collectionToolbar.getByPlaceholder(/^search$/i).fill('missing cassette');
    await expect(app.page.locator('[data-workspace-pane]').getByText('Cassette One', { exact: true })).toHaveCount(0);
    await collectionToolbar.getByPlaceholder(/^search$/i).fill('Cassette One');
    await expect(app.page.locator('[data-workspace-pane]').getByText('Cassette One', { exact: true }).first()).toBeVisible();

    await app.page.getByRole('button', { name: 'Cassette One' }).click();
    const paneHeader = app.page.locator('[data-workspace-pane] header');
    await expect(paneHeader.getByRole('tab', { name: 'Library One' })).toBeVisible();
    const cassetteTab = paneHeader.getByRole('tab', { name: 'Cassette One' });
    await expect(cassetteTab).toHaveAttribute('aria-selected', 'true');
    const libraryTreeItem = app.page.getByRole('treeitem', { name: /Library One/ });
    await libraryTreeItem.getByRole('button').first().click();
    await expect(libraryTreeItem.getByText('Cassette One', { exact: true })).toBeVisible();
    const explorerFits = await app.page.locator('.project-explorer-tree').evaluate(element => element.scrollWidth <= element.clientWidth);
    expect(explorerFits).toBe(true);
    await expect(cassetteTab.locator('..').locator('[data-entity-status="true"] .status-badge-glyph')).toHaveAttribute('aria-label', /active/i);
    await expect(app.page.locator('[data-workspace-pane] .entity-page [data-entity-page-header]')).toHaveCount(0);
    await expect(paneHeader.getByRole('button', { name: /^add$/i })).toBeVisible();

    await expect(paneHeader.getByRole('button', { name: /^edit$/i })).toHaveCount(0);
    await expect(app.page.locator('[data-workspace-pane] [data-tab-actions]').getByRole('button', { name: /^edit$/i })).toHaveCount(0);
    const cassetteNameInput = app.page.locator('[data-workspace-pane]').getByPlaceholder(/cassette name/i);
    await expect(cassetteNameInput).toBeVisible();
    await expect(app.page.locator('[data-cassette-designer-toolbar]')).toBeVisible();
    await cassetteNameInput.fill('Cassette One revised');
    await expect(app.page.locator('[data-cassette-designer-save-state]')).toContainText(/unsaved/i);
    await expect(cassetteTab.getByRole('img', { name: /unsaved/i })).toBeVisible();

    await app.page.getByRole('button', { name: /workspace layouts/i }).click();
    await app.page.getByPlaceholder(/layout name/i).fill('Review layout');
    await app.page.getByRole('button', { name: /^save layout$/i }).click();
    await expect(app.page.getByText('Review layout', { exact: true })).toBeVisible();
    await app.page.getByRole('button', { name: /^apply$/i }).click();
    await expect(cassetteTab).toHaveAttribute('aria-selected', 'true');

    await paneHeader.getByRole('button', { name: /^more$/i }).click();
    await app.page.getByRole('button', { name: /split right/i }).click();
    await expect(app.page.locator('[data-workspace-pane]')).toHaveCount(2);
    await cassetteTab.click();

    await app.page.reload();
    await expect(app.page.getByRole('tab', { name: 'Library One' })).toBeVisible();
    const restoredCassetteTab = app.page.getByRole('tab', { name: 'Cassette One' });
    await expect(restoredCassetteTab).toHaveAttribute('aria-selected', 'true');
    await restoredCassetteTab.locator('..').getByRole('button', { name: /^close$/i }).click();
    await expect(app.page.getByRole('tab', { name: 'Cassette One' })).toHaveCount(0);
    await expect(app.page.getByRole('tab', { name: 'Library One' })).toHaveAttribute('aria-selected', 'true');
    await paneHeader.getByRole('button', { name: /^more$/i }).click();
    await app.page.getByRole('button', { name: /reopen closed file/i }).click();
    await expect(app.page.getByRole('tab', { name: 'Cassette One' })).toBeVisible();
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
