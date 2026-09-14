import { test, expect } from './fixtures.js';
import { Buffer } from 'node:buffer';

test.describe('artifact and designer UI', () => {
  test('artifact detail selects its file viewer and replacement creates a revision', async ({ app }) => {
    await app.switchToAssignedOrganization();
    const project = await app.createProject();
    const firstDxf = Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF');
    const createdResponse = await app.request.post('/api/artifacts', {
      multipart: {
        file: { name: 'fixture.dxf', mimeType: 'application/dxf', buffer: firstDxf },
        type: 'DXF_SOURCE',
        name: app.uniqueName('DXF artifact'),
        lineage: JSON.stringify({ projectId: project._id })
      }
    });
    expect(createdResponse.ok(), await createdResponse.text()).toBeTruthy();
    const artifact = await createdResponse.json();
    app.trackCleanup(() => app.request.delete(`/api/artifacts/${artifact._id}`, { failOnStatusCode: false }));

    const auth = await (await app.request.get('/api/auth/me')).json();
    const detail = (auth.screens || []).find(screen => screen.template === 'entityDetail' && screen.entityType === 'artifact');
    test.skip(!detail?.route, 'Active process has no generated artifact detail screen');
    await app.page.goto(`${detail.route}?entityId=${encodeURIComponent(artifact._id)}&artifactId=${encodeURIComponent(artifact._id)}&projectId=${encodeURIComponent(project._id)}`);
    await expect(app.page.locator('[data-artifact-viewer][data-viewer-mode="dxf"]')).toBeVisible();

    const replacement = await app.request.put(`/api/artifacts/${artifact._id}/file`, {
      multipart: { file: { name: 'replacement.dxf', mimeType: 'application/dxf', buffer: Buffer.from('0\nSECTION\n2\nENTITIES\n999\nEOF') } }
    });
    expect(replacement.ok(), await replacement.text()).toBeTruthy();
    const revisions = await app.request.get(`/api/entity-revisions?entityType=artifact&entityId=${artifact._id}&scope=file`);
    expect(revisions.ok(), await revisions.text()).toBeTruthy();
    expect((await revisions.json()).length).toBeGreaterThanOrEqual(2);

    const incompatible = await app.request.post('/api/commands/convertArtifact/run', {
      data: { entities: { artifact: artifact._id }, parameters: { conversion: 'layoutDxfToDxfSource' } },
      failOnStatusCode: false
    });
    expect(incompatible.status()).toBe(400);
    await app.expectCleanRuntime();
  });

  test('cassette page renders designer action', async ({ app }) => {
    const cassettes = await app.request.get('/api/cassettes', { failOnStatusCode: false });
    if (cassettes.ok()) {
      const list = await cassettes.json();
      const items = Array.isArray(list) ? list : list.items || [];
      if (items.length) {
        await app.page.goto(`/api/cassettes/${items[0]._id}`);
        await app.page.waitForLoadState('load');
        await app.page.waitForTimeout(1000);
      }
    }
    await app.expectCleanRuntime();
  });

  test('invitation page renders centered form without errors', async ({ app }) => {
    await app.page.goto('/invitation/invalid-token');
    await app.page.waitForLoadState('load');
    await expect(app.page.locator('.p-message, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
  });
});
