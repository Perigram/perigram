import { test, expect } from './fixtures.js';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '#packages/cts/src/index.js';
import { facadeDomain, facadePackContent } from '#packages/facade/src/index.js';
import { documentsPack } from '#packages/documents/src/index.js';
import { techDrawingPack } from '#packages/tech-drawing/src/index.js';
import { orderOrgTypeDeclarations } from '../server/packs/facade/order-process-declarations.js';
import { composeOrderProcessDefinition } from '../server/packs/facade/order-process.js';

const PROCESS_NAME = 'E2E composed order process';
const TABLE_TYPE = 'xlsx-workbook';

// The projected domain the composition authors against: the same mounted
// declaration set the app composes (framework + documents +
// tech-drawing + facade), the order vocabulary, and the pack services.
function projectedDomain(organizationId) {
  const registry = createTypeRegistry({ id: 'e2e-order-process' });
  for (const declaration of [
    ...frameworkTypes,
    ...documentsPack.types,
    ...techDrawingPack.types,
    ...facadePackContent.types,
    ...orderOrgTypeDeclarations()
  ]) {
    registry.defineType(declaration);
  }
  const packServices = [
    ...(documentsPack.services || []),
    ...(techDrawingPack.services || []),
    ...(facadePackContent.services || [])
  ];
  return projectDomainFromView(registry, organizationId, facadeDomain, { packServices });
}

