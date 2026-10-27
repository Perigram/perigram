import { test, expect } from './fixtures.js';

// The place construction (tech-drawing `place-dxf`) driven through its
// generated create dialog: the mode select opens the place form, the
// template and parts operator inputs render as instance pickers, and the
// submitted draft scalarizes to bare ids the placement service accepts.
// Authoring and instance seeding ride the MCP tool surface; the dialog is
// the UI under test. Artifact: the composed DXF under .playwright/.

const TEMPLATE = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LINE', '8', 'FRAME', '10', '10.0', '20', '10.0', '11', '410.0', '21', '10.0',
  '0', 'LINE', '8', 'FRAME', '10', '410.0', '20', '10.0', '11', '410.0', '21', '287.0',
  '0', 'LINE', '8', 'FRAME', '10', '410.0', '20', '287.0', '11', '10.0', '21', '287.0',
  '0', 'LINE', '8', 'FRAME', '10', '10.0', '20', '287.0', '11', '10.0', '21', '10.0',
  '0', 'TEXT', '8', 'STAMP', '10', '280.0', '20', '26.0', '40', '4.0', '1', 'PLACE DIALOG E2E',
  '0', 'TEXT', '8', 'SPOT', '10', '60.0', '20', '80.0', '40', '5.0', '1', '{spot:bracket}',
  '0', 'ENDSEC', '0', 'EOF'
].join('\n');

const PART = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LINE', '8', 'OUTLINE', '10', '0.0', '20', '0.0', '11', '60.0', '21', '0.0',
  '0', 'LINE', '8', 'OUTLINE', '10', '60.0', '20', '0.0', '11', '60.0', '21', '40.0',
  '0', 'LINE', '8', 'OUTLINE', '10', '60.0', '20', '40.0', '11', '0.0', '21', '40.0',
  '0', 'LINE', '8', 'OUTLINE', '10', '0.0', '20', '40.0', '11', '0.0', '21', '0.0',
  '0', 'CIRCLE', '8', 'HOLES', '10', '10.0', '20', '10.0', '40', '4.0',
  '0', 'CIRCLE', '8', 'HOLES', '10', '50.0', '20', '10.0', '40', '4.0',
  '0', 'ENDSEC', '0', 'EOF'
].join('\n');

test.describe('tech-drawing place dialog', () => {
  test('the place create form picks template and parts and composes the DXF', async ({ app }) => {
    test.setTimeout(240_000);
    await app.installPlugins(['tech-drawing']);
    await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');

    // --- authoring through the MCP surface: upload + place constructs ---
    let rpcId = 0;
    const mcp = (method, params) => app.request.post('/api/mcp', {
      data: { jsonrpc: '2.0', id: ++rpcId, method, params }
    });
    const call = async (name, args) => {
      const response = await mcp('tools/call', { name, arguments: args });
      expect(response.ok(), await response.text()).toBeTruthy();
      const payload = await response.json();
      const text = (payload.result?.content || []).map(part => part.text ?? '').join('\n');
      return JSON.parse(text);
    };

    await call('create_process_definition', { name: 'Bare place-dialog draft' });
    const vocab = await call('get_authoring_vocabulary', {});
    const roleId = vocab.roles?.[0]?.id;
    expect(roleId, 'no organization role for the construct lane').toBeTruthy();
    const grant = { access: { grants: [{ roleId, level: 'write' }] } };
    const composed = await call('compose_process_definition', {
      name: 'Place dialog probe',
      steps: [
        { op: 'drop', item: 'construct', id: 'up' },
        { op: 'declareTypeRef', id: 'dxf', typeId: 'dxf-source' },
        { op: 'wireDeclaration', from: 'dxf', to: 'up', role: 'binds' },
        { op: 'configure', id: 'up', values: { construction: { mode: 'upload' } } },
        { op: 'configure', id: 'up', values: grant },
        { op: 'drop', item: 'construct', id: 'place' },
        { op: 'wireDeclaration', from: 'dxf', to: 'place', role: 'binds' },
        { op: 'configure', id: 'place', values: { construction: { mode: 'place' } } },
        { op: 'configure', id: 'place', values: grant }
      ]
    });
    const definitionId = composed.id || composed._id;
    const validation = await call('validate_process_definition', { definitionId });
    expect(validation.errors || []).toEqual([]);
    await call('activate_process_definition', { definitionId });

    // --- seed the template and the part through the compiled upload action ---
    const uploadBlob = async (text, filename) => {
      const response = await app.request.post('/api/files/upload?bucket=files', {
        multipart: { file: { name: filename, mimeType: 'application/dxf', buffer: Buffer.from(text) } }
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return await response.json();
    };
    const runUpload = async name => {
      const text = name === 'frame' ? TEMPLATE : PART;
      const blob = await uploadBlob(text, `${name}.dxf`);
      const run = await call('run_action', {
        actionId: 'up',
        data: { name, payload: { fileId: blob.id, mime: 'application/dxf', size: text.length } }
      });
      return (run.created || run.instance || run)._id;
    };
    await runUpload('frame');
    await runUpload('bracket');

    // --- the dialog under test ---
    await app.gotoClient('/screens/auto_dxf-source');
    const main = app.page.locator('main');

    const modeSelect = main.getByLabel('Creation mode');
    await expect(modeSelect).toBeVisible({ timeout: 30_000 });
    await modeSelect.click();
    await app.page.getByRole('option', { name: 'Place', exact: true }).click();
    await main.locator('.p-inputgroup').getByRole('button').last().click();

    const dialog = app.page.locator('.p-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('template')).toBeVisible();
    await expect(dialog.getByText('parts')).toBeVisible();

    await dialog.getByRole('textbox').first().fill('composed-dialog');

    const templateInput = dialog.locator('.p-autocomplete input');
    await templateInput.fill('frame');
    await app.page.locator('.p-autocomplete-item, [role="option"]', { hasText: 'frame' }).first().click();

    await dialog.locator('.p-multiselect').click();
    await app.page.getByRole('option', { hasText: 'bracket' }).first().click();
    await app.page.keyboard.press('Escape');

    await dialog.locator('.p-dialog-footer').getByRole('button').last().click();

    // --- the composed file: marker gone, part translated, stamp kept ---
    const listResponse = await app.request.get('/api/instances/dxf-source');
    expect(listResponse.ok(), await listResponse.text()).toBeTruthy();
    const rows = await listResponse.json();
    const composedRow = (Array.isArray(rows) ? rows : []).find(row => row.name === 'composed-dialog');
    expect(composedRow, 'the dialog run created the composed instance').toBeTruthy();
    const fileId = composedRow?.payload?.fileId || composedRow?.payload?.id;
    expect(fileId).toBeTruthy();
    const fileResponse = await app.request.get(`/api/files/download/${encodeURIComponent(String(fileId))}?bucket=files`);
    expect(fileResponse.ok(), await fileResponse.text()).toBeTruthy();
    const composed = await fileResponse.text();
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir('.playwright', { recursive: true });
    await writeFile('.playwright/place-dialog-composed.dxf', composed);

    expect(composed).not.toContain('{spot:');
    expect(composed).toContain('PLACE DIALOG E2E');
    expect(composed).toContain('0\nCIRCLE\n8\nHOLES\n10\n70\n20\n90\n40\n4.0');
    expect(composed).toContain('0\nCIRCLE\n8\nHOLES\n10\n110\n20\n90\n40\n4.0');
  });
});
