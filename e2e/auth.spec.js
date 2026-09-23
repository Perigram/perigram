import { test, expect } from './fixtures.js';

test.describe('authenticated app shell', () => {
  test('loads the generated home screen with a seeded session', async ({ app }) => {
    const me = await app.request.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();

    await app.gotoClient('/screens');
    await app.page.waitForLoadState('load');
    // The generated-screens IA opens on the process home surface — the
    // static /projects hub is gone by design.
    await expect(app.page).toHaveURL(/\/screens/);
    await expect(app.page.locator('body')).toContainText(/perigram|home|process|organization/i);
    await app.expectCleanRuntime();
  });
});
