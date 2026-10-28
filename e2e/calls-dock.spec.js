import { test, expect } from './fixtures.js';
import { createHmac } from 'node:crypto';

// The real call-surface lifecycle against the local stack's LiveKit dev
// server: join a call tab with fake media, dispatch it to the floating
// window, dock it back to its tab, and switch tabs — the call stays
// seated in its tab and the floating window never pops on its own.

const ROOM = 'call:e2e:dock-test';

const b64url = value => Buffer.from(value).toString('base64url');
// Dev-plane LiveKit JWT (devkey/devsecret) — the token route mock rides
// the same keys the local server verifies.
function mintRoomToken(room) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: 'devkey',
    sub: 'e2e-dock-user',
    name: 'E2E Dock',
    exp: Math.floor(Date.now() / 1000) + 3600,
    video: { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true }
  }));
  const signature = createHmac('sha256', 'devsecret')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const CONVERSATIONS = {
  data: [
    { conversationKey: 'direct:e2e-dock-user|e2e-peer', conversationKind: 'direct', participant: { identity: { name: 'E2E Peer' } } }
  ]
};

async function bootHome(app) {
  await app.installPlugins(['tech-drawing', 'facade']);
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette-template'] });
  await app.page.route('**/api/instances/cassette-template**', route => route.fulfill({ json: [] }));
  await app.page.route('**/api/support/conversations**', route => route.fulfill({ json: CONVERSATIONS }));
  await app.page.route('**/api/livekit/active-rooms', route => route.fulfill({ json: [] }));
  await app.page.route('**/api/livekit/recordings', route => route.fulfill({ json: [] }));
  await app.page.route('**/api/livekit/invite', route => route.fulfill({
    json: { room: ROOM, conversationKey: CONVERSATIONS.data[0].conversationKey }
  }));
  await app.page.route('**/api/livekit/token', route => route.fulfill({
    json: { token: mintRoomToken(ROOM), url: 'ws://localhost:7880', room: ROOM, kind: 'direct' }
  }));
  const home = (manifest.screens || []).find(screen => screen.template === 'home');
  expect(home?.route, 'Expected a compiled home screen').toBeTruthy();
  await app.gotoClient(home.route);
}

async function startCallFromFlyout(app) {
  await app.page.locator('.p-panelmenu-header', { hasText: 'Calls' }).first().click();
  const flyout = app.page.locator('.p-tieredmenu-overlay')
    .filter({ has: app.page.locator('.p-tieredmenu-item-label', { hasText: 'E2E Peer' }) });
  await expect(flyout).toBeVisible();
  await flyout.locator('.p-tieredmenu-item-label', { hasText: 'E2E Peer' }).click();
}

async function joinFromPrejoin(app) {
  await app.page.getByRole('button', { name: 'Join call' }).click();
  // The connected dock's leave button is the join completion signal.
  await app.page.getByRole('button', { name: 'Leave' }).waitFor({ timeout: 20000 });
}

test('join a call tab, dispatch to floating, dock back, and keep the tab seated', async ({ app }) => {
  test.setTimeout(180_000);
  await bootHome(app);

  await startCallFromFlyout(app);
  await joinFromPrejoin(app);
  await expect(app.page.locator('[data-floating-call]')).toHaveCount(0);

  // Dispatch: the tab closes and the floating window carries the call.
  await app.page.getByRole('button', { name: 'Move call to floating window' }).click();
  await expect(app.page.locator('[data-floating-call]')).toBeVisible();
  // Exactly one live surface remains: the floating window's own pill.
  await expect(app.page.getByRole('button', { name: 'Leave' })).toHaveCount(1);
  await expect(app.page.locator('[data-floating-call]').getByRole('button', { name: 'Leave' })).toBeVisible();

  // Dock: the floating window closes and the call tab returns.
  await app.page.locator('[data-floating-call]')
    .getByRole('button', { name: 'Return call to workspace' }).click();
  await expect(app.page.locator('[data-floating-call]')).toHaveCount(0);
  await app.page.getByRole('button', { name: 'Leave' }).waitFor({ timeout: 20000 });

  // Tab switch: the call stays in its tab; the floating window stays
  // closed and the call panel re-renders on return.
  await app.page.locator('.p-panelmenu-header', { hasText: 'Chats' }).first().click();
  await expect(app.page.locator('[data-floating-call]')).toHaveCount(0);
  await app.page.locator('.p-tab', { hasText: 'Call' }).first().click();
  await app.page.getByRole('button', { name: 'Leave' }).waitFor({ timeout: 20000 });
  await expect(app.page.locator('[data-floating-call]')).toHaveCount(0);

  // Closing the call tab ends the call: session gone, no floating window.
  const callTab = app.page.locator('.p-tab', { hasText: 'Call' }).first();
  await callTab.locator('button').first().click();
  await expect(app.page.getByRole('button', { name: 'Leave' })).toHaveCount(0);
  await expect(app.page.locator('[data-floating-call]')).toHaveCount(0);
});
