import { test, expect } from './fixtures.js';
import { writeFileSync } from 'node:fs';
import { fixtureSurfacePluginListing, FIXTURE_SURFACE_PLUGIN_ID } from '../test-tools/fixture-surface-plugin.js';

const OPERATOR_TOKEN = process.env.PLATFORM_OPERATOR_TOKEN || 'perigram-dev-operator';

// The upgrade consent surface (SPEC §Plugin marketplace: "upgrading is an
// explicit diff-plus-migration action"): a catalog version bump owes the
// installed row its delta affordance, the dialog its from → to preview,
// and the confirm its version pin — no transport outside the page.
// Regression probe for the owner report (2026-10-28) of a missing
// affordance. Artifacts: .playwright/plugins-upgrade.png and
// .playwright/plugins-upgrade.json.

test('the plugins page upgrades an install through its own affordance', async ({ app }) => {
  test.setTimeout(180_000);

  const v1 = fixtureSurfacePluginListing();
  const published = await app.request.post('/api/plugins/catalog', { headers: { 'x-operator-token': OPERATOR_TOKEN }, data: v1 });
  expect(published.ok(), await published.text()).toBeTruthy();
  await app.installPlugins([FIXTURE_SURFACE_PLUGIN_ID]);

  const v2 = { ...v1, version: '2' };
  const republished = await app.request.post('/api/plugins/catalog', { headers: { 'x-operator-token': OPERATOR_TOKEN }, data: v2 });
  expect(republished.ok(), await republished.text()).toBeTruthy();

  await app.gotoClient('/organization/plugins');
  const upgradableRow = app.page.locator('tbody tr', { hasText: 'Fixture Surface Plugin' })
    .filter({ has: app.page.locator('.pi-arrow-up') });
  await expect(upgradableRow.first(), 'the installed row shows the upgrade affordance on a version delta').toBeVisible({ timeout: 60_000 });

  await upgradableRow.first().locator('button:has(.pi-arrow-up)').click();
  const dialog = app.page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog).toContainText('1');
  await expect(dialog).toContainText('2');
  await dialog.locator('button:has(.pi-arrow-up)').click();

  await expect(upgradableRow, 'the delta affordance clears after the upgrade').toHaveCount(0, { timeout: 30_000 });
  const settledRow = app.page.locator('tbody tr', { hasText: 'Fixture Surface Plugin' }).first();
  await expect(settledRow).toContainText('2', { timeout: 30_000 });

  await app.page.screenshot({ path: '.playwright/plugins-upgrade.png', fullPage: true });
  writeFileSync('.playwright/plugins-upgrade.json', JSON.stringify({ pluginId: FIXTURE_SURFACE_PLUGIN_ID, upgradedTo: '2' }, null, 2));

  app.trackCleanup(async () => {
    const me = await (await app.request.get('/api/auth/me')).json();
    await app.request.delete(`/api/organizations/${me.organizationId}/plugins/${FIXTURE_SURFACE_PLUGIN_ID}`, { failOnStatusCode: false });
    await app.request.delete(`/api/plugins/catalog/${FIXTURE_SURFACE_PLUGIN_ID}`, { headers: { 'x-operator-token': OPERATOR_TOKEN }, failOnStatusCode: false });
  });
});
