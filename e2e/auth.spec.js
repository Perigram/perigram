import { test, expect } from './fixtures.js';

test.describe('authenticated app shell', () => {
  test('loads the generated home screen with a seeded session', async ({ app }) => {
    const me = await app.request.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();

    await app.gotoClient('/screens');
    await app.page.waitForLoadState('load');
    // The generated-screens IA opens on the process home surface — the
    // static /projects hub is gone by design. Home serves at the stable
    // shell route '/home' (the screens route's alias), and stale
    // /screens/home* URLs replace to it.
    await expect(app.page).toHaveURL(/\/home/);
    await expect(app.page.locator('body')).toContainText(/perigram|home|process|organization/i);
    // The home workspace owns the desktop viewport at /home: the old app
    // menubar (the sticky breadcrumb header of the standard app chrome)
    // stays hidden — the workspace sidebar carries brand and user
    // controls instead.
    await expect(app.page.locator('header.sticky')).toHaveCount(0);
    await app.expectCleanRuntime();
  });
});
