import { test } from './fixtures.js';
import { expect } from '@playwright/test';

// Lane container placement guard (contract: components/process-designer
// README "Canvas behavior and diagnostics" + "Lanes"): a palette add lands
// at the nearest unoccupied grid position around the visible viewport
// center, joins the lane under that position, no deferred pass moves it
// afterwards, later adds never move seated cards, and the painted lane
// bands wrap the cards that belong to them.
async function nodeTransforms(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.vue-flow__node'))
    .map(el => (el.getAttribute('style') || '').match(/translate\([^)]*\)/)?.[0] || ''));
}

async function paintedBands(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.vue-flow .-z-10');
    if (!root) return [];
    return Array.from(root.children)
      .map(el => ({
        top: Number((el.style.top || '').replace('px', '')) || 0,
        height: Number((el.style.height || '').replace('px', '')) || 0
      }))
      .filter(band => band.height > 0);
  });
}

test('palette add places at the viewport center and lanes wrap their cards', async ({ app }, testInfo) => {
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

  // the container contract: no deferred pass moves the seated card
  await app.page.waitForTimeout(1200);
  expect(await nodeTransforms(app.page)).toEqual(firstPlacement);

  // second add: the seated card keeps its position; the new card takes
  // the next free column
  await paletteLiteral.click();
  await app.page.waitForTimeout(1200);
  const secondPlacement = await nodeTransforms(app.page);
  expect(secondPlacement.length).toBe(2);
  expect(secondPlacement).toContain(firstPlacement[0]);
  expect(secondPlacement[0]).not.toBe(secondPlacement[1]);

  // the painted bands wrap the cards: some band contains each card, with
  // the card's top inside the band's padded interior
  const bands = await paintedBands(app.page);
  expect(bands.length).toBeGreaterThan(0);
  const yOf = transform => Number(transform.match(/translate\((\d+)px,\s*(\d+)px\)/)?.[2]);
  for (const transform of secondPlacement) {
    const y = yOf(transform);
    const wrapping = bands.find(band => y >= band.top && y + 96 <= band.top + band.height + 1);
    expect(wrapping, `a painted band wraps the card at y=${y} (bands: ${JSON.stringify(bands)})`).toBeTruthy();
  }

  await testInfo.attach('palette-placement.json', {
    body: JSON.stringify({ first: firstPlacement, second: secondPlacement, bands }, null, 2),
    contentType: 'application/json'
  });
  await app.expectCleanRuntime();
});
