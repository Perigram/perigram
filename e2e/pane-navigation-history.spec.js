import { test, expect } from './fixtures.js';

// Pane navigation history: in-place tab replacements (list -> record,
// workspace pages) keep a per-pane history, the pane header renders its
// Back control while that history holds a resolvable entry, and Back
// restores the replaced content. A new tab opened onto a selected empty
// placeholder consumes the placeholder.
test.describe('home workspace pane navigation', () => {
  test('back in the pane header walks in-place tab replacements', async ({ app }) => {
    test.setTimeout(120_000);
    await app.declareType({
      id: 'e2e-doc',
      name: 'E2E Doc',
      class: 'item',
      fields: { name: { base: 'string', identifier: true } },
      states: { main: { initial: 'new', values: ['new'], terminal: ['new'] } }
    });
    const { manifest } = await app.seedSpeciesProcess({
      types: ['e2e-doc'],
      via: { 'e2e-doc': 'genericCreate' }
    });
    const list = (manifest.screens || []).find(screen => screen.typeId === 'e2e-doc' && screen.template === 'typeList');
    expect(list?.screenKey, 'Expected a compiled list screen').toBeTruthy();

    const doc = { _id: 'doc-1', type: 'e2e-doc', name: 'History Doc One', state: 'new' };
    await app.page.route('**/api/instances/e2e-doc**', route => route.fulfill({ json: [doc] }));
    await app.page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));

    await app.gotoClient('/home');
    await app.page.waitForLoadState('load');

    // Open the type's list screen as a pane tab from the sidebar.
    await app.page.locator('.p-panelmenu-header', { hasText: 'E2E Doc' }).click({ position: { x: 80, y: 10 } });
    const paneTabs = app.page.locator('[data-home-workspace] .dv-tab');
    await expect(paneTabs.filter({ hasText: 'E2E Doc' })).toBeVisible();
    // Navigation stays discoverable: Back renders disabled until the
    // pane has history.
    await expect(app.page.locator('[data-testid="pane-back"]')).toBeVisible();
    await expect(app.page.locator('[data-testid="pane-back"]')).toBeDisabled();

    // The collection identity opens the record as the pane's selected
    // tab in place — the list is replaced.
    await app.page.locator('[data-home-workspace] button, [data-home-workspace] a', { hasText: 'History Doc One' }).first().click();
    await expect(paneTabs.filter({ hasText: 'History Doc One' })).toBeVisible();
    await expect(paneTabs.filter({ hasText: 'E2E Doc' })).toHaveCount(0);

    // Back appears with the replaced list behind it and restores it.
    await expect(app.page.locator('[data-testid="pane-back"]')).toBeEnabled();
    await app.page.locator('[data-testid="pane-back"]').click();
    await expect(paneTabs.filter({ hasText: 'E2E Doc' })).toBeVisible();
    await expect(app.page.locator('[data-testid="pane-back"]')).toBeDisabled();
  });

  test('a new tab consumes the selected empty placeholder', async ({ app }) => {
    test.setTimeout(120_000);
    await app.declareType({
      id: 'e2e-doc2',
      name: 'E2E Doc Two',
      class: 'item',
      fields: { name: { base: 'string', identifier: true } },
      states: { main: { initial: 'new', values: ['new'], terminal: ['new'] } }
    });
    const { manifest } = await app.seedSpeciesProcess({
      types: ['e2e-doc2'],
      via: { 'e2e-doc2': 'genericCreate' }
    });
    await app.page.route('**/api/instances/e2e-doc2**', route => route.fulfill({ json: [] }));
    const home = (manifest.screens || []).find(screen => screen.template === 'home');
    await app.gotoClient(home?.route || '/home');
    await app.page.waitForLoadState('load');

    // A fresh pane's empty placeholder exists to be filled: opening the
    // chats page (the sidebar's first communication entry, locale
    // independent by position) takes it over instead of appending beside
    // a dead placeholder tab.
    await app.page.locator('.p-panelmenu-header').first().click({ position: { x: 40, y: 10 } });
    const paneTabs = app.page.locator('[data-home-workspace] .dv-tab');
    await expect(paneTabs).toHaveCount(1, { timeout: 10_000 });
  });

  test('the open tab and its layout survive a reload', async ({ app }) => {
    test.setTimeout(120_000);
    await app.page.route('**/api/instances/**', route => route.fulfill({ json: [] }));
    await app.gotoClient('/home');
    await app.page.waitForLoadState('load');
    const paneTabs = app.page.locator('[data-home-workspace] .dv-tab');
    await app.page.locator('.p-panelmenu-header').first().click({ position: { x: 40, y: 10 } });
    await expect(paneTabs).toHaveCount(1, { timeout: 10_000 });
    const label = (await paneTabs.first().innerText()).trim();

    await app.page.reload();
    await app.page.waitForLoadState('load');
    await app.page.locator('[data-home-workspace]').waitFor({ timeout: 15_000 });
    await expect(paneTabs).toHaveCount(1, { timeout: 10_000 });
    expect((await paneTabs.first().innerText()).trim()).toBe(label);
  });
});
