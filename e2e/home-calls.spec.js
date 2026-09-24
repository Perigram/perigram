import { test, expect } from './fixtures.js';

// The home sidebar's original communication contract, restored: the
// CommunicationMenu TieredMenu (Chats; Calls opening a flyout listing every
// ringable conversation) always present, plus ongoing rooms as persistent
// rows beneath it — and nothing room-shaped when no room is active. The
// flyout opens on click: PrimeVue TieredMenu opens submenus on hover only
// after the menu is dirty, so click is the real interaction.
const ROOM = { room: 'call:direct:e2e-user-a:e2e-user-b', kind: 'direct', participants: 2 };
const CONVERSATIONS = {
  data: [
    { conversationKey: 'direct:e2e-user-a|e2e-user-b', conversationKind: 'direct', participant: { identity: { name: 'E2E Peer' } } },
    { conversationKey: 'group:e2e-group', conversationKind: 'group', groupName: 'E2E Group' }
  ]
};

async function bootHome(app, { rooms = [] } = {}) {
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette'] });
  await app.page.route('**/api/instances/cassette**', route => route.fulfill({ json: [] }));
  await app.page.route('**/api/support/conversations**', route => route.fulfill({ json: CONVERSATIONS }));
  await app.page.route('**/api/livekit/active-rooms', route => route.fulfill({ json: rooms }));
  const home = (manifest.screens || []).find(screen => screen.template === 'home');
  expect(home?.route, 'Expected a compiled home screen').toBeTruthy();
  await app.gotoClient(home.route);
}

function callsItem(page) {
  return page.locator('.p-tieredmenu-item', { hasText: 'Calls' });
}

test.describe('home sidebar communication menu', () => {
  test('ongoing rooms render as persistent rows under the menu', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [ROOM] });

    const section = app.page.locator('[data-active-calls]');
    await expect(section).toBeVisible();
    const row = section.locator('button', { hasText: 'Ongoing call' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('2');
    await expect(callsItem(app.page)).toBeVisible();
  });

  test('Calls opens a flyout listing every ringable conversation', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [ROOM] });

    const item = callsItem(app.page);
    await item.click();
    const flyout = app.page.locator('.p-tieredmenu-submenu')
      .filter({ has: app.page.locator('.p-tieredmenu-item-label', { hasText: 'E2E Peer' }) });
    await expect(flyout).toBeVisible();
    await expect(flyout.locator('.p-tieredmenu-item-label', { hasText: 'E2E Group' })).toBeVisible();
  });

  test('no active rooms: no rows, menu and Calls flyout stay present', async ({ app }) => {
    test.setTimeout(120_000);
    await bootHome(app, { rooms: [] });

    await expect(app.page.locator('[data-active-calls]')).toHaveCount(0);
    const item = callsItem(app.page);
    await expect(item).toBeVisible();
    await item.click();
    await expect(app.page.locator('.p-tieredmenu-submenu')
      .filter({ has: app.page.locator('.p-tieredmenu-item-label', { hasText: 'E2E Peer' }) })).toBeVisible();
  });
});
