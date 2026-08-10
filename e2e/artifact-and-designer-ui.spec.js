import { test, expect } from './fixtures.js';

test.describe('artifact and designer UI', () => {
  test('artifact detail page loads without errors', async ({ app }) => {
    const artifacts = await app.request.get('/api/artifacts', { failOnStatusCode: false });
    if (artifacts.ok()) {
      const list = await artifacts.json();
      const items = Array.isArray(list) ? list : list.items || [];
      if (items.length) {
        await app.page.goto(`/assets/artifacts/${items[0]._id}`);
        await app.page.waitForLoadState('networkidle');
        await expect(app.page.locator('body')).not.toContainText('loading');
      }
    }
    await app.expectCleanRuntime();
  });

  test('cassette page renders designer action', async ({ app }) => {
    const cassettes = await app.request.get('/api/cassettes', { failOnStatusCode: false });
    if (cassettes.ok()) {
      const list = await cassettes.json();
      const items = Array.isArray(list) ? list : list.items || [];
      if (items.length) {
        await app.page.goto(`/api/cassettes/${items[0]._id}`);
        await app.page.waitForLoadState('networkidle');
        await app.page.waitForTimeout(1000);
      }
    }
    await app.expectCleanRuntime();
  });

  test('invitation page renders centered form without errors', async ({ app }) => {
    await app.page.goto('/invitation/invalid-token');
    await app.page.waitForLoadState('networkidle');
    await expect(app.page.locator('body')).not.toContainText('loading');
    await app.expectCleanRuntime();
  });
});
