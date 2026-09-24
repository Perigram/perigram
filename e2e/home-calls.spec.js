import { test, expect } from './fixtures.js';

// The home sidebar's communication panel: one chats entry whose only rows
// are the active call rooms. Rooms must be visible without manual
// expansion (the panel auto-expands when the first room exists, including
// rooms that arrive with the initial snapshot), and with no rooms the
// panel carries no rows and nothing renders expandable.
const ROOM = { room: 'call:direct:e2e-user-a:e2e-user-b', kind: 'direct', participants: 2 };

function communicationPanel(page) {
  return page.locator('.p-panelmenu-panel').filter({
    has: page.locator('.p-panelmenu-header', { hasText: 'Chats' })
  });
}

async function bootHome(app) {
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette'] });
  await app.page.route('**/api/instances/cassette**', route => route.fulfill({ json: [] }));
  const home = (manifest.screens || []).find(screen => screen.template === 'home');
  expect(home?.route, 'Expected a compiled home screen').toBeTruthy();
  await app.gotoClient(home.route);
}

test.describe('home sidebar communication panel', () => {
  test('active call rooms render as visible flat rows', async ({ app }) => {
    test.setTimeout(120_000);
    await app.page.route('**/api/livekit/active-rooms', route => route.fulfill({ json: [ROOM] }));
    await bootHome(app);

    const panel = communicationPanel(app.page);
    await expect(panel.locator('.p-panelmenu-header')).toBeVisible();
    // Auto-expanded: the rows are visible without any click.
    await expect(panel.locator('.p-panelmenu-header')).toHaveAttribute('aria-expanded', 'true');
    const row = panel.locator('.p-panelmenu-item', { hasText: 'Ongoing call' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('(2)');
    await expect(panel.locator('.p-panelmenu-item')).toHaveCount(1);
  });

  test('rooms arriving after boot expand the panel without a click', async ({ app }) => {
    test.setTimeout(120_000);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await app.page.route('**/api/livekit/active-rooms', async route => {
      await gate;
      await route.fulfill({ json: [ROOM] });
    });
    await bootHome(app);

    const panel = communicationPanel(app.page);
    await expect(panel.locator('.p-panelmenu-header')).toBeVisible();
    // The hanging snapshot keeps the panel a plain chats entry: no rows,
    // no expandable affordance.
    await expect(panel.locator('.p-panelmenu-item')).toHaveCount(0);
    await expect(panel.locator('.p-panelmenu-submenu-icon')).toHaveCount(0);

    release();
    const row = panel.locator('.p-panelmenu-item', { hasText: 'Ongoing call' });
    await expect(row).toBeVisible();
    await expect(panel.locator('.p-panelmenu-header')).toHaveAttribute('aria-expanded', 'true');
  });

  test('no active rooms: no rows and nothing expandable', async ({ app }) => {
    test.setTimeout(120_000);
    await app.page.route('**/api/livekit/active-rooms', route => route.fulfill({ json: [] }));
    await bootHome(app);

    const panel = communicationPanel(app.page);
    await expect(panel.locator('.p-panelmenu-header')).toBeVisible();
    await expect(panel.locator('.p-panelmenu-item')).toHaveCount(0);
    await expect(panel.locator('.p-panelmenu-submenu-icon')).toHaveCount(0);
  });
});
