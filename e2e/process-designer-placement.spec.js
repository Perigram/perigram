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

// Bands paint as hairline separators (LaneBands): each band's TOP is a
// bordered div; the vertical lattice of separators is the painted lane
// geometry.
async function bandSeparatorTops(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.vue-flow');
    if (!root) return [];
    return Array.from(root.querySelectorAll('.lane-band'))
      .map(el => Number((el.style.top || '').replace('px', '')))
      .filter(top => Number.isFinite(top))
      .sort((left, right) => left - right);
  });
}

test('palette add places at the viewport center and lanes wrap their cards', async ({ app }, testInfo) => {
  test.setTimeout(120_000);
  await app.installPlugins(['tech-drawing', 'facade']);
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

  // the painted lane lattice wraps the cards: separators exist, every
  // card sits inside the lattice (not above the stack), and the cards
  // seat near the top of their lane (the hug) rather than floating free
  const tops = await bandSeparatorTops(app.page);
  expect(tops.length).toBeGreaterThan(1);
  const yOf = transform => Number(transform.match(/translate\((\d+)px,\s*(\d+)px\)/)?.[2]);
  const lastTop = tops[tops.length - 1];
  for (const transform of secondPlacement) {
    const y = yOf(transform);
    expect(y, `card y=${y} sits inside the lane lattice (tops: ${tops.join(',')})`).toBeGreaterThanOrEqual(tops[0]);
    expect(y - lastTop, `card seats in the bottom lane near its top (y=${y}, lane top=${lastTop})`).toBeGreaterThanOrEqual(20);
    expect(y - lastTop).toBeLessThan(400);
  }

  // a drop into a lane is accepted: drag the first card into the top
  // lane — it seats inside that lane (top inset), everything else stays
  const card = app.page.locator('.vue-flow__node').first();
  const box = await card.boundingBox();
  const laneSeparator = await app.page.locator('.vue-flow .lane-band').first().boundingBox();
  // drag by the card header: the selected card's inline editor overlays
  // the body and swallows pointer events
  await app.page.mouse.move(box.x + 30, box.y + 12);
  await app.page.mouse.down();
  await app.page.mouse.move(box.x + 180, laneSeparator.y + 30, { steps: 15 });
  await app.page.mouse.up();
  await app.page.waitForTimeout(1500);
  const afterDrop = await nodeTransforms(app.page);
  expect(afterDrop.length).toBe(2);
  const droppedY = yOf(afterDrop.find(transform => transform !== firstPlacement[0]) ?? afterDrop[0]);
  expect(droppedY, `dropped card seats inside the top lane (y=${droppedY}, lane top=${tops[0]})`).toBeGreaterThanOrEqual(tops[0] + 20);
  expect(droppedY).toBeLessThan(tops[1]);

  // the lane facts persist with the draft: save and read the active
  // definition's graph back
  await app.page.getByRole('button', { name: /^save$/i }).first().click();
  await app.page.waitForTimeout(1800);
  const loaded = await app.request.get('/api/process-definitions/active');
  expect(loaded.ok(), await loaded.text()).toBeTruthy();
  const definition = await loaded.json();
  const droppedX = Number(afterDrop[0].match(/translate\((\d+)px/)?.[1] || 0);
  const laneFactNode = (definition.data.graph?.nodes || []).find(node => (
    Math.abs((node.position?.x || 0) - droppedX) < 5 && node.data?.laneY !== undefined
  ));
  expect(laneFactNode, 'the dropped card persists its lane membership and offset').toBeTruthy();
  expect(laneFactNode.data.lane).toBeTruthy();
  expect(laneFactNode.data.laneY).toBeGreaterThanOrEqual(0);

  await testInfo.attach('palette-placement.json', {
    body: JSON.stringify({ first: firstPlacement, second: secondPlacement, afterDrop, bandTops: tops, savedLaneFacts: { lane: laneFactNode.data.lane, laneY: laneFactNode.data.laneY } }, null, 2),
    contentType: 'application/json'
  });
  await app.expectCleanRuntime();
});
