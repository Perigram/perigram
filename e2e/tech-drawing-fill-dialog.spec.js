import { test, expect } from './fixtures.js';

// The fill construction (tech-drawing `place-dxf`) driven through its
// generated create dialog: the mode select opens the fill form, the
// template and parts operator inputs render as instance pickers, and the
// submitted draft scalarizes to bare ids the placement service accepts.
// Authoring and instance seeding ride the MCP tool surface; the dialog is
// the UI under test. Artifacts: the composed DXFs under .playwright/.

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

test.describe('tech-drawing fill dialog', () => {
  test('the fill create form picks template and parts and composes the DXF', async ({ app }) => {
    test.setTimeout(240_000);
    await app.installPlugins(['tech-drawing']);
    await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');

    // --- authoring through the MCP surface: upload + fill constructs ---
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

    await call('create_process_definition', { name: 'Bare fill-dialog draft' });
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
        { op: 'drop', item: 'construct', id: 'fill' },
        { op: 'wireDeclaration', from: 'dxf', to: 'fill', role: 'binds' },
        { op: 'configure', id: 'fill', values: { construction: { mode: 'fill' } } },
        { op: 'configure', id: 'fill', values: grant }
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
        data: { payload: { fileId: blob.id, name: `${name}.dxf`, mime: 'application/dxf', size: text.length } }
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
    await app.page.getByRole('option', { name: 'Fill', exact: true }).click();
    await main.locator('.p-inputgroup').getByRole('button').last().click();

    const dialog = app.page.locator('.p-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Template', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Parts')).toBeVisible();

    await dialog.getByRole('textbox').first().fill('composed-dialog');

    const templateInput = dialog.locator('.p-autocomplete input');
    await templateInput.fill('frame');
    await app.page.locator('.p-autocomplete-item, [role="option"]', { hasText: 'frame' }).first().click();
    // The selected template renders its label — the picker's model is the
    // instance ref, the input never shows the raw object.
    await expect(templateInput).toHaveValue(/frame/);

    // The parts row is the per-spot assignment (SPEC §24): the template's
    // anchors list, name-equal parts prefilled — spot `bracket` takes the
    // same-named part without a click.
    await expect(dialog.getByText('bracket', { exact: true })).toBeVisible({ timeout: 15_000 });

    await dialog.locator('.p-dialog-footer').getByRole('button').last().click();

    // --- the composed file: marker gone, part translated, stamp kept ---
    // The dialog's run is fire-and-forget client-side; the created toast is
    // its completion signal, so the list read polls briefly.
    let composedRow = null;
    for (let attempt = 0; attempt < 20 && !composedRow; attempt += 1) {
      const listResponse = await app.request.get('/api/instances/dxf-source');
      expect(listResponse.ok(), await listResponse.text()).toBeTruthy();
      const rows = await listResponse.json();
      composedRow = (Array.isArray(rows) ? rows : []).find(row => row.name === 'composed-dialog');
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
    await writeFile('.playwright/fill-dialog-composed.dxf', composedText);

    expect(composedText).not.toContain('{spot:');
    expect(composedText).toContain('PLACE DIALOG E2E');
    expect(composedText).toContain('0\nCIRCLE\n8\nHOLES\n10\n70\n20\n90\n40\n4.0');
    expect(composedText).toContain('0\nCIRCLE\n8\nHOLES\n10\n110\n20\n90\n40\n4.0');
  });

  test('a structured refusal keeps the dialog open and names the offenders (SPEC §24)', async ({ app }) => {
    test.setTimeout(180_000);
    await app.installPlugins(['tech-drawing']);
    await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');

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

    await call('create_process_definition', { name: 'Refusal dialog draft' });
    const vocab = await call('get_authoring_vocabulary', {});
    const roleId = vocab.roles?.[0]?.id;
    const grant = { access: { grants: [{ roleId, level: 'write' }] } };
    const composed = await call('compose_process_definition', {
      name: 'Refusal dialog probe',
      steps: [
        { op: 'drop', item: 'construct', id: 'up' },
        { op: 'declareTypeRef', id: 'dxf', typeId: 'dxf-source' },
        { op: 'wireDeclaration', from: 'dxf', to: 'up', role: 'binds' },
        { op: 'configure', id: 'up', values: { construction: { mode: 'upload' } } },
        { op: 'configure', id: 'up', values: grant },
        { op: 'drop', item: 'construct', id: 'fill' },
        { op: 'wireDeclaration', from: 'dxf', to: 'fill', role: 'binds' },
        { op: 'configure', id: 'fill', values: { construction: { mode: 'fill' } } },
        { op: 'configure', id: 'fill', values: grant }
      ]
    });
    await call('activate_process_definition', { definitionId: composed.id || composed._id });

    const upload = async (text, filename) => {
      const response = await app.request.post('/api/files/upload?bucket=files', {
        multipart: { file: { name: filename, mimeType: 'application/dxf', buffer: Buffer.from(text) } }
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return await response.json();
    };
    // The template carries two markers; the sole part matches neither.
    const twoSpots = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'TEXT', '8', 'SPOT', '10', '40.0', '20', '40.0', '40', '5.0', '1', '{spot:alpha}',
      '0', 'TEXT', '8', 'SPOT', '10', '80.0', '20', '80.0', '40', '5.0', '1', '{spot:beta}',
      '0', 'ENDSEC', '0', 'EOF'
    ].join('\n');
    const onePart = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LINE', '8', 'OUTLINE', '10', '0.0', '20', '0.0', '11', '30.0', '21', '0.0',
      '0', 'ENDSEC', '0', 'EOF'
    ].join('\n');
    const runUpload = async (text, name) => {
      const blob = await upload(text, `${name}.dxf`);
      const run = await call('run_action', {
        actionId: 'up',
        data: { payload: { fileId: blob.id, name: `${name}.dxf`, mime: 'application/dxf', size: text.length } }
      });
      return (run.created || run.instance || run)._id;
    };
    const templateId = await runUpload(twoSpots, 'two-spots');
    const partId = await runUpload(onePart, 'gamma');

    await app.gotoClient('/screens/auto_dxf-source');
    const main = app.page.locator('main');
    const modeSelect = main.getByLabel('Creation mode');
    await expect(modeSelect).toBeVisible({ timeout: 30_000 });
    await modeSelect.click();
    await app.page.getByRole('option', { name: 'Fill', exact: true }).click();
    await main.locator('.p-inputgroup').getByRole('button').last().click();

    const dialog = app.page.locator('.p-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').first().fill('refused');

    const templateInput = dialog.locator('.p-autocomplete input');
    await templateInput.fill('two-spots');
    await app.page.locator('.p-autocomplete-item, [role="option"]', { hasText: 'two-spots' }).first().click();

    // The template's anchors list with no name match: nothing prefills.
    await expect(dialog.getByText('alpha', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText('beta', { exact: true })).toBeVisible();

    // The widget gates incomplete assignments before submit (Create stays
    // disabled while a spot has no part); the refusal contract is the
    // API's — an incomplete explicit assignment refuses naming the open
    // anchor.
    await expect(dialog.locator('.p-dialog-footer').getByRole('button').last()).toBeDisabled();
    const refusal = await app.request.post('/api/process-definitions/active/actions/fill/execute', {
      data: { data: { template: templateId, parts: [{ id: partId, spot: 'alpha' }] } },
      failOnStatusCode: false
    });
    expect(refusal.status()).toBe(422);
    const body = await refusal.json();
    expect(body.data.failures).toContainEqual({ name: 'beta', message: 'spot beta has no matching part' });

    // The refusal created nothing: the dialog's record never landed, the
    // two uploads stay.
    const rows = await (await app.request.get('/api/instances/dxf-source')).json();
    const names = (Array.isArray(rows) ? rows : []).map(row => row.name);
    expect(names).not.toContain('refused');
    expect(names.filter(name => name === 'gamma' || name === 'two-spots').sort()).toEqual(['gamma', 'two-spots']);
  });
});

test.describe('fill dialog rails (SPEC §24, owner direction 2026-10-28)', () => {
  test('the dialog previews the composition, creates a part inline, and opens the editor', async ({ app }) => {
    test.setTimeout(300_000);
    await app.installPlugins(['tech-drawing']);
    await app.connectPlugin('tech-drawing', 'http://tech-drawing-executor:8792');

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

    await call('create_process_definition', { name: 'Rails dialog draft' });
    const vocab = await call('get_authoring_vocabulary', {});
    const roleId = vocab.roles?.[0]?.id;
    const grant = { access: { grants: [{ roleId, level: 'write' }] } };
    const composed = await call('compose_process_definition', {
      name: 'Rails dialog probe',
      steps: [
        { op: 'drop', item: 'construct', id: 'up' },
        { op: 'declareTypeRef', id: 'dxf', typeId: 'dxf-source' },
        { op: 'wireDeclaration', from: 'dxf', to: 'up', role: 'binds' },
        { op: 'configure', id: 'up', values: { construction: { mode: 'upload' } } },
        { op: 'configure', id: 'up', values: grant },
        { op: 'drop', item: 'construct', id: 'fill' },
        { op: 'wireDeclaration', from: 'dxf', to: 'fill', role: 'binds' },
        { op: 'configure', id: 'fill', values: { construction: { mode: 'fill' } } },
        { op: 'configure', id: 'fill', values: grant }
      ]
    });
    await call('activate_process_definition', { definitionId: composed.id || composed._id });

    const upload = async (text, filename) => {
      const response = await app.request.post('/api/files/upload?bucket=files', {
        multipart: { file: { name: filename, mimeType: 'application/dxf', buffer: Buffer.from(text) } }
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return await response.json();
    };
    const runUpload = async (text, name) => {
      const blob = await upload(text, `${name}.dxf`);
      const run = await call('run_action', {
        actionId: 'up',
        data: { payload: { fileId: blob.id, name: `${name}.dxf`, mime: 'application/dxf', size: text.length } }
      });
      return (run.created || run.instance || run)._id;
    };
    const railsTemplate = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LINE', '8', 'FRAME', '10', '0.0', '20', '0.0', '11', '200.0', '21', '0.0',
      '0', 'LINE', '8', 'FRAME', '10', '200.0', '20', '0.0', '11', '200.0', '21', '120.0',
      '0', 'LINE', '8', 'FRAME', '10', '200.0', '20', '120.0', '11', '0.0', '21', '120.0',
      '0', 'LINE', '8', 'FRAME', '10', '0.0', '20', '120.0', '11', '0.0', '21', '0.0',
      '0', 'TEXT', '8', 'SPOT', '10', '40.0', '20', '40.0', '40', '5.0', '1', '{spot:alpha}',
      '0', 'ENDSEC', '0', 'EOF'
    ].join('\n');
    const templateId = await runUpload(railsTemplate, 'rails-tpl');

    await app.gotoClient('/screens/auto_dxf-source');
    const main = app.page.locator('main');
    const modeSelect = main.getByLabel('Creation mode');
    await expect(modeSelect).toBeVisible({ timeout: 30_000 });
    await modeSelect.click();
    await app.page.getByRole('option', { name: 'Fill', exact: true }).click();
    await main.locator('.p-inputgroup').getByRole('button').last().click();

    const dialog = app.page.locator('.p-dialog').first();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').first().fill('rails-composed');

    const templateInput = dialog.locator('.p-autocomplete input');
    await templateInput.fill('rails-tpl');
    await app.page.locator('.p-autocomplete-item, [role="option"]', { hasText: 'rails-tpl' }).first().click();

    // The spot row reads the template's anchors through the plugin's
    // served surface module (the single parse home).
    await expect(dialog.getByText('alpha', { exact: true })).toBeVisible({ timeout: 15_000 });

    // The parts affordance creates inline by the compiled upload create
    // — the bytes travel the files channel, the created part lands in the
    // pool, the assignment row offers it, and the explicit pick selects
    // it.
    const partText = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'CIRCLE', '8', 'HOLES', '10', '10.0', '20', '10.0', '40', '3.0',
      '0', 'ENDSEC', '0', 'EOF'
    ].join('\n');
    const fileChooser = app.page.waitForEvent('filechooser');
    await dialog.locator('.p-dialog-content').getByRole('button', { name: 'Create', exact: true }).last().click();
    await app.page.getByRole('menuitem', { name: /Upload/ }).click();
    const chooser = await fileChooser;
    await chooser.setFiles({ name: 'alpha.dxf', mimeType: 'application/dxf', buffer: Buffer.from(partText) });

    const alphaSelect = dialog.locator('.p-select').first();
    // The opening panel animates: an immediate option click lands on the
    // first row's coordinates. The settle wait plus the retrying block
    // rides out both the animation and the pool re-render.
    await expect(async () => {
      await alphaSelect.click();
      await app.page.waitForTimeout(400);
      const alphaOption = app.page.locator('.p-select-list-container li', { hasText: 'alpha' }).first();
      await expect(alphaOption).toBeVisible({ timeout: 15_000 });
      await alphaOption.click();
      await expect(alphaSelect).toContainText('alpha');
    }).toPass({ timeout: 40_000 });
    const poolRows = await (await app.request.get('/api/instances/dxf-source')).json();
    const alphaPartId = (Array.isArray(poolRows) ? poolRows : []).find(row => row.name === 'alpha')?._id;
    expect(alphaPartId, 'the inline upload created the part').toBeTruthy();

    // The composed preview renders before the create runs — the actual
    // template with the part placed (DrawingCanvas draws SVG geometry).
    await expect(dialog.locator('[data-file-payload-viewer][data-viewer-mode="dxf"] svg')).toBeVisible({ timeout: 30_000 });
    const preview = await app.request.post('/api/instances/dxf-source/construction-preview', {
      data: { mode: 'fill', draft: { name: 'rails-composed', template: templateId, parts: [{ id: alphaPartId, spot: 'alpha' }] } },
      failOnStatusCode: false
    });
    expect(preview.status(), await preview.text()).toBe(200);
    const previewBody = await preview.json();
    expect(previewBody.payload?.mime).toBe('application/dxf');
    const previewText = Buffer.from(previewBody.payload.base64, 'base64').toString('utf8');
    expect(previewText).not.toContain('{spot:');
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir('.playwright', { recursive: true });
    await writeFile('.playwright/rails-preview-composed.dxf', previewText);
    const before = await (await app.request.get('/api/instances/dxf-source')).json();
    expect((Array.isArray(before) ? before : []).map(row => row.name)).not.toContain('rails-composed');

    // The edit affordance opens the DXF editor beside the picked
    // template; a canvas click picks the anchor point, the marker saves
    // through the revisioned channel.
    await dialog.locator('.p-dialog-content').getByRole('button', { name: 'Edit', exact: true }).first().click();
    const editorGrid = app.page.getByText(/Anchors · \d/).locator('xpath=ancestor::div[contains(@class, "grid")]');
    await expect(editorGrid).toBeVisible({ timeout: 60_000 });
    const editorCanvas = editorGrid.locator('canvas').first();
    await expect(editorCanvas).toBeVisible({ timeout: 60_000 });
    const box = await editorCanvas.boundingBox();
    expect(box).toBeTruthy();
    await app.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const xInput = app.page.locator('#dxf-marker-x');
    await expect(xInput).not.toHaveValue('', { timeout: 10_000 });
    await app.page.getByPlaceholder('Anchor name').fill('gamma');
    await app.page.getByRole('button', { name: 'Add anchor', exact: true }).click();
    await expect(app.page.getByLabel('Anchor name')).toHaveCount(3, { timeout: 10_000 });
    await app.page.getByRole('button', { name: 'Save', exact: true }).click();
    // The save button re-disables when the revisioned commit lands.
    await expect(app.page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled({ timeout: 20_000 });

    let templateText = '';
    for (let attempt = 0; attempt < 40 && !templateText; attempt += 1) {
      const rows = await (await app.request.get('/api/instances/dxf-source')).json();
      const record = (Array.isArray(rows) ? rows : []).find(row => row._id === templateId || row.id === templateId);
      const fileId = record?.payload?.fileId || record?.payload?.id;
      if (!fileId) { await app.page.waitForTimeout(1000); continue; }
      const response = await app.request.get(`/api/files/download/${encodeURIComponent(String(fileId))}?bucket=files`);
      if (response.ok()) templateText = await response.text(); else await app.page.waitForTimeout(1000);
    }
    expect(templateText).toContain('{spot:gamma}');
    expect(templateText).toContain('{spot:alpha}');
    await writeFile('.playwright/rails-template-reauthored.dxf', templateText);
  });
});
