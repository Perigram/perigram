import { test, expect } from './fixtures.js';

// The home sidebar's communication contract: one PanelMenu whose first
// entries are the sibling Chats and Calls — Chats a plain entry opening
// the chats page, Calls always present, toggling a popup flyout that
// lists every ringable conversation and carrying active call rooms as
// flat rows (nothing when no room is active — the entry then has no
// expandable affordance at all).
const ROOM = { room: 'call:direct:e2e-user-a:e2e-user-b', kind: 'direct', participants: 2 };
const CONVERSATIONS = {
  data: [
    { conversationKey: 'direct:e2e-user-a|e2e-user-b', conversationKind: 'direct', participant: { identity: { name: 'E2E Peer' } } },
    { conversationKey: 'group:e2e-group', conversationKind: 'group', groupName: 'E2E Group' }
  ]
};

function rootPanel(page, text) {
  return page.locator('.p-panelmenu-root-list > .p-panelmenu-panel').filter({
    has: page.locator('.p-panelmenu-header', { hasText: text })
  });
}

async function bootHome(app, { rooms = [] } = {}) {
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette'] });
  await app.page.route('**/api/instances/cassette**', route => route.fulfill({ json: [] }));
  await app.page.route('**/api/support/conversations**', route => route.fulfill({ json: CONVERSATIONS }));
  await app.page.route('**/api/livekit/active-rooms', route => route.fulfill({ json: rooms }));
  const home = (manifest.screens || []).find(screen => screen.template === 'home');
  expect(home?.route, 'Expected a compiled home screen').toBeTruthy();
  await app.gotoClient(home.route);
}

test.describe('home sidebar communication entries', () => {
  test('Chats and Calls are sibling root entries; active rooms are Calls rows', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [ROOM] });

    const chats = rootPanel(app.page, 'Chats');
    const calls = rootPanel(app.page, 'Calls');
    await expect(chats.locator('.p-panelmenu-header')).toBeVisible();
    await expect(chats.locator('.p-panelmenu-item')).toHaveCount(0);
    await expect(calls.locator('.p-panelmenu-header')).toBeVisible();
    // The first room auto-expands Calls: the row is visible without a click.
    await expect(calls.locator('.p-panelmenu-header')).toHaveAttribute('aria-expanded', 'true');
    const row = calls.locator('.p-panelmenu-item', { hasText: 'Ongoing call' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('(2)');
  });

  test('the Calls entry opens a flyout listing every ringable conversation', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [ROOM] });

    await rootPanel(app.page, 'Calls').locator('.p-panelmenu-header').click();
    const flyout = app.page.locator('.p-tieredmenu-overlay')
      .filter({ has: app.page.locator('.p-tieredmenu-item-label', { hasText: 'E2E Peer' }) });
    await expect(flyout).toBeVisible();
    await expect(flyout.locator('.p-tieredmenu-item-label', { hasText: 'E2E Group' })).toBeVisible();
  });

  test('no active rooms: Calls stays a plain flyout entry, nothing expands', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [] });

    const calls = rootPanel(app.page, 'Calls');
    await expect(calls.locator('.p-panelmenu-header')).toBeVisible();
    await expect(calls.locator('.p-panelmenu-item')).toHaveCount(0);
    await expect(calls.locator('.p-panelmenu-submenu-icon')).toHaveCount(0);
    await calls.locator('.p-panelmenu-header').click();
    await expect(app.page.locator('.p-tieredmenu-overlay')
      .filter({ has: app.page.locator('.p-tieredmenu-item-label', { hasText: 'E2E Peer' }) })).toBeVisible();
  });
});
