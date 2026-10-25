import { test, expect } from './fixtures.js';

test.describe('invitation page', () => {
  test('renders centered form without errors', async ({ app }) => {
    await app.page.goto('/invitation/invalid-token');
    await app.page.waitForLoadState('load');
    await expect(app.page.locator('.p-message, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
  });
});
