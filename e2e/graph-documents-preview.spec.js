import { test, expect } from './fixtures.js';

// Exercise the installed Documents provider, saved graph-document workspace,
// graph evaluation, and the real provider-declared preview channel together.
// The graph is created through the same first-save API the editor uses; the
// browser must discover the installed runtime and mount report-preview.mjs.
test('saved Documents graph renders its Markdown file through the Documents preview channel', async ({ app }) => {
  test.setTimeout(180_000);
  await app.installPlugins(['tech-drawing', 'documents']);

  const graph = {
    format: 'perigram.graph',
    version: 1,
    id: 'documents-preview-e2e',
    revision: 'documents-preview-e2e-r1',
    name: 'Documents preview E2E',
    interface: {
      inputs: [{
        id: 'markdown',
        label: 'Markdown',
        contract: { shape: 'item', semantic: { base: 'string' } },
        required: true
      }],
      outputs: [{
        id: 'file',
        label: 'Markdown file',
        contract: { shape: 'item', semantic: { base: 'json', kind: 'documents.file' } },
        required: true
      }]
    },
    nodes: [
      {
        id: 'input',
        operation: { provider: 'perigram.core', id: 'perigram.core.graph-input', version: '1' },
        config: { interfaceId: 'markdown' },
        position: { x: 0, y: 0 }
      },
      {
        id: 'parse',
        operation: { provider: 'plugin.documents', id: 'parse-markdown', version: '1' },
        config: {},
        position: { x: 280, y: 0 }
      },
      {
        id: 'export',
        operation: { provider: 'plugin.documents', id: 'export-markdown-file', version: '1' },
        config: {},
        position: { x: 560, y: 0 }
      },
      {
        id: 'output',
        operation: { provider: 'perigram.core', id: 'perigram.core.graph-output', version: '1' },
        config: { interfaceId: 'file' },
        position: { x: 840, y: 0 }
      }
    ],
    edges: [
      { id: 'edge-input-parse', source: { node: 'input', port: 'value' }, target: { node: 'parse', port: 'text' } },
      { id: 'edge-parse-export', source: { node: 'parse', port: 'value' }, target: { node: 'export', port: 'document' } },
      { id: 'edge-export-output', source: { node: 'export', port: 'value' }, target: { node: 'output', port: 'value' } }
    ]
  };

  const pageName = `Documents preview destination ${Date.now()}`;
  const destinationResponse = await app.request.post('/api/pages', {
    data: { name: pageName }
  });
  expect(destinationResponse.ok(), await destinationResponse.text()).toBe(true);
  const destinationPage = await destinationResponse.json();

  const created = await app.request.post('/api/instances/graph-document/editor', {
    data: { name: graph.name, graph }
  });
  expect(created.ok(), await created.text()).toBe(true);

  const { page } = app;
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await app.gotoClient('/organization/graphs');
  await page.getByRole('option', { name: graph.name }).click();
  await expect(page.locator('.process-designer-canvas').first()).toBeVisible({ timeout: 30_000 });

  // Open the support rail from the canvas status affordance.
  await page.locator('[data-canvas-status]').click();
  const markdownInput = page.getByRole('textbox', { name: 'Markdown' });
  await expect(markdownInput).toBeVisible({ timeout: 15_000 });
  await markdownInput.fill('# Graph preview E2E\n\nRendered by the installed Documents plugin.');
  await page.getByRole('button', { name: /apply input/i }).click();
  await page.getByRole('button', { name: /inspect/i }).click();

  const previewFrame = page.locator('iframe[title$=".md"]').first();
  await expect(previewFrame).toBeVisible({ timeout: 45_000 });
  const srcdoc = await previewFrame.getAttribute('srcdoc');
  expect(srcdoc).toContain('Graph preview E2E');
  expect(srcdoc).toContain('Rendered by the installed Documents plugin.');

  // The same evaluation envelope must retain intermediate node values,
  // not only the selected graph output consumed by the Documents channel.
  const nodeOutputs = page.locator('details').filter({ hasText: 'Node outputs' });
  await nodeOutputs.locator('summary').click();
  await expect(nodeOutputs.getByText('parse-markdown', { exact: true })).toBeVisible();
  await expect(nodeOutputs.getByText('export-markdown-file', { exact: true })).toBeVisible();
  await expect(nodeOutputs).toContainText('text.flow-document');
  await expect(nodeOutputs).toContainText('text/markdown');

  // Bake the selected Documents file into a real Page, then reopen the
  // Page through the read API and verify the persisted file bytes.
  await page.getByLabel('Page destination').click();
  await page.getByRole('option', { name: pageName }).click();
  const bakedPath = 'documents/preview-e2e.md';
  await page.getByLabel('Page file path').fill(bakedPath);
  const bakeResponse = page.waitForResponse(response => (
    response.url().includes('/api/graph-bakes') && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: 'Bake output' }).click();
  const baked = await bakeResponse;
  expect(baked.ok(), await baked.text()).toBe(true);
  const pageDetailResponse = await app.request.get(`/api/pages/${encodeURIComponent(destinationPage._id)}`);
  expect(pageDetailResponse.ok(), await pageDetailResponse.text()).toBe(true);
  const pageDetail = await pageDetailResponse.json();
  const bakedBlock = pageDetail.blocks.find(block => block.kind === 'file' && block.file?.path === bakedPath);
  expect(bakedBlock?.file).toMatchObject({ path: bakedPath, mime: 'text/markdown' });
  const bakedDownload = await app.request.get(
    `/api/files/download/${encodeURIComponent(bakedBlock.file.fileId)}?bucket=files`
  );
  expect(bakedDownload.ok(), await bakedDownload.text()).toBe(true);
  const bakedText = await bakedDownload.text();
  expect(bakedText).toContain('# Graph preview E2E');
  expect(bakedText).toContain('Rendered by the installed Documents plugin.');

  expect(pageErrors, 'client errors while loading and rendering the Documents preview').toEqual([]);
  await app.expectCleanRuntime();
});
