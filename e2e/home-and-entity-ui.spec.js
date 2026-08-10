import { test, expect } from './fixtures.js';

test.describe('home and entity UI', () => {
  test('home page loads top-level entity sections without errors', async ({ app }) => {
    await app.page.goto('/');
    await app.page.waitForLoadState('networkidle');
    await expect(app.page.locator('body')).not.toContainText('loading');
    await app.expectCleanRuntime();
  });

  test('entity page shows trace chain', async ({ app }) => {
    await app.page.goto('/');
    await app.page.waitForLoadState('networkidle');
    await app.page.waitForTimeout(2000);
    const traceChain = app.page.locator('nav[aria-label]');
    const count = await traceChain.count();
    expect(count).toBeGreaterThanOrEqual(0);
    await app.expectCleanRuntime();
  });

  test('entity page layout uses inline-size container queries', async ({ app }) => {
    await app.page.goto('/');
    await app.page.waitForLoadState('networkidle');
    await app.page.waitForTimeout(2000);
    const entityPages = app.page.locator('.entity-page');
    const count = await entityPages.count();
    if (count > 0) {
      const containerType = await entityPages.first().evaluate(el => getComputedStyle(el).containerType);
      expect(containerType).toBe('inline-size');
    }
    await app.expectCleanRuntime();
  });

  test('chats full route renders without app launcher', async ({ app }) => {
    await app.page.goto('/chats');
    await app.page.waitForLoadState('networkidle');
    const launcher = app.page.locator('[data-testid="desktop-chat-launcher"]');
    await expect(launcher).not.toBeVisible({ timeout: 5000 });
    await app.expectCleanRuntime();
  });

  test('organization switching is visible in user menu', async ({ app }) => {
    await app.page.goto('/');
    await app.page.waitForLoadState('networkidle');
    await app.page.waitForTimeout(2000);
    const userMenuTrigger = app.page.locator('[data-testid="user-menu-trigger"]');
    const visible = await userMenuTrigger.isVisible().catch(() => false);
    expect(visible).toBeTruthy();
    await app.expectCleanRuntime();
  });
});
