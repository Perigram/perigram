import { test, expect } from './fixtures.js';

// The home screen is the default screen (pages/README.md, Public Entry):
// an organization whose active definition compiles to no screens — the
// bootstrap empty process every new organization starts with — still
// enters the home workspace with its definition-independent surfaces,
// unknown screen keys fall back to it, and no route dead-ends on a
// "screen unavailable" error surface.
test.describe('default home screen', () => {
  test('entry lands on the home workspace when the active process has no screens', async ({ app }) => {
    const me = await app.request.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();
    const manifest = await me.json();
    // Scenario guard: active process, zero operational screens (the
    // bootstrap shape — this spec must not silently pass against an org
    // whose process authored real screens).
    expect(manifest.process?.active).toBe(true);
    expect((manifest.screens || []).filter(screen => String(screen.route || '').startsWith('/screens/'))).toEqual([]);

    await app.page.goto('/');
    await app.page.waitForLoadState('load');
    await expect(app.page).toHaveURL(/\/screens\/home$/);
    await expect(app.page.locator('[data-home-workspace]')).toBeVisible();
    // Definition-independent surfaces stay reachable: the communication
    // entries render in the sidebar.
    await expect(app.page.locator('[data-home-workspace]')).toContainText('Chats');
    await expect(app.page.locator('body')).not.toContainText('Screen is not available');
    await app.expectCleanRuntime();
  });

  test('unknown screen keys render the home workspace, not an error surface', async ({ app }) => {
    await app.gotoClient('/screens/auto_no_such_type');
    await expect(app.page.locator('[data-home-workspace]')).toBeVisible();
    await expect(app.page.locator('body')).not.toContainText('Screen is not available');
    await app.expectCleanRuntime();
  });

  test('the bare /screens route redirects to the default home route', async ({ app }) => {
    await app.gotoClient('/screens');
    await expect(app.page).toHaveURL(/\/screens\/home$/);
    await expect(app.page.locator('[data-home-workspace]')).toBeVisible();
    await app.expectCleanRuntime();
  });
});
