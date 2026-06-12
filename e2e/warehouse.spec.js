import { test, expect } from './fixtures.js';

test.describe('warehouse management', () => {
  test('opens warehouse hub without requesting workflow actions for warehouses', async ({ app }) => {
    const actionResponses = [];
    app.page.on('response', response => {
      if (response.url().includes('/api/status/actions?entityType=warehouse')) {
        actionResponses.push(response.status());
      }
    });

    await app.page.goto('/warehouses');
    await expect(app.page).toHaveURL(/\/warehouses$/);
    await expect(app.page.locator('body')).toContainText(/warehouse|склад/i);

    expect(actionResponses).toEqual([]);
    await app.expectCleanRuntime();
  });
});
