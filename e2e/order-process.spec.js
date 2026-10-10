// The composed order process, LIVE: a real cassette template (payload
// home), a real uploaded xlsx order table, and the org-authored process
// activated and executed through the active-action endpoint — the
// produced container, baked cassette-design children, declared materials,
// and per-material nesting runs asserted on the running stack. The
// composition is the shared seam fixture (test-data/order-process-authoring.js):
// the same palette drops and wires the designer authors.
import { test, expect } from './fixtures.js';
import { writeFileSync } from 'node:fs';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '#packages/cts/src/index.js';
import { facadeDomain, facadePackContent } from '../test-tools/facade-plugin.js';
import { documentsPack } from '#packages/documents/src/index.js';
import { techDrawingPack } from '#packages/tech-drawing/src/index.js';
import { composeOrderTree, composeOrderGraph, ORDER_LINEAGE_KEY, emptyAuthoringDomain } from '#test-data/order-process-authoring.js';
import { compileTreeDeclarations } from '#packages/processes/src/designer.js';
import { createDefinitionAuthoring } from '#packages/processes/src/authoring.js';

const PROCESS_NAME = 'E2E composed order process';
const TABLE_TYPE = 'xlsx-workbook';
const ART = 'test-results/order-process-live.json';

test('the order process runs live: table rows become baked designs, materials, and nesting runs', async ({ app }) => {
  test.setTimeout(240_000);

  const me = await (await app.request.get('/api/auth/me')).json();
  const organizationId = me.lineage?.organizationId || me.organizationId;
  expect(organizationId).toBeTruthy();
  const organization = await (await app.request.get(`/api/organizations/${organizationId}`)).json();
  const roles = Object.values(organization?.data?.roles || {});
  const adminRole = roles.find(role => String(role.label || '').toLowerCase() === 'admin') || roles[0];
  expect(adminRole?.id, 'the e2e organization declares roles').toBeTruthy();

  // The Apply sequence: the tree composes through the seam, its compiled
  // declarations post first, then the graph composes over the overlaid
  // domain.
  const authoring = composeOrderTree(createDefinitionAuthoring(emptyAuthoringDomain()));
  const definition0 = authoring.definition();
  const { declarations, diagnostics } = compileTreeDeclarations(
    definition0.graph.nodes.filter(node => node.type !== 'processNode'),
    definition0.graph.edges,
    definition0.processNodes
  );
  expect(diagnostics).toEqual([]);
  for (const declaration of declarations) {
    const response = await app.request.post('/api/admin/cts/types', { data: declaration });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  app.trackCleanup(async () => {
    for (const declaration of declarations) {
      await app.request.delete(`/api/admin/cts/types/${declaration.id}`, { failOnStatusCode: false });
    }
  });

  const registry = createTypeRegistry({ id: 'e2e-order-process' });
  for (const declaration of [
    ...frameworkTypes,
    ...documentsPack.types,
    ...techDrawingPack.types,
    ...facadePackContent.types,
    ...declarations
  ]) {
    registry.defineType(declaration);
  }
  const packServices = [
    ...(documentsPack.services || []),
    ...(techDrawingPack.services || []),
    ...(facadePackContent.services || [])
  ];
  const domain = projectDomainFromView(registry, organizationId, facadeDomain, { packServices });
  authoring.withDomain(domain);
  composeOrderGraph(authoring, TABLE_TYPE);
  const composed = authoring.definition();
  for (const node of Object.values(composed.processNodes || {})) {
    for (const grant of node.access?.grants || []) {
      if (grant.roleId === 'role_admin') grant.roleId = adminRole.id;
    }
  }

  const created = await app.request.post('/api/process-definitions', {
    data: { name: PROCESS_NAME, data: composed }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const definitionId = (await created.json())?._id;
  expect(definitionId).toBeTruthy();
  app.trackCleanup(async () => {
    await app.request.post(`/api/process-definitions/${definitionId}/deactivate`, { failOnStatusCode: false });
    await app.request.delete(`/api/process-definitions/${definitionId}`, { failOnStatusCode: false });
  });

  const validated = await app.request.post(`/api/process-definitions/${definitionId}/validate`);
  expect(validated.ok(), await validated.text()).toBeTruthy();
  const activated = await app.request.post(`/api/process-definitions/${definitionId}/activate`);
  expect(activated.ok(), await activated.text()).toBeTruthy();

  // A real PARAMETRIC template through the generic instance machinery —
  // the OCCS document rides the payload (the cassette designer's own
  // persistence path: the compiled create action, then payload PUT).
  const { createDefaultOccsCassetteTemplateDefinition } = await import('../utils/occs/templates.js');
  const templateName = `Tray 600 ${Date.now()}`;
  const species = await app.seedSpeciesProcess({ types: [TABLE_TYPE, 'cassette'], via: { [TABLE_TYPE]: 'upload', cassette: 'editor' } });
  const cassetteCreate = (await app.activeActions()).find(action => action.actionKind === 'createEntity' && action.typeId === 'cassette');
  expect(cassetteCreate, 'the species process seeds a cassette create action').toBeTruthy();
  const createAction = await app.executeAction(cassetteCreate.id, { data: { 'data.name': templateName } });
  const createdTemplateRecord = createAction?.created ?? createAction?.entity ?? createAction;
  const templateId = createdTemplateRecord?._id || createdTemplateRecord?.id;
  expect(templateId, 'the create action produced a cassette template').toBeTruthy();
  const payloadUpload = await app.request.put(`/api/instances/cassette/${templateId}/payload`, {
    multipart: {
      file: {
        name: `${templateName}.occs`,
        mimeType: 'application/perigram+occs',
        buffer: Buffer.from(JSON.stringify(createDefaultOccsCassetteTemplateDefinition()), 'utf8')
      }
    }
  });
  expect(payloadUpload.ok(), await payloadUpload.text()).toBeTruthy();
  app.trackCleanup(async () => {
    await app.request.delete(`/api/instances/cassette/${templateId}`, { failOnStatusCode: false });
  });

  // A real xlsx order table uploaded through the workbook create action
  // (seeded above beside the cassette editor action — the executable
  // action set is the union of every ACTIVE definition).

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

  const actions = await app.activeActions();
  const workbookAction = actions.find(action => (action.kind || action.actionKind) === 'createEntity' && action.typeId === TABLE_TYPE);
  expect(workbookAction, 'an active process exposes a workbook create action').toBeTruthy();
  const tableRun = await app.executeAction(workbookAction.id, {
    data: {
      'data.name': `Order table 42 ${Date.now()}`,
      payload: { fileId: tableFile.id, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: tableBuffer.length }
    }
  });
  const table = tableRun?.created ?? tableRun?.entity ?? tableRun;
  expect(table?._id, 'the workbook create action produced the table instance').toBeTruthy();

  // THE LIVE RUN: the composed order action over the uploaded table.
  const orderAction = (await app.activeActions()).find(action => action.id === 'order' || action.nodeId === 'order');
  expect(orderAction, 'the composed order action is exposed').toBeTruthy();
  const executed = await app.request.post(`/api/process-definitions/active/actions/${orderAction.id}/execute`, {
    data: {
      data: {
        'data.name': 'Facade order 42',
        'relations.table': { type: TABLE_TYPE, id: String(table._id?.toString?.() || table._id || table.id) }
      }
    }
  });
  expect(executed.ok(), await executed.text()).toBeTruthy();

  const instancesOf = async typeId => {
    const response = await (await app.request.get(`/api/instances/${typeId}`)).json();
    return Array.isArray(response) ? response : response?.items ?? [];
  };
  const orderIdOf = instance => instance?.lineage?.[ORDER_LINEAGE_KEY]?.toString?.() ?? String(instance?.lineage?.[ORDER_LINEAGE_KEY] ?? '');
  const orders = (await instancesOf('facade-order'))
    .filter(order => (order.identity?.name ?? order.name) === 'Facade order 42')
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  expect(orders.length).toBeGreaterThanOrEqual(1);
  const orderId = String(orders[0]._id);

  const designs = (await instancesOf('cassette-design')).filter(design => orderIdOf(design) === orderId);
  expect(designs.map(design => design.identity?.name ?? design.name).sort()).toEqual(['Tray A left', 'Tray B small']);
  for (const design of designs) {
    expect(design.data?.template?.toString?.() || design.data?.template).toBe(String(templateId));
    expect((design.data?.geometry?.nestingPolygons || []).length).toBeGreaterThan(0);
  }

  const materials = (await instancesOf('sheet-material')).filter(material => orderIdOf(material) === orderId);
  expect(materials.map(material => material.data?.code ?? material.fields?.code).sort()).toEqual(['ACM-1250x2500-04', 'ACM-1500x3000-06']);

  const attempts = (await instancesOf('nesting-attempt')).filter(attempt => orderIdOf(attempt) === orderId);
  expect(attempts).toHaveLength(2);
  for (const attempt of attempts) {
    const result = attempt.data?.result ?? attempt.fields?.result;
    expect(result?.summary?.sheetCount).toBeGreaterThan(0);
  }

  const report = {
    process: PROCESS_NAME,
    definitionId,
    tableType: TABLE_TYPE,
    templateId: String(templateId),
    liveRun: {
      orderName: 'Facade order 42',
      cassetteDesigns: designs.map(design => ({ name: design.identity?.name ?? design.name, template: String(design.data?.template ?? '') })),
      materials: materials.map(material => material.data?.code ?? material.fields?.code),
      nestingAttempts: attempts.map(attempt => ({ summary: (attempt.data?.result ?? attempt.fields?.result)?.summary }))
    },
    nodeKinds: Object.values(composed.processNodes || {}).map(node => node.kind),
    edgeCount: (composed.graph?.edges || []).length
  };
  writeFileSync(ART, JSON.stringify(report, null, 2));
  await app.expectCleanRuntime();
});
