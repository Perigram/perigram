import { test, expect } from './fixtures.js';
import { createCncFixtureScenario } from '../test-data/scenarios.js';

test.describe('entity action buttons', () => {
  test('generates and downloads DXF from the sheet design detail action', async ({ app }) => {
    let commandBody = null;

    await app.page.route('**/api/sheet-designs/sheet-action-test', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _id: 'sheet-action-test',
          identity: { name: 'Action test sheet' },
          lineage: { projectId: 'project-action-test' },
          status: { state: 'READY' },
          data: {
            placements: [],
            materialPool: [],
            instanceIds: []
          },
          summary: { efficiency: 0, placedCount: 0 },
          specs: { cuttingLength: 0, estimatedTime: 0 }
        })
      });
    });

    await app.page.route('**/api/commands/generateAttachment/run', async route => {
      commandBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          result: {
            data: { attachmentId: 'artifact-action-test' },
            attachments: [{ id: 'artifact-action-test', kind: 'LAYOUT_DXF' }]
          }
        })
      });
    });
    await app.page.route('**/api/artifacts/artifact-action-test', async route => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/dxf',
          'Content-Disposition': 'attachment; filename="sheet-action-test.dxf"'
        },
        body: '0\nSECTION\n2\nENTITIES\n0\nEOF'
      });
    });

    await app.page.goto('/project/project-action-test/sheet-design/sheet-action-test');
    const downloadPromise = app.page.waitForEvent('download');
    await app.page.getByTestId('sheet-design-generate-dxf').click();
    const download = await downloadPromise;

    expect(commandBody).toEqual({
      entities: { sheetDesign: 'sheet-action-test' },
      parameters: { kind: 'LAYOUT_DXF' }
    });
    expect(download.suggestedFilename()).toBe('sheet-action-test.dxf');
    await app.expectCleanRuntime();
  });

  test('creates a cassette design from the cassette template action', async ({ app }) => {
    let createBody = null;

    await app.page.route('**/api/cassettes**', async route => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }

      if (new URL(route.request().url()).pathname !== '/api/cassettes') {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          _id: 'template-action-test',
          identity: { name: 'Action test template', slug: 'action-test-template' },
          lineage: { organizationId: 'org-action-test' },
          status: { state: 'ACTIVE' },
          data: {
            type: 'PARAMETRIC',
            definition: { parameters: { A: '500', B: '600' } },
            parameters: ['A', 'B']
          }
        }])
      });
    });

    await app.page.route('**/api/cassettes/template-action-test/designs', async route => {
      createBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _id: 'design-action-test',
          identity: { name: 'Action test template Design' },
          lineage: { templateId: 'template-action-test' },
          data: { parameters: createBody.parameters }
        })
      });
    });

    await app.page.goto('/assets/cassettes');
    await app.page.getByTestId('cassette-template-create-design').click();

    expect(createBody).toEqual({ parameters: { A: 500, B: 600 } });
    await app.expectCleanRuntime();
  });

  test('exports seeded sheet, cassette template, and cassette design DXF through real API routes', async ({ app }) => {
    const scenario = createCncFixtureScenario();
    const seed = await app.request.post('/api/workbench/fixtures/seed', {
      data: { scenario },
      failOnStatusCode: false
    });
    const seedText = await seed.text();
    expect(seed.ok(), seedText).toBeTruthy();

    const sheetExport = await app.request.get(`/api/sheet-designs/${scenario.refs.sheetDesign}/export`, {
      failOnStatusCode: false
    });
    const sheetDxf = await sheetExport.text();
    expect(sheetExport.ok(), sheetDxf).toBeTruthy();
    expect(sheetDxf).toContain('LWPOLYLINE');

    const templateExport = await app.request.get(`/api/cassettes/${scenario.refs.cassetteTemplate}/export?A=500&B=400&R=35`, {
      failOnStatusCode: false
    });
    const templateDxf = await templateExport.text();
    expect(templateExport.ok(), templateDxf).toBeTruthy();
    expect(templateDxf).toContain('cut.outer');
    expect(templateDxf).toContain('dimension.cassette');

    const designExport = await app.request.get(`/api/cassette-designs/${scenario.refs.cassetteDesign}/export`, {
      failOnStatusCode: false
    });
    const designDxf = await designExport.text();
    expect(designExport.ok(), designDxf).toBeTruthy();
    expect(designDxf).toContain('LWPOLYLINE');

    const command = await app.request.post('/api/commands/generateAttachment/run', {
      data: {
        entities: { sheetDesign: scenario.refs.sheetDesign },
        parameters: { kind: 'LAYOUT_DXF' }
      },
      failOnStatusCode: false
    });
    const commandText = await command.text();
    expect(command.ok(), commandText).toBeTruthy();
    const commandResult = JSON.parse(commandText);
    const attachmentId = commandResult.result?.data?.attachmentId;
    expect(attachmentId).toBeTruthy();

    const artifactDownload = await app.request.get(`/api/artifacts/${attachmentId}`, {
      failOnStatusCode: false
    });
    const artifactDxf = await artifactDownload.text();
    expect(artifactDownload.ok(), artifactDxf).toBeTruthy();
    expect(artifactDxf).toContain('LWPOLYLINE');
  });
});
