import { test, expect } from './fixtures.js';

async function openGraphEditor(app, entity) {
  await app.gotoClient('/');
  await app.page.locator('[data-home-workspace]').first().waitFor({ state: 'visible' });
  await app.page.evaluate(graphEntity => {
    window.dispatchEvent(new CustomEvent('perigram:open-workspace-page', {
      detail: { pageId: 'graph-editor', typeId: 'graph-document', entity: graphEntity },
      cancelable: true
    }));
  }, entity);
  await app.page.locator('.process-designer-canvas').last().waitFor({ state: 'visible' });
  await app.page.waitForTimeout(2500);
}

test('a literal switched to Number wires into a typed input', async ({ app }) => {
  test.setTimeout(180_000);
  await app.installPlugins(['cad-occt']);
  await app.seedSpeciesProcess({ types: ['graph-document'], via: { 'graph-document': 'editor' } });

  const graphId = `literal-type-${Date.now()}`;
  const graph = {
    format: 'perigram.graph',
    version: 1,
    id: graphId,
    revision: `${graphId}-r1`,
    name: app.uniqueName('Literal type E2E'),
    interface: { inputs: [], outputs: [] },
    nodes: [
      {
        id: 'number',
        operation: { provider: 'perigram.processes', id: 'source.literalItem', version: '1' },
        config: { kind: 'source.literalItem', type: { base: 'string', nullable: false }, value: '12' },
        position: { x: 0, y: 0 }
      },
      {
        id: 'box',
        operation: { provider: 'plugin.cad-occt', id: 'make-box', version: '1' },
        config: {},
        position: { x: 0, y: 140 }
      }
    ],
    edges: []
  };
  const created = await app.request.post('/api/instances/graph-document/editor', {
    data: { name: graph.name, payload: JSON.stringify(graph) }
  });
  expect(created.ok(), await created.text()).toBe(true);
  const entity = await created.json();
  app.trackCleanup(async () => {
    await app.request.delete(`/api/instances/graph-document/${entity._id}`, { failOnStatusCode: false });
  });

  const { page } = app;
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openGraphEditor(app, entity);

  const literalNode = page.locator('.vue-flow__node').filter({ hasText: 'Literal' }).first();
  await literalNode.click();
  const typeSelect = page.locator('.perigram-dock').last().getByRole('combobox').first();
  await typeSelect.click();
  await page.getByRole('option', { name: 'Number', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  const source = literalNode.locator('.vue-flow__handle.vue-flow__handle-right').first();
  const target = page.locator('.vue-flow__node').filter({ hasText: 'Box' }).first()
    .locator('.vue-flow__handle.vue-flow__handle-left').first();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await expect(page.locator('.vue-flow__connection')).toHaveCount(1);
  await page.waitForTimeout(250);
  await page.mouse.up();

  await expect(page.locator('.vue-flow__edge[data-id]')).toHaveCount(1);
  expect(pageErrors, 'client errors while wiring the literal').toEqual([]);
  await app.expectCleanRuntime();
});
