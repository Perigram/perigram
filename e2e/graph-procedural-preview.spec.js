import { test, expect } from './fixtures.js';

async function openGraphEditor(app, entity) {
  await app.gotoClient('/');
  await app.page.locator('[data-home-workspace]').first().waitFor({ state: 'visible' });
  // The workspace entity pool hydrates after boot; a tab opened before its
  // record lands mounts once and is swapped when the pool arrives. Wait
  // for the graph in the navigation so the opened editor stays mounted.
  await expect(
    app.page.getByRole('treeitem').filter({ hasText: entity.name })
  ).toBeVisible({ timeout: 20_000 });
  await app.page.evaluate(graphEntity => {
    window.dispatchEvent(new CustomEvent('perigram:open-workspace-page', {
      detail: { pageId: 'graph-editor', typeId: 'graph-document', entity: graphEntity },
      cancelable: true
    }));
  }, entity);
  await app.page.locator('.process-designer-canvas').first().waitFor({ state: 'visible' });
  // The boot surface is swapped once while its entity hydrates; interactions
  // landing on the doomed instance are lost. Require the canvas element to
  // stay the same node for a window before driving the editor.
  await app.page.waitForFunction(() => {
    const canvas = document.querySelector('.process-designer-canvas');
    if (!canvas) return false;
    if (!canvas.dataset.editorSettledAt) {
      canvas.dataset.editorSettledAt = String(performance.now());
      return false;
    }
    return performance.now() - Number(canvas.dataset.editorSettledAt) > 1500;
  }, null, { timeout: 30_000 });
}

async function openPreviewPanel(app) {
  const { page } = app;
  const toggle = page.locator('[data-designer-toolbar]').getByRole('button', { name: 'Preview' });
  await expect(async () => {
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
      await toggle.click({ timeout: 5_000 });
    }
    await expect(page.locator('[data-designer-preview]')).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });
}

async function runPreview(app) {
  await app.page.getByRole('button', { name: 'Inspect', exact: true }).click();
}

function core(operationId, config) {
  return {
    operation: { provider: 'perigram.core', id: operationId, version: '1' },
    config,
    position: { x: 0, y: 0 }
  };
}

function documents(operationId, x, y) {
  return {
    operation: { provider: 'plugin.documents', id: operationId, version: '1' },
    config: {},
    position: { x, y }
  };
}

const stringInput = (id, label, value) => ({
  id, label, contract: { shape: 'item', semantic: { base: 'string' } }, required: true, default: value
});
const fileOutput = (id, label) => ({
  id, label, contract: { shape: 'item', semantic: { base: 'json', kind: 'documents.file' } }, required: true
});

async function saveGraph(app, graph) {
  const created = await app.request.post('/api/instances/graph-document/editor', {
    data: { name: graph.name, payload: JSON.stringify(graph) }
  });
  expect(created.ok(), await created.text()).toBe(true);
  const entity = await created.json();
  app.trackCleanup(async () => {
    await app.request.delete(`/api/instances/graph-document/${entity._id}`, { failOnStatusCode: false });
  });
  return entity;
}

async function seedGraphWorkspace(app) {
  await app.installPlugins(['tech-drawing', 'documents']);
  await app.seedSpeciesProcess({ types: ['graph-document'], via: { 'graph-document': 'editor' } });
}

