import { test } from './fixtures.js';
import { expect } from '@playwright/test';

// Placement regression guard (contract: components/process-designer README
// "Canvas behavior and diagnostics" + "Lanes"): a palette add lands at the
// nearest unoccupied grid position around the visible viewport center and
// NOTHING auto-places it afterwards — lane arrangement is explicit
// (lane-changing drop, Tidy), so neither the new node nor the existing
// population may move on add.
async function nodeTransforms(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.vue-flow__node'))
    .map(el => (el.getAttribute('style') || '').match(/translate\([^)]*\)/)?.[0] || ''));
}

test('palette add places at the viewport center and moves nothing', async ({ app }, testInfo) => {
  test.setTimeout(120_000);
  await app.seedSpeciesProcess({ types: ['cassette'] });
  await app.gotoClient('/organization/process');
  await expect(app.page).toHaveURL(/organization\/process/);
  await expect(app.page.locator('.process-designer-canvas, [data-vue-flow-container], .vue-flow').first()).toBeVisible({ timeout: 20_000 });

  // first add: the card appears once, inside the visible viewport span
  const paletteLiteral = app.page.getByRole('button', { name: 'Literal', exact: true });
  await paletteLiteral.click();
  await app.page.waitForTimeout(800);
  const firstPlacement = await nodeTransforms(app.page);
  expect(firstPlacement.length).toBe(1);
  const firstCoordinates = firstPlacement[0].match(/translate\((\d+)px,\s*(\d+)px\)/);
  expect(firstCoordinates, `node style carries a translate position: ${firstPlacement[0]}`).toBeTruthy();
  const viewport = app.page.viewportSize();
  expect(Number(firstCoordinates[1])).toBeGreaterThan(0);
  expect(Number(firstCoordinates[1])).toBeLessThan(viewport?.width || 1280);
  expect(Number(firstCoordinates[2])).toBeGreaterThan(0);
  expect(Number(firstCoordinates[2])).toBeLessThan(viewport?.height || 720);

  // the settle-free contract: re-reading after every deferred pass moves nothing
  await app.page.waitForTimeout(1200);
  expect(await nodeTransforms(app.page)).toEqual(firstPlacement);

  // second add: the existing card keeps its authored position
  await paletteLiteral.click();
  await app.page.waitForTimeout(1200);
  const secondPlacement = await nodeTransforms(app.page);
  expect(secondPlacement.length).toBe(2);
  expect(secondPlacement).toContain(firstPlacement[0]);
  // the two cards never stack on one spot
  expect(secondPlacement[0]).not.toBe(secondPlacement[1]);

  await testInfo.attach('palette-placement.json', {
    body: JSON.stringify({ first: firstPlacement, second: secondPlacement }, null, 2),
    contentType: 'application/json'
  });
  await app.expectCleanRuntime();
});
