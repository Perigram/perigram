import { test, expect } from './fixtures.js';

test.describe('authenticated app shell', () => {
  test('loads protected project navigation with a seeded session', async ({ app }) => {
    const me = await app.request.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();

    await app.page.goto('/screens');
    await expect(app.page).toHaveURL(/\/projects$/);
    await expect(app.page.locator('body')).toContainText(/project|проект/i);
    await app.expectCleanRuntime();
  });
});
