import { test, expect } from './fixtures.js';
import * as XLSX from 'xlsx';

// The documents markdown fill driven through the same generated create
// dialog rails as the DXF fill (SPEC §24): the shell's preview pane
// renders the composed markdown in the text-document's own preview mode.
// Artifact: the composed markdown under .playwright/.

const TEMPLATE = '# Offer {client}\n\nPrepared on {date}.\n';

test.describe('documents fill dialog', () => {
  test('the markdown fill composes and previews through the text mode', async ({ app }) => {
    test.setTimeout(240_000);
    await app.installPlugins(['tech-drawing', 'documents']);
    await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');

    let rpcId = 0;
    const call = async (name, args) => {
      const response = await app.request.post('/api/mcp', {
        data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const payload = await response.json();
      return JSON.parse((payload.result?.content || []).map(part => part.text ?? '').join('\n'));
    };

    await call('create_process_definition', { name: 'Md fill draft' });
    const vocab = await call('get_authoring_vocabulary', {});
    const roleId = vocab.roles?.[0]?.id;
    const grant = { access: { grants: [{ roleId, level: 'write' }] } };
    const composed = await call('compose_process_definition', {
      name: 'Md fill probe',
      steps: [
        { op: 'drop', item: 'construct', id: 'up' },
        { op: 'declareTypeRef', id: 'md', typeId: 'text-document' },
        { op: 'wireDeclaration', from: 'md', to: 'up', role: 'binds' },
        { op: 'configure', id: 'up', values: { construction: { mode: 'upload' } } },
        { op: 'configure', id: 'up', values: grant },
        { op: 'drop', item: 'construct', id: 'fill' },
        { op: 'wireDeclaration', from: 'md', to: 'fill', role: 'binds' },
        { op: 'configure', id: 'fill', values: { construction: { mode: 'fill' } } },
        { op: 'configure', id: 'fill', values: grant }
      ]
    });
    await call('activate_process_definition', { definitionId: composed.id || composed._id });

    const blob = await (await app.request.post('/api/files/upload?bucket=files', {
      multipart: { file: { name: 'offer-tpl.md', mimeType: 'text/markdown', buffer: Buffer.from(TEMPLATE) } }
    })).json();
    await call('run_action', {
      actionId: 'up',
      data: { payload: { fileId: blob.id, name: 'offer-tpl.md', mime: 'text/markdown', size: TEMPLATE.length } }
    });

    await app.gotoClient('/screens/auto_text-document');
    const main = app.page.locator('main');
    const modeSelect = main.getByLabel('Creation mode');
    await expect(modeSelect).toBeVisible({ timeout: 30_000 });
    // The opening panel animates; the settle wait plus the value check
    // keeps the click off the first row's coordinates.
    await expect(async () => {
      await modeSelect.click();
      await app.page.waitForTimeout(400);
      await app.page.getByRole('option', { name: 'Fill', exact: true }).click();
      await expect(modeSelect).toContainText('Fill');
    }).toPass({ timeout: 30_000 });
    await main.locator('.p-inputgroup').getByRole('button').last().click();

    const dialog = app.page.locator('.p-dialog').first();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').first().fill('offer-composed');

    const templateInput = dialog.locator('.p-autocomplete input');
    await templateInput.fill('offer-tpl');
    await app.page.locator('.p-autocomplete-item, [role="option"]', { hasText: 'offer-tpl' }).first().click();

    // The composition's meta names the template's tokens; each takes a
    // scalar input — the values map is never typed as json.
    const clientInput = dialog.getByLabel('client', { exact: true });
    await expect(clientInput).toBeVisible({ timeout: 30_000 });
    await clientInput.fill('Perigram');
    await dialog.getByLabel('date', { exact: true }).fill('2026-10-28');

    // The composed preview renders in the created type's own mode: the
    // filled markdown as prose, before the create runs.
    const pane = dialog.locator('[data-file-payload-viewer][data-viewer-mode="text"]');
    await expect(pane).toBeVisible({ timeout: 30_000 });
    await expect(pane).toContainText('Perigram');
    await expect(pane).toContainText('2026-10-28');

    await dialog.locator('.p-dialog-footer').getByRole('button').last().click();

    let composedRow = null;
    for (let attempt = 0; attempt < 20 && !composedRow; attempt += 1) {
      const rows = await (await app.request.get('/api/instances/text-document')).json();
      composedRow = (Array.isArray(rows) ? rows : []).find(row => row.name === 'offer-composed');
      if (!composedRow) await app.page.waitForTimeout(1000);
    }
    expect(composedRow, 'the dialog run created the composed instance').toBeTruthy();
    const fileId = composedRow?.payload?.fileId || composedRow?.payload?.id;
    expect(fileId).toBeTruthy();
    const fileResponse = await app.request.get(`/api/files/download/${encodeURIComponent(String(fileId))}?bucket=files`);
    expect(fileResponse.ok(), await fileResponse.text()).toBeTruthy();
    const composedText = await fileResponse.text();
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir('.playwright', { recursive: true });
    await writeFile('.playwright/md-fill-composed.md', composedText);

    expect(composedText).toContain('# Offer Perigram');
    expect(composedText).not.toContain('{client}');
  });

  test('the XLSX fill dialog expands repeat-section JSON into workbook rows', async ({ app }) => {
    test.setTimeout(240_000);
    await app.installPlugins(['tech-drawing', 'documents']);
    await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');

    let rpcId = 0;
    const call = async (name, args) => {
      const response = await app.request.post('/api/mcp', {
        data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const payload = await response.json();
      return JSON.parse((payload.result?.content || []).map(part => part.text ?? '').join('\n'));
    };

    await call('create_process_definition', { name: 'XLSX repeat fill draft' });
    const vocab = await call('get_authoring_vocabulary', {});
    const roleId = vocab.roles?.[0]?.id;
    const grant = { access: { grants: [{ roleId, level: 'write' }] } };
    const composed = await call('compose_process_definition', {
      name: 'XLSX repeat fill probe',
      steps: [
        { op: 'drop', item: 'construct', id: 'up' },
        { op: 'declareTypeRef', id: 'book', typeId: 'xlsx-workbook' },
        { op: 'wireDeclaration', from: 'book', to: 'up', role: 'binds' },
        { op: 'configure', id: 'up', values: { construction: { mode: 'upload' } } },
        { op: 'configure', id: 'up', values: grant },
        { op: 'drop', item: 'construct', id: 'fill' },
        { op: 'wireDeclaration', from: 'book', to: 'fill', role: 'binds' },
        { op: 'configure', id: 'fill', values: { construction: { mode: 'fill' } } },
        { op: 'configure', id: 'fill', values: grant }
      ]
    });
    await call('activate_process_definition', { definitionId: composed.id || composed._id });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Report', '{title}'],
      ['{#items}'],
      ['{name}', '{qty}'],
      ['{/items}'],
      ['Total', '{total}']
    ]), 'Report');
    const workbookBytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const uploadResponse = await app.request.post('/api/files/upload?bucket=files', {
      multipart: { file: {
        name: 'repeat-items.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: workbookBytes
      } }
    });
    expect(uploadResponse.ok(), await uploadResponse.text()).toBeTruthy();
    const blob = await uploadResponse.json();
    await call('run_action', {
      actionId: 'up',
      data: { payload: {
        fileId: blob.id,
        name: 'repeat-items.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: workbookBytes.length
      } }
    });

    await app.gotoClient('/screens/auto_xlsx-workbook');
    const main = app.page.locator('main');
    const modeSelect = main.getByLabel('Creation mode');
    await expect(modeSelect).toBeVisible({ timeout: 30_000 });
    await expect(async () => {
      await modeSelect.click();
      await app.page.waitForTimeout(400);
      await app.page.getByRole('option', { name: 'Fill', exact: true }).click();
      await expect(modeSelect).toContainText('Fill');
    }).toPass({ timeout: 30_000 });
    await main.locator('.p-inputgroup').getByRole('button').last().click();

    const dialog = app.page.locator('.p-dialog').first();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').first().fill('repeat-items-filled');
    const templateInput = dialog.locator('.p-autocomplete input');
    await templateInput.fill('repeat-items');
    await app.page.locator('.p-autocomplete-item, [role="option"]', { hasText: 'repeat-items' }).first().click();

    await expect(dialog.getByLabel('items', { exact: true })).toBeVisible({ timeout: 30_000 });
    await dialog.getByLabel('title', { exact: true }).fill('Quarterly report');
    await dialog.getByLabel('total', { exact: true }).fill('5');
    const itemsInput = dialog.getByLabel('items', { exact: true });
    await itemsInput.fill('[{"name":');
    await expect(dialog.getByText('Section value must be a valid JSON array.')).toBeVisible();
    await itemsInput.fill(JSON.stringify([
      { name: 'Part A', qty: 2 },
      { name: 'Part B', qty: 3 }
    ], null, 2));
    await expect(dialog.getByText('Section value must be a valid JSON array.')).toHaveCount(0);

    const previewPane = dialog.locator('[data-file-payload-viewer]');
    await expect(previewPane).toBeVisible({ timeout: 30_000 });
    await expect(previewPane).toContainText('Part A');
    await expect(previewPane).toContainText('Part B');
    await dialog.locator('.p-dialog-footer').getByRole('button').last().click();

    let created = null;
    for (let attempt = 0; attempt < 20 && !created; attempt += 1) {
      const rows = await (await app.request.get('/api/instances/xlsx-workbook')).json();
      created = (Array.isArray(rows) ? rows : []).find(row => row.name === 'repeat-items-filled');
      if (!created) await app.page.waitForTimeout(1000);
    }
    expect(created, 'the repeat-section dialog run created the workbook instance').toBeTruthy();
    const fileId = created?.payload?.fileId || created?.payload?.id;
    expect(fileId).toBeTruthy();
    const fileResponse = await app.request.get('/api/files/download/' + encodeURIComponent(String(fileId)) + '?bucket=files');
    expect(fileResponse.ok(), await fileResponse.text()).toBeTruthy();
    const filled = XLSX.read(await fileResponse.body(), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(filled.Sheets[filled.SheetNames[0]], { header: 1, raw: false });
    expect(rows).toEqual([
      ['Report', 'Quarterly report'],
      ['Part A', '2'],
      ['Part B', '3'],
      ['Total', '5']
    ]);
    await app.expectCleanRuntime();
  });
});
