import { test, expect } from './fixtures.js';

// The home sidebar's communication contract: one PanelMenu whose first
// panel is communication — the Chats header opens the chats page, active
// call rooms render as flat rows (nothing when no room is active), and the
// Calls row is always present, opening a popup flyout that lists every
// ringable conversation.
const ROOM = { room: 'call:direct:e2e-user-a:e2e-user-b', kind: 'direct', participants: 2 };
const CONVERSATIONS = {
  data: [
    { conversationKey: 'direct:e2e-user-a|e2e-user-b', conversationKind: 'direct', participant: { identity: { name: 'E2E Peer' } } },
    { conversationKey: 'group:e2e-group', conversationKind: 'group', groupName: 'E2E Group' }
  ]
};

function communicationPanel(page) {
  return page.locator('.p-panelmenu-panel').filter({
    has: page.locator('.p-panelmenu-header', { hasText: 'Chats' })
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

test.describe('home sidebar communication panel', () => {
  test('active rooms are flat rows beside the always-present Calls row', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [ROOM] });

    const panel = communicationPanel(app.page);
    await expect(panel.locator('.p-panelmenu-header')).toHaveAttribute('aria-expanded', 'true');
    const row = panel.locator('.p-panelmenu-item', { hasText: 'Ongoing call' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('(2)');
    await expect(panel.locator('.p-panelmenu-item', { hasText: 'Calls' })).toBeVisible();
  });

  test('the Calls row opens a flyout listing every ringable conversation', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [ROOM] });

    await communicationPanel(app.page).locator('.p-panelmenu-item', { hasText: 'Calls' }).click();
    const flyout = app.page.locator('.p-tieredmenu-overlay')
      .filter({ has: app.page.locator('.p-tieredmenu-item-label', { hasText: 'E2E Peer' }) });
    await expect(flyout).toBeVisible();
    await expect(flyout.locator('.p-tieredmenu-item-label', { hasText: 'E2E Group' })).toBeVisible();
  });

  test('no active rooms: no room rows, Calls row and flyout stay present', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [] });

    const panel = communicationPanel(app.page);
    await expect(panel.locator('.p-panelmenu-item', { hasText: 'Ongoing call' })).toHaveCount(0);
    const calls = panel.locator('.p-panelmenu-item', { hasText: 'Calls' });
    await expect(calls).toBeVisible();
    await calls.click();
    await expect(app.page.locator('.p-tieredmenu-overlay')
      .filter({ has: app.page.locator('.p-tieredmenu-item-label', { hasText: 'E2E Peer' }) })).toBeVisible();
  });
});
