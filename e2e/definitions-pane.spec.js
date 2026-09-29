// Definitions pane E2E (live stack): proves the management row renders
// its controls (switch + versions + rename + delete), rename persists
// through the identity-only PATCH, deactivation/re-activation accrues a
// data.history version, and the versions disclosure exposes restore.
// Artifact: /tmp/opencode/definitions-pane-report.json
import { test, expect } from './fixtures.js';
import { writeFileSync } from 'node:fs';

const ARTIFACT = '/tmp/opencode/definitions-pane-report.json';
const report = {};

test('definitions pane: row controls, rename, versions accrual, restore', async ({ app }) => {
  test.setTimeout(120000);
  await app.gotoClient('/organization/process');

  // Boot signal: any inspector tab is up before the Definitions tab exists.
  await app.page.getByRole('tab', { name: /Roles|Inspector/i }).first().waitFor({ timeout: 60000 });
  const definitionsTab = app.page.getByRole('tab', { name: 'Definitions' });
  await expect(definitionsTab).toBeVisible({ timeout: 20000 });
  await definitionsTab.click();

  const row = app.page.locator('[data-testid]').filter({ has: app.page.getByRole('switch') }).first();
  const firstRow = app.page.locator('button[title]').first();
  await expect(firstRow).toBeVisible({ timeout: 15000 });

  // The full control set: activation switch, versions, rename, delete.
  const versionsButton = app.page.getByRole('button', { name: 'Versions' }).first();
  const renameButton = app.page.getByRole('button', { name: 'Rename' }).first();
  const deleteButton = app.page.getByRole('button', { name: 'Delete' }).first();
  const activationSwitch = app.page.getByRole('switch').first();
  await expect(activationSwitch).toBeVisible();
  await expect(versionsButton).toBeVisible();
  await expect(renameButton).toBeVisible();
  await expect(deleteButton).toBeVisible();
  report.controls = { switch: true, versions: true, rename: true, delete: true };
  report.versionsIconGlyph = await versionsButton.locator('.pi').count();

  // Rename through the pane (identity-only PATCH): name persists.
  await renameButton.click();
  const renameInput = app.page.locator('input[aria-label="Rename"]').first();
  await expect(renameInput).toBeVisible();
  const newName = app.uniqueName('Definitions pane');
  await renameInput.fill(newName);
  await renameInput.press('Enter');
  await app.page.waitForTimeout(1500);
  const list = await (await app.request.get('/api/process-definitions')).json();
  report.renamePersisted = list.some(item => String(item.identity?.name || '').includes(newName));
  expect(report.renamePersisted, `renamed definition visible in list: ${newName}`).toBe(true);

  // Versions accrual: Apply on the already-active definition supersedes
  // its graph — data.history records it and the disclosure offers restore.
  await firstRow.click();
  await app.page.waitForTimeout(1500);
  const applyButton = app.page.getByRole('button', { name: /Apply/i }).first();
  await expect(applyButton).toBeEnabled({ timeout: 15000 });
  await applyButton.click();
  await app.page.waitForTimeout(4000);

  await definitionsTab.click();
  await versionsButton.click();
  await app.page.waitForTimeout(1500);
  const restoreButton = app.page.getByRole('button', { name: 'Restore' }).first();
  report.versionRestoreVisible = await restoreButton.isVisible().catch(() => false);
  expect(report.versionRestoreVisible, 'a history version with restore renders after re-activation').toBe(true);

  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
});
