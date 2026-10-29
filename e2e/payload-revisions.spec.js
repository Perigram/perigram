import { test, expect } from './fixtures.js';
import { writeFileSync, mkdirSync } from 'node:fs';

// The record's version surface (SPEC §24): a revision-scoped file type's
// detail carries the revision picker — prior payload revisions listed
// newest-first with the current one marked, any revision opening
// read-only through its frozen bytes, and a prior revision restoring
// through the revisioned payload channel as a new revision. The durable
// artifact is test-results/payload-revisions-live.json plus the attached
// screenshots.

const TYPE = 'dxf-source';

const REV1 = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'TEXT', '8', 'STAMP', '10', '10.0', '20', '10.0', '40', '4.0', '1', 'REV ONE',
  '0', 'ENDSEC', '0', 'EOF'
].join('\n');

const REV2 = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'TEXT', '8', 'STAMP', '10', '10.0', '20', '10.0', '40', '4.0', '1', 'REV TWO',
  '0', 'ENDSEC', '0', 'EOF'
].join('\n');

test.describe('payload revision picker', () => {
  test('lists, previews read-only, and restores prior payload revisions', async ({ app }, testInfo) => {
    test.setTimeout(240_000);
    await app.installPlugins(['tech-drawing']);

    // Authoring through the MCP surface: one upload construct over the
    // tech-drawing dxf-source type (payload + geometry revision scope).
    let rpcId = 0;
    const call = async (name, args) => {
      const response = await app.request.post('/api/mcp', {
        data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const payload = await response.json();
      const text = (payload.result?.content || []).map(part => part.text ?? '').join('\n');
      return JSON.parse(text);
    };

    await call('create_process_definition', { name: 'Revision picker probe' });
    const vocab = await call('get_authoring_vocabulary', {});
    const roleId = vocab.roles?.[0]?.id;
    expect(roleId, 'no organization role for the construct lane').toBeTruthy();
    const grant = { access: { grants: [{ roleId, level: 'write' }] } };
    const composed = await call('compose_process_definition', {
      name: 'Revision picker probe',
      steps: [
        { op: 'drop', item: 'construct', id: 'up' },
        { op: 'declareTypeRef', id: 'dxf', typeId: TYPE },
        { op: 'wireDeclaration', from: 'dxf', to: 'up', role: 'binds' },
        { op: 'configure', id: 'up', values: { construction: { mode: 'upload' } } },
        { op: 'configure', id: 'up', values: grant }
      ]
    });
    const definitionId = composed.id || composed._id;
    const validation = await call('validate_process_definition', { definitionId });
    expect(validation.errors || []).toEqual([]);
    await call('activate_process_definition', { definitionId });

    // v1: the upload construct mints revision 1 (created).
    const upload = await app.request.post('/api/files/upload?bucket=files', {
      multipart: { file: { name: 'probe.dxf', mimeType: 'application/dxf', buffer: Buffer.from(REV1) } }
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    const blob = await upload.json();
    const run = await call('run_action', {
      actionId: 'up',
      data: { payload: { fileId: blob.id, name: 'probe.dxf', mime: 'application/dxf', size: REV1.length } }
    });
    const instanceId = String((run.created || run.instance || run)._id);
    expect(instanceId).toBeTruthy();

    // v2: new bytes through the revisioned payload channel (payload-replaced).
    // fetch() ships the method it is given; post() would send POST and
    // the route answers 404.
    const replaced = await app.request.fetch(`/api/instances/${TYPE}/${instanceId}/payload`, {
      method: 'PUT',
      multipart: { file: { name: 'probe.dxf', mimeType: 'application/dxf', buffer: Buffer.from(REV2) } }
    });
    expect(replaced.ok(), await replaced.text()).toBeTruthy();

    // --- the picker under test, on the compiled detail surface ---
    await app.page.goto(`/screens/auto_${TYPE}_detail?instanceId=${instanceId}`);
    const header = app.page.locator('.surface-header');
    await expect(header).toBeVisible({ timeout: 30_000 });

    await header.getByRole('button', { name: 'Revisions' }).click();
    const list = app.page.locator('[data-revision-list]');
    await expect(list).toBeVisible({ timeout: 15_000 });
    const row = number => list.locator(`[data-revision-number="${number}"]`);

    // Newest first, the record's current revision marked.
    await expect(row(2).locator('.p-tag', { hasText: 'current' })).toBeVisible({ timeout: 15_000 });
    await expect(row(1)).toBeVisible();
    // Rows render the frozen payload's name and its preview band (the
    // shared preview media contract over the revision's frozen bytes).
    await expect(row(2).getByText('probe.dxf')).toBeVisible();
    await expect(row(1).locator('[data-revision-preview]')).toBeVisible({ timeout: 30_000 });
    await expect(row(1).locator('[data-file-payload-viewer][data-viewer-mode="dxf"]')).toBeVisible({ timeout: 30_000 });
    // The current revision carries no restore affordance.
    await expect(row(2).locator('[data-revision-view]')).toBeVisible();
    await expect(row(2).locator('[data-revision-restore]')).toHaveCount(0);

    // Any revision opens read-only through its frozen bytes.
    await row(1).locator('[data-revision-view]').click();
    const dialog = app.page.locator('[data-revision-dialog]');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.locator('[data-file-payload-viewer][data-viewer-mode="dxf"]')).toBeVisible({ timeout: 30_000 });
    await testInfo.attach('revision-readonly-preview', {
      body: await dialog.screenshot(),
      contentType: 'image/png'
    });
    await app.page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // Escape may have closed the popover beneath the dialog; reopen it.
    if (!(await list.isVisible())) {
      await header.getByRole('button', { name: 'Revisions' }).click();
      await expect(list).toBeVisible({ timeout: 15_000 });
    }

    // Restore v1: the frozen bytes re-enter as a new revision.
    await row(1).locator('[data-revision-restore]').click();
    await expect(list.locator('[data-revision-number="3"]').locator('.p-tag', { hasText: 'current' }))
      .toBeVisible({ timeout: 30_000 });
    await expect(list.locator('[data-revision-number="3"] small', { hasText: 'from v1' })).toBeVisible();
    await expect(list.locator('[data-revision-number="3"]').locator('[data-revision-preview]')).toBeVisible({ timeout: 30_000 });
    await testInfo.attach('revision-picker-after-restore', {
      body: await list.screenshot(),
      contentType: 'image/png'
    });

    // The record serves the restored bytes; the fabric is append-only.
    const payloadResponse = await app.request.get(`/api/instances/${TYPE}/${instanceId}`);
    const payloadDoc = await payloadResponse.json();
    const bytesResponse = await app.request.get(
      `/api/files/download/${encodeURIComponent(String(payloadDoc.payload?.fileId))}?bucket=files`
    );
    expect(bytesResponse.ok(), await bytesResponse.text()).toBeTruthy();
    expect(await bytesResponse.text()).toContain('REV ONE');

    const revisionsResponse = await app.request.get(
      `/api/instance-revisions?typeId=${TYPE}&instanceId=${instanceId}&scope=geometry`
    );
    expect(revisionsResponse.ok(), await revisionsResponse.text()).toBeTruthy();
    const revisions = await revisionsResponse.json();
    const summary = (Array.isArray(revisions) ? revisions : []).map(revision => ({
      number: revision.data?.number,
      reason: revision.data?.reason,
      createdAt: revision.data?.createdAt || null,
      hasFrozenBytes: Boolean(revision.attachments?.primary?.fileId)
    })).sort((a, b) => a.number - b.number);
    expect(summary.map(entry => entry.reason)).toEqual(['created', 'payload-replaced', 'payload-restored']);
    for (const entry of summary) {
      expect(entry.createdAt, `revision ${entry.number} carries a creation stamp`).toBeTruthy();
      expect(entry.hasFrozenBytes, `revision ${entry.number} carries frozen bytes`).toBe(true);
    }

    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/payload-revisions-live.json', JSON.stringify({
      type: TYPE,
      instanceId,
      revisions: summary
    }, null, 2));

    await app.expectCleanRuntime();
  });
});