test('typed Documents blocks preview through the graph preview channel', async ({ app }) => {
  test.setTimeout(180_000);
  await seedGraphWorkspace(app);

  const graph = {
    format: 'perigram.graph',
    version: 1,
    id: 'typed-blocks-preview-e2e',
    revision: 'typed-blocks-preview-e2e-r1',
    name: app.uniqueName('Typed blocks preview E2E'),
    interface: {
      inputs: [
        stringInput('body', 'Body', 'A typed paragraph assembled from inline blocks.'),
        stringInput('item', 'Item', 'A typed list entry from an inline block.')
      ],
      outputs: [fileOutput('file', 'Markdown file')]
    },
    nodes: [
      { id: 'body-input', ...core('perigram.core.graph-input', { interfaceId: 'body' }), position: { x: 0, y: 0 } },
      { id: 'item-input', ...core('perigram.core.graph-input', { interfaceId: 'item' }), position: { x: 0, y: 220 } },
      { id: 'phrase', ...documents('inline-text', 280, 0) },
      { id: 'entry', ...documents('inline-text', 280, 220) },
      { id: 'paragraph', ...documents('document-paragraph', 560, 0) },
      { id: 'list', ...documents('document-list', 560, 220) },
      { id: 'document', ...documents('compose-document', 840, 0) },
      { id: 'merged', ...documents('append-document-block', 1120, 0) },
      { id: 'export', ...documents('export-markdown-file', 1400, 0) },
      { id: 'file-output', ...core('perigram.core.graph-output', { interfaceId: 'file' }), position: { x: 1680, y: 0 } }
    ],
    edges: [
      { id: 'edge-body-phrase', source: { node: 'body-input', port: 'value' }, target: { node: 'phrase', port: 'text' } },
      { id: 'edge-item-entry', source: { node: 'item-input', port: 'value' }, target: { node: 'entry', port: 'text' } },
      { id: 'edge-phrase-paragraph', source: { node: 'phrase', port: 'value' }, target: { node: 'paragraph', port: 'children' } },
      { id: 'edge-entry-list', source: { node: 'entry', port: 'value' }, target: { node: 'list', port: 'inlineItems' } },
      { id: 'edge-paragraph-document', source: { node: 'paragraph', port: 'value' }, target: { node: 'document', port: 'blocks' } },
      { id: 'edge-document-merged', source: { node: 'document', port: 'value' }, target: { node: 'merged', port: 'document' } },
      { id: 'edge-list-merged', source: { node: 'list', port: 'value' }, target: { node: 'merged', port: 'block' } },
      { id: 'edge-merged-export', source: { node: 'merged', port: 'value' }, target: { node: 'export', port: 'document' } },
      { id: 'edge-export-output', source: { node: 'export', port: 'value' }, target: { node: 'file-output', port: 'value' } }
    ]
  };
  const entity = await saveGraph(app, graph);

  const { page } = app;
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openGraphEditor(app, entity);

  await openPreviewPanel(app);
  await runPreview(app);

  const previewFrame = page.locator('iframe[title$=".md"]').first();
  await expect(previewFrame).toBeVisible({ timeout: 45_000 });
  const srcdoc = await previewFrame.getAttribute('srcdoc');
  expect(srcdoc).toContain('<p>A typed paragraph assembled from inline blocks.</p>');
  expect(srcdoc).toContain('<li>A typed list entry from an inline block.</li>');

  const nodeOutputs = page.locator('details').filter({ hasText: 'Node outputs' });
  await nodeOutputs.locator('summary').click();
  await expect(nodeOutputs.getByText('inline-text', { exact: true })).toHaveCount(2);
  await expect(nodeOutputs.getByText('document-paragraph', { exact: true })).toBeVisible();
  await expect(nodeOutputs.getByText('document-list', { exact: true })).toBeVisible();
  await expect(nodeOutputs.getByText('compose-document', { exact: true })).toBeVisible();
  await expect(nodeOutputs).toContainText('"type": "paragraph"');
  await expect(nodeOutputs).toContainText('"type": "list"');
  await expect(nodeOutputs).toContainText('text.flow-document');
  await expect(nodeOutputs).toContainText('text/markdown');
  await expect(page.getByText(/Preview execution · succeeded/)).toBeVisible();

  expect(pageErrors, 'client errors while previewing typed Documents blocks').toEqual([]);
  await app.expectCleanRuntime();
});

test('an incompatible saved edge surfaces the mapped preflight diagnostic', async ({ app }) => {
  test.setTimeout(120_000);
  await seedGraphWorkspace(app);

  // paragraph emits text.document-block; the exporter input demands
  // text.flow-document — the saved edge is representationally invalid.
  const graph = {
    format: 'perigram.graph',
    version: 1,
    id: 'invalid-wire-e2e',
    revision: 'invalid-wire-e2e-r1',
    name: app.uniqueName('Invalid wire E2E'),
    interface: {
      inputs: [stringInput('body', 'Body', 'A paragraph that cannot flow into the exporter.')],
      outputs: [fileOutput('file', 'Markdown file')]
    },
    nodes: [
      { id: 'body-input', ...core('perigram.core.graph-input', { interfaceId: 'body' }), position: { x: 0, y: 0 } },
      { id: 'paragraph', ...documents('document-paragraph', 280, 0) },
      { id: 'export', ...documents('export-markdown-file', 560, 0) },
      { id: 'file-output', ...core('perigram.core.graph-output', { interfaceId: 'file' }), position: { x: 840, y: 0 } }
    ],
    edges: [
      { id: 'edge-body-paragraph', source: { node: 'body-input', port: 'value' }, target: { node: 'paragraph', port: 'text' } },
      { id: 'edge-paragraph-export', source: { node: 'paragraph', port: 'value' }, target: { node: 'export', port: 'document' } },
      { id: 'edge-export-output', source: { node: 'export', port: 'value' }, target: { node: 'file-output', port: 'value' } }
    ]
  };
  const entity = await saveGraph(app, graph);

  const { page } = app;
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openGraphEditor(app, entity);

  await openPreviewPanel(app);
  await runPreview(app);

  const diagnostic = page.locator('.p-message-error').filter({ hasText: 'Representation kind does not match' });
  await expect(diagnostic.first()).toBeVisible({ timeout: 45_000 });
  await expect(diagnostic.first()).toContainText(/Cannot connect .+ to document:/);
  await expect(page.locator('[data-canvas-status]')).toContainText('Preview error');
  await expect(page.locator('iframe[title$=".md"]')).toHaveCount(0);
  await expect(page.getByText(/Preview execution · succeeded/)).toHaveCount(0);

  expect(pageErrors, 'client errors while diagnosing the incompatible edge').toEqual([]);
  await app.expectCleanRuntime();
});

