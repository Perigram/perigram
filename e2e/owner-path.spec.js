// Reproduce the owner's path: land on /home, open the process designer
// from the workspace, screenshot the Definitions pane + toolbar.
import { test, expect } from './fixtures.js';
import { writeFileSync } from 'node:fs';

const ART = '/tmp/opencode/owner-path-report.json';
const report = {};

test('owner path: home -> process designer', async ({ app }) => {
  test.setTimeout(180000);
  await app.page.goto('/');
  await app.page.waitForLoadState('load');
  await app.page.waitForTimeout(4000);
  await app.page.screenshot({ path: '/tmp/opencode/shot-home.png', fullPage: false });

  // Find anything in the home workspace that opens the designer.
  const candidates = [
    app.page.getByText(/process|designer/i).first(),
    app.page.locator('a[href*="process"]').first(),
    app.page.getByRole('link', { name: /process/i }).first()
  ];
  let opened = false;
  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: 5000 }).catch(() => {});
      await app.page.waitForTimeout(3000);
      if (app.page.url().includes('process')) { opened = true; break; }
      await app.page.goBack().catch(() => {});
    }
  }
  report.openedFromHome = opened;
  report.urlAfterHomeClicks = app.page.url();
  if (!opened) {
    // Direct client navigation as the fallback, like the e2e fixtures do.
    await app.gotoClient('/organization/process');
  }
  await app.page.waitForTimeout(3000);
  await app.page.screenshot({ path: '/tmp/opencode/shot-designer.png', fullPage: false });

  const definitionsTab = app.page.getByRole('tab', { name: 'Definitions' });
  report.definitionsTabVisible = await definitionsTab.isVisible().catch(() => false);
  if (report.definitionsTabVisible) {
    await definitionsTab.click();
    await app.page.waitForTimeout(1000);
    await app.page.screenshot({ path: '/tmp/opencode/shot-definitions.png', fullPage: false });
    report.clockButton = await app.page.getByRole('button', { name: 'Versions' }).first().isVisible().catch(() => false);
    report.applyEnabled = await app.page.getByRole('button', { name: /Apply/i }).first().isEnabled().catch(() => false);
  }
  writeFileSync(ART, JSON.stringify(report, null, 2));
  console.log('OWNER PATH REPORT', JSON.stringify(report));
});
