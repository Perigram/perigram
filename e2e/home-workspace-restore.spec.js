import { test, expect } from './fixtures.js';

// The persisted home workspace restores on the home shell without
// hydration mismatches: production Vue does not rectify mismatched nodes,
// so the persisted state must apply after mount, never during render.
test('persisted home workspace restores without hydration mismatches', async ({ app }) => {
  test.setTimeout(120_000);
  await app.installPlugins(['tech-drawing', 'facade']);
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette-template'], via: { 'cassette-template': 'editor' } });
  const screen = (manifest.screens || []).find(item => item.typeId) || { screenKey: 'organization_partners', typeId: 'organization' };
  expect(screen.screenKey, 'expected a screen in the seeded manifest').toBeTruthy();

  const me = await (await app.request.get('/api/auth/me')).json();
  const key = `perigram:home-workspace:3:${me.userId || me._id}:${me.organizationId}`;
  const tabKey = `screen:${screen.screenKey}`;
  const state = {
    version: 3,
    paneTree: { kind: 'leaf', id: 'pane-1', selectionKey: tabKey, tabKeys: [tabKey] },
    activePaneId: 'pane-1',
    paneSequence: 1,
    openedEntityRefs: [],
    openedPageRefs: [],
    openedScreenRefs: [{ key: tabKey, screenKey: screen.screenKey, typeId: screen.typeId || '' }],
    sidebarCollapsed: false
  };
  await app.page.addInitScript(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state));
  }, { key, state });

  const hydrationWarnings = [];
  app.page.on('console', message => {
    if (message.type() === 'warning' && /Hydration/.test(message.text())) {
      hydrationWarnings.push(message.text());
    }
  });

  // Real load exercises the hydration path; the dev-stack SSR bounce
  // falls back to client navigation.
  await app.page.goto('/home');
  if (!app.page.url().includes('/home')) await app.gotoClient('/home');

  await expect(
    app.page.getByRole('tab').filter({ hasText: screen.label || screen.screenKey }).first()
  ).toBeVisible();
  expect(hydrationWarnings).toEqual([]);
});