test('a pinned Use Graph revision previews its subgraph output and drift blocks preview', async ({ app }) => {
  test.setTimeout(240_000);
  await seedGraphWorkspace(app);

  const childRevision = 'use-graph-child-e2e-r1';
  const childGraph = {
    format: 'perigram.graph',
    version: 1,
    id: 'use-graph-child-e2e',
    revision: childRevision,
    name: app.uniqueName('Use Graph child E2E'),
    interface: {
      inputs: [stringInput('body', 'Body', 'Child paragraph rendered through its caller.')],
      outputs: [fileOutput('file', 'Markdown file')]
    },
    nodes: [
      { id: 'child-input', ...core('perigram.core.graph-input', { interfaceId: 'body' }), position: { x: 0, y: 0 } },
      { id: 'child-paragraph', ...documents('document-paragraph', 280, 0) },
      { id: 'child-document', ...documents('compose-document', 560, 0) },
      { id: 'child-export', ...documents('export-markdown-file', 840, 0) },
      { id: 'child-output', ...core('perigram.core.graph-output', { interfaceId: 'file' }), position: { x: 1120, y: 0 } }
    ],
    edges: [
      { id: 'edge-child-input-paragraph', source: { node: 'child-input', port: 'value' }, target: { node: 'child-paragraph', port: 'text' } },
      { id: 'edge-child-paragraph-document', source: { node: 'child-paragraph', port: 'value' }, target: { node: 'child-document', port: 'blocks' } },
      { id: 'edge-child-document-export', source: { node: 'child-document', port: 'value' }, target: { node: 'child-export', port: 'document' } },
      { id: 'edge-child-export-output', source: { node: 'child-export', port: 'value' }, target: { node: 'child-output', port: 'value' } }
    ]
  };
  const childEntity = await saveGraph(app, childGraph);

  const parentGraph = {
    format: 'perigram.graph',
    version: 1,
    id: 'use-graph-parent-e2e',
    revision: 'use-graph-parent-e2e-r1',
    name: app.uniqueName('Use Graph parent E2E'),
    interface: {
      inputs: [stringInput('body', 'Body', 'Paragraph rendered by the pinned subgraph.')],
      outputs: [fileOutput('file', 'Markdown file')]
    },
    nodes: [
      { id: 'body-input', ...core('perigram.core.graph-input', { interfaceId: 'body' }), position: { x: 0, y: 0 } },
      {
        id: 'invoke',
        ...core('perigram.core.use-graph', {
          graphId: childGraph.id,
          revision: childRevision,
          interface: {
            inputs: childGraph.interface.inputs.map(port => ({
              id: port.id, label: port.label, contract: port.contract, required: port.required
            })),
            outputs: childGraph.interface.outputs.map(port => ({
              id: port.id, label: port.label, contract: port.contract, required: port.required
            }))
          }
        }),
        position: { x: 320, y: 0 }
      },
      { id: 'file-output', ...core('perigram.core.graph-output', { interfaceId: 'file' }), position: { x: 640, y: 0 } }
    ],
    edges: [
      { id: 'edge-body-invoke', source: { node: 'body-input', port: 'value' }, target: { node: 'invoke', port: 'body' } },
      { id: 'edge-invoke-output', source: { node: 'invoke', port: 'file' }, target: { node: 'file-output', port: 'value' } }
    ]
  };
  const parentEntity = await saveGraph(app, parentGraph);

  const { page } = app;
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openGraphEditor(app, parentEntity);

  await openPreviewPanel(app);
  await runPreview(app);

  const previewFrame = page.locator('iframe[title$=".md"]').first();
  await expect(previewFrame).toBeVisible({ timeout: 45_000 });
  expect(await previewFrame.getAttribute('srcdoc')).toContain('Paragraph rendered by the pinned subgraph.');
  await expect(page.getByText(/Preview execution · succeeded/)).toBeVisible();
  const nodeOutputs = page.locator('details').filter({ hasText: 'Node outputs' });
  await nodeOutputs.locator('summary').click();
  await expect(nodeOutputs.getByText('perigram.core.use-graph', { exact: true })).toBeVisible();

  // The catalog tracks only current payload revisions: saving a new child
  // revision strands the parent's pin.
  const driftedGraph = {
    ...childGraph,
    revision: 'use-graph-child-e2e-r2',
    name: childGraph.name
  };
  const drift = await app.request.put(`/api/instances/graph-document/${childEntity._id}/payload`, {
    multipart: {
      file: {
        name: `${driftedGraph.name}.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(driftedGraph, null, 2))
      }
    }
  });
  expect(drift.ok(), await drift.text()).toBe(true);

  await openGraphEditor(app, parentEntity);
  await openPreviewPanel(app);
  await runPreview(app);

  const driftDiagnostic = page.locator('.p-message-error').filter({
    hasText: `Pinned subgraph ${childGraph.id}@${childRevision} is unavailable`
  });
  await expect(driftDiagnostic.first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-canvas-status]')).toContainText('Preview error');
  await expect(page.locator('iframe[title$=".md"]')).toHaveCount(0);

  expect(pageErrors, 'client errors while previewing and drifting the pinned subgraph').toEqual([]);
  await app.expectCleanRuntime();
});
