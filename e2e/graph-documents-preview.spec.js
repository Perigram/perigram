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
  const bakeResult = await baked.json();
  expect(bakeResult.execution).toMatchObject({
    profile: 'procedural-bake',
    status: 'succeeded',
    graph: { id: graph.id, revision: graph.revision },
    artifacts: [expect.objectContaining({
      kind: 'page-file',
      pageId: String(destinationPage._id),
      path: bakedPath,
      outputId: 'file',
      sourceExecutionId: expect.any(String)
    })]
  });
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


test('typed Documents blocks preview and Bake Markdown and HTML files with provenance', async ({ app }) => {
  test.setTimeout(240_000);
  await app.installPlugins(['tech-drawing', 'documents']);

  const graph = {
    format: 'perigram.graph',
    version: 1,
    id: 'documents-typed-blocks-e2e',
    revision: 'documents-typed-blocks-e2e-r1',
    name: 'Documents typed blocks E2E',
    interface: {
      inputs: [{
        id: 'body',
        label: 'Body',
        contract: { shape: 'item', semantic: { base: 'string' } },
        required: true
      }],
      outputs: [
        { id: 'markdown', label: 'Markdown file', contract: { shape: 'item', semantic: { base: 'json', kind: 'documents.file' } }, required: true },
        { id: 'html', label: 'HTML file', contract: { shape: 'item', semantic: { base: 'json', kind: 'documents.file' } }, required: true }
      ]
    },
    nodes: [
      { id: 'input', operation: { provider: 'perigram.core', id: 'perigram.core.graph-input', version: '1' }, config: { interfaceId: 'body' }, position: { x: 0, y: 0 } },
      { id: 'paragraph', operation: { provider: 'plugin.documents', id: 'document-paragraph', version: '1' }, config: {}, position: { x: 260, y: 0 } },
      { id: 'compose', operation: { provider: 'plugin.documents', id: 'compose-document', version: '1' }, config: {}, position: { x: 520, y: 0 } },
      { id: 'markdown', operation: { provider: 'plugin.documents', id: 'export-markdown-file', version: '1' }, config: {}, position: { x: 780, y: -80 } },
      { id: 'html', operation: { provider: 'plugin.documents', id: 'export-html-file', version: '1' }, config: {}, position: { x: 780, y: 100 } },
      { id: 'markdown-output', operation: { provider: 'perigram.core', id: 'perigram.core.graph-output', version: '1' }, config: { interfaceId: 'markdown' }, position: { x: 1040, y: -80 } },
      { id: 'html-output', operation: { provider: 'perigram.core', id: 'perigram.core.graph-output', version: '1' }, config: { interfaceId: 'html' }, position: { x: 1040, y: 100 } }
    ],
    edges: [
      { id: 'input-paragraph', source: { node: 'input', port: 'value' }, target: { node: 'paragraph', port: 'text' } },
      { id: 'paragraph-compose', source: { node: 'paragraph', port: 'value' }, target: { node: 'compose', port: 'blocks' } },
      { id: 'compose-markdown', source: { node: 'compose', port: 'value' }, target: { node: 'markdown', port: 'document' } },
      { id: 'compose-html', source: { node: 'compose', port: 'value' }, target: { node: 'html', port: 'document' } },
      { id: 'markdown-output-edge', source: { node: 'markdown', port: 'value' }, target: { node: 'markdown-output', port: 'value' } },
      { id: 'html-output-edge', source: { node: 'html', port: 'value' }, target: { node: 'html-output', port: 'value' } }
    ]
  };

  const pageName = 'Typed document destinations ' + Date.now();
  const destinationResponse = await app.request.post('/api/pages', { data: { name: pageName } });
  expect(destinationResponse.ok(), await destinationResponse.text()).toBe(true);
  const destinationPage = await destinationResponse.json();
  const created = await app.request.post('/api/instances/graph-document/editor', { data: { name: graph.name, graph } });
  expect(created.ok(), await created.text()).toBe(true);

  const { page } = app;
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await app.gotoClient('/organization/graphs');
  await page.getByRole('option', { name: graph.name }).click();
  await expect(page.locator('.process-designer-canvas').first()).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-canvas-status]').click();
  const bodyInput = page.getByRole('textbox', { name: 'Body' });
  await expect(bodyInput).toBeVisible({ timeout: 15_000 });
  await bodyInput.fill('A typed paragraph from the Documents graph.');
  await page.getByRole('button', { name: /apply input/i }).click();
  await page.getByRole('button', { name: /inspect/i }).click();

  const markdownFrame = page.locator('iframe[title$=".md"]').first();
  await expect(markdownFrame).toBeVisible({ timeout: 45_000 });
  expect(await markdownFrame.getAttribute('srcdoc')).toContain('A typed paragraph from the Documents graph.');
  const nodeOutputs = page.locator('details').filter({ hasText: 'Node outputs' });
  await nodeOutputs.locator('summary').click();
  await expect(nodeOutputs.getByText('document-paragraph', { exact: true })).toBeVisible();
  await expect(nodeOutputs.getByText('compose-document', { exact: true })).toBeVisible();

  const bake = async (outputLabel, filePath) => {
    const outputSelect = page.getByLabel('Graph output');
    await outputSelect.click();
    await page.getByRole('option', { name: outputLabel, exact: true }).click();
    await page.getByLabel('Page destination').click();
    await page.getByRole('option', { name: pageName }).click();
    await page.getByLabel('Page file path').fill(filePath);
    const responsePromise = page.waitForResponse(response => response.url().includes('/api/graph-bakes') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Bake output' }).click();
    const response = await responsePromise;
    expect(response.ok(), await response.text()).toBe(true);
    const result = await response.json();
    expect(result.execution).toMatchObject({
      profile: 'procedural-bake',
      status: 'succeeded',
      graph: { id: graph.id, revision: graph.revision },
      artifacts: [expect.objectContaining({
        kind: 'page-file',
        pageId: String(destinationPage._id),
        path: filePath,
        outputId: outputLabel === 'Markdown file' ? 'markdown' : 'html',
        sourceExecutionId: expect.any(String)
      })]
    });
  };

  await bake('Markdown file', 'documents/typed-blocks.md');
  await bake('HTML file', 'documents/typed-blocks.html');

  const pageDetailResponse = await app.request.get('/api/pages/' + encodeURIComponent(destinationPage._id));
  expect(pageDetailResponse.ok(), await pageDetailResponse.text()).toBe(true);
  const pageDetail = await pageDetailResponse.json();
  const markdownBlock = pageDetail.blocks.find(block => block.kind === 'file' && block.file?.path === 'documents/typed-blocks.md');
  const htmlBlock = pageDetail.blocks.find(block => block.kind === 'file' && block.file?.path === 'documents/typed-blocks.html');
  expect(markdownBlock?.file).toMatchObject({ mime: 'text/markdown' });
  expect(htmlBlock?.file).toMatchObject({ mime: 'text/html' });
  const markdownDownload = await app.request.get('/api/files/download/' + encodeURIComponent(markdownBlock.file.fileId) + '?bucket=files');
  const htmlDownload = await app.request.get('/api/files/download/' + encodeURIComponent(htmlBlock.file.fileId) + '?bucket=files');
  expect(markdownDownload.ok(), await markdownDownload.text()).toBe(true);
  expect(htmlDownload.ok(), await htmlDownload.text()).toBe(true);
  expect(await markdownDownload.text()).toContain('A typed paragraph from the Documents graph.');
  const html = await htmlDownload.text();
  expect(html).toContain('<p>A typed paragraph from the Documents graph.</p>');
  expect(pageErrors, 'client errors while authoring and baking typed Documents outputs').toEqual([]);
  await app.expectCleanRuntime();
});
