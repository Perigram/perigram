import { test } from './fixtures.js';
import { expect } from '@playwright/test';

// Boot probe: the designer page must load without client errors, create a
// new definition from the dock, and save it. Reproduces the reported
// "can't create new definition / can't manage the stale one". The org is
// seeded with a species process first so the designer route resolves
// instead of redirecting to the generated home.
test('process designer boots, creates, and saves', async ({ app }) => {
  test.setTimeout(120_000);
  const { page } = app;
  await app.seedSpeciesProcess({ types: ['cassette'] });

  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  const failed = [];
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/api/')) {
      failed.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  await page.goto('/organization/process');
  await page.waitForLoadState('load');
  // The dev stack bounces authenticated deep links through `/`
  // server-side; continue client-side once the app boots.
  if (!/\/organization\/process/.test(page.url())) {
    await app.gotoClient('/organization/process');
    await page.waitForTimeout(2000);
  }
  await expect(page).toHaveURL(/process/);

  // the canvas surface renders
  await expect(page.locator('.process-designer-canvas, [data-vue-flow-container], .vue-flow').first()).toBeVisible({ timeout: 15000 });

  // open the process menu and create a new draft
  await page.getByRole('button', { name: /open/i }).first().click();
  const newDraft = page.getByRole('button', { name: /new draft/i }).first();
  await expect(newDraft).toBeVisible({ timeout: 5000 });
  await newDraft.click();
  await page.waitForTimeout(1500);

  // save it
  await page.getByRole('button', { name: /^save$/i }).first().click();
  await page.waitForTimeout(1500);

  const critical = errors.filter(message => !message.includes('favicon'));
  console.log('CLIENT ERRORS:', JSON.stringify(critical, null, 2));
  console.log('API FAILURES:', JSON.stringify(failed, null, 2));
  expect(critical, 'client errors during boot/create/save').toEqual([]);
  expect(failed, 'failed API calls during boot/create/save').toEqual([]);
  await app.expectCleanRuntime();
});
