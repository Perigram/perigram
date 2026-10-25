import { test, expect } from './fixtures.js';

// The home sidebar's communication contract, as specified: a PanelMenu
// with TWO entries — Chats (opens the chats page) and Calls (always
// present, toggles the suggestions flyout) — with active call rooms as
// rows under Calls only while rooms exist.
const ROOM = { room: 'call:direct:e2e-user-a:e2e-user-b', kind: 'direct', participants: 2 };
const CONVERSATIONS = {
  data: [
    { conversationKey: 'direct:e2e-user-a|e2e-user-b', conversationKind: 'direct', participant: { identity: { name: 'E2E Peer' } } },
    { conversationKey: 'group:e2e-group', conversationKind: 'group', groupName: 'E2E Group' }
  ]
};

function entry(page, text) {
  return page.locator('.p-panelmenu-panel').filter({
    has: page.locator('.p-panelmenu-header', { hasText: text })
  });
}

async function bootHome(app, { rooms = [] } = {}) {
  await app.installPlugins(['tech-drawing', 'facade']);
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette'] });
  await app.page.route('**/api/instances/cassette**', route => route.fulfill({ json: [] }));
  await app.page.route('**/api/support/conversations**', route => route.fulfill({ json: CONVERSATIONS }));
  await app.page.route('**/api/livekit/active-rooms', route => route.fulfill({ json: rooms }));
  const home = (manifest.screens || []).find(screen => screen.template === 'home');
  expect(home?.route, 'Expected a compiled home screen').toBeTruthy();
  await app.gotoClient(home.route);
}

test.describe('home sidebar communication entries', () => {
  test('two entries: Chats and Calls; active rooms under Calls', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [ROOM] });

    const chats = entry(app.page, 'Chats');
    const calls = entry(app.page, 'Calls');
    await expect(chats.locator('.p-panelmenu-header')).toBeVisible();
    await expect(chats.locator('.p-panelmenu-item')).toHaveCount(0);
    await expect(calls.locator('.p-panelmenu-header')).toBeVisible();
    // The first room auto-expands Calls: the row is visible without a click.
    await expect(calls.locator('.p-panelmenu-header')).toHaveAttribute('aria-expanded', 'true');
    const row = calls.locator('.p-panelmenu-item', { hasText: 'Ongoing call' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('(2)');
    await expect(calls.locator('.p-panelmenu-item')).toHaveCount(1);
  });

  test('the Calls entry opens a flyout listing every ringable conversation', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [ROOM] });

    await entry(app.page, 'Calls').locator('.p-panelmenu-header').click();
    const flyout = app.page.locator('.p-tieredmenu-overlay')
      .filter({ has: app.page.locator('.p-tieredmenu-item-label', { hasText: 'E2E Peer' }) });
    await expect(flyout).toBeVisible();
    await expect(flyout.locator('.p-tieredmenu-item-label', { hasText: 'E2E Group' })).toBeVisible();
  });

  test('no active rooms: Calls has no rows and nothing expands; flyout stays', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [] });

    const calls = entry(app.page, 'Calls');
    await expect(calls.locator('.p-panelmenu-item')).toHaveCount(0);
    await expect(calls.locator('.p-panelmenu-submenu-icon')).toHaveCount(0);
    await calls.locator('.p-panelmenu-header').click();
    await expect(app.page.locator('.p-tieredmenu-overlay')
      .filter({ has: app.page.locator('.p-tieredmenu-item-label', { hasText: 'E2E Peer' }) })).toBeVisible();
  });
});
