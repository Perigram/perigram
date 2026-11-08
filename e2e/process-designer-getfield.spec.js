import { test } from './fixtures.js';
import { expect } from '@playwright/test';

// Get Field type contract (packages/processes README, cts.field): the
// output socket carries the declared field's type — a wired party source
// (Current user) yields string for fields.email — and the pre-fix
// machine-written `_id` default heals to the first declared row field,
// so no surface ever reports the untyped json base for a row-backed
// projection. Artifacts: screenshots under test-results/.
async function bootDesigner(app) {
  const { page } = app;
  await page.goto('/organization/process');
  await page.waitForLoadState('load');
  if (!/\/organization\/process/.test(page.url())) {
    await app.gotoClient('/organization/process');
    await page.waitForTimeout(2000);
  }
  await expect(page).toHaveURL(/process/);
  await expect(page.locator('.process-designer-canvas, .vue-flow').first()).toBeVisible({ timeout: 20000 });
  await page.keyboard.press('Escape');
}

async function fieldValueHandleAria(page) {
  const fieldNode = page.locator('.vue-flow__node', { hasText: 'Get field' }).first();
  await expect(fieldNode).toBeVisible({ timeout: 10000 });
  const handle = fieldNode.locator('.vue-flow__handle[data-handleid="data:value"]').first();
  return handle.getAttribute('aria-label');
}

test('wiring Current user into Get field types the output as the row field', async ({ app }) => {
  test.setTimeout(180_000);
  const { page } = app;
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.seedSpeciesProcess({ types: ['cassette-template'] });
  await bootDesigner(app);

  await page.getByRole('button', { name: /open/i }).first().click();
  const newDraft = page.getByRole('button', { name: /new draft/i }).first();
  await expect(newDraft).toBeVisible({ timeout: 5000 });
  await newDraft.click();
  await page.waitForTimeout(1500);

  const search = page.getByPlaceholder(/search|поиск|операци/i).first();
  await search.fill('Current user');
  await page.getByRole('button', { name: 'Current user', exact: true }).first().click();
  await page.waitForTimeout(800);
  await search.fill('Get field');
  await page.getByRole('button', { name: 'Get field', exact: true }).first().click();
  await page.waitForTimeout(800);

  const userNode = page.locator('.vue-flow__node', { hasText: 'Current user' }).first();
  const fieldNode = page.locator('.vue-flow__node', { hasText: 'Get field' }).first();
  const sourceHandle = userNode.locator('.vue-flow__handle[data-handleid="data:value"]').first();
  const targetHandle = fieldNode.locator('.vue-flow__handle[data-handleid="data:entity"]').first();
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1500);

  // SVG edge groups report hidden to Playwright's visibility heuristic;
  // assert existence by count instead.
  const wireCount = await page.locator('.vue-flow__edge[data-id]').count();
  expect(wireCount, 'the currentUser->getField wire must exist').toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/getfield-fresh-wire.png', fullPage: true });
  const aria = await fieldValueHandleAria(page);
  console.log('GETFIELD OUTPUT AFTER FRESH WIRE:', aria);
  expect(aria || '', 'wired get field output type').toContain('string');
  await app.expectCleanRuntime();
});

test('a persisted draft with the machine `_id` default heals to the row field', async ({ app }) => {
  test.setTimeout(180_000);
  const { page, request } = app;
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.seedSpeciesProcess({ types: ['cassette-template'] });

  const name = app.uniqueName('Get field poisoned');
  const draftResponse = await request.post('/api/process-definitions', {
    data: {
      name,
      data: {
        schemaVersion: 1,
        dataflowVersion: 4,
        graphProtocol: 5,
        roleGrants: {},
        producerOutputs: {},
        actions: {},
        services: {},
        sockets: {},
        stateDefinitions: {},
        valueInputs: {},
        screens: {},
        ctsTypes: {},
        graph: {
          nodes: [
            { id: 'who', type: 'processNode', position: { x: 100, y: 100 }, data: { refId: 'who' } },
            { id: 'email', type: 'processNode', position: { x: 400, y: 100 }, data: { refId: 'email' } },
            { id: 'staleId', type: 'processNode', position: { x: 400, y: 300 }, data: { refId: 'staleId' } }
          ],
          edges: []
        },
        processNodes: {
          who: { id: 'who', kind: 'source.currentUser' },
          // The pre-fix authoring artifacts this draft class heals: a
          // junk `field` default older writers persisted as a
          // stringified object, the machine `_id` path default, and the
          // stale json outputs snapshot — all on one record shaped like
          // the real reported draft.
          email: {
            id: 'email',
            kind: 'cts.field',
            typeId: 'user',
            path: 'fields.email',
            inputDefaults: { field: '[object Object]' },
            label: 'cts.field',
            outputs: [{ id: 'value', type: { base: 'json', nullable: true } }]
          },
          staleId: {
            id: 'staleId',
            kind: 'cts.field',
            typeId: 'user',
            path: '_id'
          }
        }
      }
    }
  });
  expect(draftResponse.ok(), await draftResponse.text()).toBeTruthy();
  const draft = await draftResponse.json();
  app.trackCleanup(async () => {
    await request.delete(`/api/process-definitions/${draft._id}`, { failOnStatusCode: false });
  });

  await bootDesigner(app);

  // open the seeded draft from the definitions tab
  await page.getByRole('tab', { name: /definitions/i }).click();
  await page.waitForTimeout(800);
  await page.getByRole('option', { name: new RegExp(name.slice(0, 30), 'i') }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/getfield-poisoned-load.png', fullPage: true });

  const aria = await fieldValueHandleAria(page);
  console.log('GETFIELD OUTPUT AFTER POISONED LOAD:', aria);
  expect(aria || '', 'healed get field output type').toContain('string');

  // second poisoned node (machine `_id` default): every Get Field card
  // on the canvas heals, not just the first
  const cards = page.locator('.vue-flow__node', { hasText: 'Get field' });
  await expect(cards.nth(1)).toBeVisible({ timeout: 10000 });
  const secondAria = await cards.nth(1).locator('.vue-flow__handle[data-handleid="data:value"]').first().getAttribute('aria-label');
  console.log('SECOND GETFIELD OUTPUT:', secondAria);
  expect(secondAria || '', 'second healed get field output type').not.toContain('json');
  await app.expectCleanRuntime();
});