test('the headlessly composed order process activates and loads in the designer', async ({ app, request }, testInfo) => {
  test.setTimeout(180_000);

  const me = await (await app.request.get('/api/auth/me')).json();
  const organizationId = me.lineage?.organizationId || me.organizationId;
  expect(organizationId).toBeTruthy();
  const organization = await (await app.request.get(`/api/organizations/${organizationId}`)).json();
  const roles = Object.values(organization?.data?.roles || {});
  const adminRole = roles.find(role => String(role.label || '').toLowerCase() === 'admin') || roles[0];
  expect(adminRole?.id, 'the e2e organization declares roles').toBeTruthy();

  for (const declaration of orderOrgTypeDeclarations()) {
    const response = await app.request.post('/api/admin/cts/types', { data: declaration });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  // The definition is born headless: palette drops, inspector writes,
  // port-gated connections — no browser, no forged records.
  const composed = composeOrderProcessDefinition(projectedDomain(organizationId), TABLE_TYPE);
  for (const node of Object.values(composed.processNodes || {})) {
    for (const grant of node.access?.grants || []) {
      if (grant.roleId === 'role_admin') grant.roleId = adminRole.id;
    }
  }

  const existing = await (await app.request.get('/api/process-definitions')).json();
  const prior = (Array.isArray(existing) ? existing : existing?.items || [])
    .find(item => item?.identity?.name === PROCESS_NAME || item?.name === PROCESS_NAME);

  let definitionId;
  if (prior?._id) {
    const updated = await app.request.patch(`/api/process-definitions/${prior._id}`, {
      data: { name: PROCESS_NAME, data: composed }
    });
    expect(updated.ok(), await updated.text()).toBeTruthy();
    definitionId = prior._id;
  } else {
    const created = await app.request.post('/api/process-definitions', {
      data: { name: PROCESS_NAME, data: composed }
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    definitionId = (await created.json())?._id;
  }
  expect(definitionId).toBeTruthy();
  app.trackCleanup(async () => {
    await app.request.post(`/api/process-definitions/${definitionId}/deactivate`, { failOnStatusCode: false });
    await app.request.delete(`/api/process-definitions/${definitionId}`, { failOnStatusCode: false });
  });

  // The platform's own activation gate accepts the composed definition.
  const validated = await app.request.post(`/api/process-definitions/${definitionId}/validate`);
  expect(validated.ok(), await validated.text()).toBeTruthy();
  const activated = await app.request.post(`/api/process-definitions/${definitionId}/activate`);
  expect(activated.ok(), await activated.text()).toBeTruthy();

  // THE LIVE RUN: a real cassette template, a real uploaded xlsx table,
  // and the exposed manual action executed through the active-process
  // action endpoint.
  await app.seedSpeciesProcess({ types: ['xlsx-workbook', 'cassette'], via: { 'xlsx-workbook': 'upload', cassette: 'editor' } });
  const { createDefaultOccsCassetteTemplateDefinition } = await import('../utils/occs/templates.js');
  const templateRun = await app.request.post('/api/admin/commands/saveCassetteTemplate/run', {
    data: {
      entities: {},
      parameters: {
        name: `Tray 600 ${Date.now()}`,
        type: 'PARAMETRIC',
        definition: createDefaultOccsCassetteTemplateDefinition(),
        parameters: []
      }
    }
  });
  expect(templateRun.ok(), await templateRun.text()).toBeTruthy();
  const templateRunResult = await templateRun.json();
  const template = templateRunResult?.entities?.cassette ?? templateRunResult?.created ?? templateRunResult;
  const templateName = template?.identity?.name ?? template?.name;
  expect(templateName, 'the command produced a named cassette template').toBeTruthy();

  const { utils, write } = await import('xlsx');
  const sheet = utils.aoa_to_sheet([
    ['name', 'cassette', 'A', 'B'],
    ['Tray A left', templateName, 600, 450],
    ['Tray B small', templateName, 300, 300]
  ]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'Order');
  const tableBuffer = Buffer.from(write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  const tableUpload = await app.request.post('/api/files/upload?bucket=files', {
    multipart: {
      file: {
        name: 'order-42.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: tableBuffer
      }
    }
  });
  expect(tableUpload.ok(), await tableUpload.text()).toBeTruthy();
  const tableFile = await tableUpload.json();
  const table = await app.createInstance('xlsx-workbook', {
    name: `Order table 42 ${Date.now()}`,
    payload: { fileId: tableFile.id, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: tableBuffer.length }
  });

  const executed = await app.request.post('/api/process-definitions/active/actions/order/execute', {
    data: {
      'data.name': 'Facade order 42',
      'relations.table': { type: 'xlsx-workbook', id: table._id?.toString?.() || table._id || table.id }
    }
  });
  expect(executed.ok(), await executed.text()).toBeTruthy();

  const instancesOf = async typeId => (await (await app.request.get(`/api/instances/${typeId}`)).json()).items ?? [];
  const orderIdOf = instance => instance?.lineage?.orderId?.toString?.() ?? String(instance?.lineage?.orderId ?? '');
  const orders = (await instancesOf('facade-order'))
    .filter(order => order.name === 'Facade order 42')
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  expect(orders.length).toBeGreaterThanOrEqual(1);
  const orderId = orders[0]._id?.toString?.() || String(orders[0]._id);
  const designs = (await instancesOf('cassette-design')).filter(design => orderIdOf(design) === orderId);
  expect(designs.map(design => design.name)).toEqual(['Tray A left', 'Tray B small']);
  const materials = (await instancesOf('sheet-material')).filter(material => orderIdOf(material) === orderId);
  expect(materials.map(material => material.fields?.code ?? material.data?.code)).toEqual(['ACM-1250x2500-04', 'ACM-1500x3000-06']);
  const attempts = (await instancesOf('nesting-attempt')).filter(attempt => orderIdOf(attempt) === orderId);
  expect(attempts).toHaveLength(2);
  for (const attempt of attempts) {
    const result = attempt.fields?.result ?? attempt.data?.result;
    expect(result?.summary?.sheetCount).toBeGreaterThan(0);
  }

  // The designer loads it as a first-class draft: nodes render with
  // their catalog labels, the loop pair lands together, and the page
  // stays clean (no console/page errors — the fixture asserts them).
  await app.gotoClient('/organization/process');
  await expect(app.page.locator('.process-designer-canvas, [data-vue-flow-container], .vue-flow').first()).toBeVisible({ timeout: 20_000 });

  await app.page.getByRole('tab', { name: 'Definitions' }).click();
  const row = app.page.getByText(PROCESS_NAME).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();

  const canvas = app.page.locator('.process-designer-canvas, .vue-flow').first();
  await expect(canvas.getByText('Nesting solver').first()).toBeVisible({ timeout: 20_000 });
  await expect(canvas.getByText('Join by key').first()).toBeVisible();
  await expect(canvas.getByText('For each entity').first()).toBeVisible();

  const saved = await app.request.get(`/api/process-definitions/${definitionId}`);
  const definition = await saved.json();
  const kinds = Object.values(definition.data?.processNodes || {}).map(node => node.kind);
  await testInfo.attach('order-process-e2e.json', {
    body: JSON.stringify({
      definitionId,
      name: PROCESS_NAME,
      activationState: definition.status?.state,
      tableType: TABLE_TYPE,
      liveRun: {
        action: 'order',
        orderName: 'Facade order 42',
        cassetteDesigns: designs.map(design => ({ name: design.name })),
        materials: materials.length,
        nestingAttempts: attempts.map(attempt => ({
          summary: (attempt.fields?.result ?? attempt.data?.result)?.summary
        }))
      },
      nodeKinds: kinds,
      nodeCount: kinds.length,
      edgeCount: (definition.data?.graph?.edges || []).length,
      loopPair: kinds.includes('control.forEach') && kinds.includes('control.forEachEnd')
    }, null, 2),
    contentType: 'application/json'
  });

  await app.expectCleanRuntime();
});
