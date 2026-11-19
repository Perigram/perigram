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
import documentsListing from '../workers/documents/listing.json' with { type: 'json' };
import techDrawingListing from '../workers/tech-drawing/listing.json' with { type: 'json' };
import { composeOrderTree, composeOrderGraph, ORDER_LINEAGE_KEY, emptyAuthoringDomain } from '#test-data/order-process-authoring.js';
import { compileTreeDeclarations } from '#packages/processes/src/designer.js';
import { createDefinitionAuthoring } from '#packages/processes/src/authoring.js';

const PROCESS_NAME = 'E2E composed order process';
const TABLE_TYPE = 'xlsx-workbook';
const ART = 'test-results/order-process-live.json';

test('the order process runs live: table rows become baked designs, materials, and nesting runs', async ({ app }) => {
  test.setTimeout(360_000);
  await app.installPlugins(['tech-drawing', 'documents', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');

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
    ...documentsListing.declarations.types,
    ...techDrawingListing.declarations.types,
    ...facadePackContent.types,
    ...declarations
  ]) {
    registry.defineType(declaration);
  }
  const packServices = [
    ...(documentsListing.declarations.services || []),
    ...(techDrawingListing.declarations.services || []),
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
  const { createDefaultOccsCassetteTemplateDefinition } = await import('../workers/facade/occs/templates.js');
  const templateName = `Tray 600 ${Date.now()}`;
  const species = await app.seedSpeciesProcess({ types: [TABLE_TYPE, 'cassette-template'], via: { [TABLE_TYPE]: 'upload', cassette: 'editor' } });
  const cassetteCreate = (await app.activeActions()).find(action => action.actionKind === 'createEntity' && action.typeId === 'cassette-template');
  expect(cassetteCreate, 'the species process seeds a cassette create action').toBeTruthy();
  const createAction = await app.executeAction(cassetteCreate.id, { data: { 'fields.name': templateName } });
  const createdTemplateRecord = createAction?.created ?? createAction?.entity ?? createAction;
  const templateId = createdTemplateRecord?._id || createdTemplateRecord?.id;
  expect(templateId, 'the create action produced a cassette template').toBeTruthy();
  // Editor-protocol creates prompt no rows: the template's name rides the
  // identity rename channel, the slot the pairs join keys templates by.
  const templateRename = await app.request.patch(`/api/instances/cassette-template/${templateId}`, {
    data: { name: templateName },
    failOnStatusCode: false
  });
  expect(templateRename.ok(), await templateRename.text()).toBeTruthy();
  const payloadUpload = await app.request.put(`/api/instances/cassette-template/${templateId}/payload`, {
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
    await app.request.delete(`/api/instances/cassette-template/${templateId}`, { failOnStatusCode: false });
  });

  // A real xlsx order table uploaded through the workbook create action
  // (seeded above beside the cassette editor action — the executable
  // action set is the union of every ACTIVE definition).

  const { utils, write } = await import('xlsx');
  const sheet = utils.aoa_to_sheet([
    ['name', 'cassette', 'A', 'B', 'count'],
    ['Tray A left 1', templateName, 600, 450, 2],
    ['Tray A left 2', templateName, 600, 450, 1],
    ['Tray B small', templateName, 300, 300, 3]
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
      'fields.name': `Order table 42 ${Date.now()}`,
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
        'fields.name': 'Facade order 42',
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
    .filter(order => (order.fields?.name || order.name) === 'Facade order 42')
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  expect(orders.length).toBeGreaterThanOrEqual(1);
  const orderId = String(orders[0]._id);

  const designs = (await instancesOf('cassette-design')).filter(design => orderIdOf(design) === orderId);
  // Construct names ride the manual prompt channel (the graph-wired Name
  // input retired with the §3 wire adoption); each row's design is
  // identified by its baked bounds — the row's A/B parameters.
  const boundsOf = design => {
    const ring = design.fields?.geometry?.polygons?.[0]?.coordinates || [];
    const xs = ring.map(point => Number(point[0]) || 0);
    const ys = ring.map(point => Number(point[1]) || 0);
    return `${Math.max(...xs)}x${Math.max(...ys)}`;
  };
  expect(designs.map(boundsOf).sort()).toEqual(['300x300', '600x450', '600x450']);
  // The template ref rides the §3 provenance (the effect boundary's
  // causal record: sources collect the construct's typed entity inputs),
  // pinned to the revision the render consumed (SPEC §24 version fabric:
  // the upload minted geometry revision 1).
  for (const design of designs) {
    expect(design.provenance?.sources).toContainEqual({
      type: 'cassette-template',
      id: templateId,
      revision: `revision:cassette-template:${templateId}:geometry:1`
    });
    expect((design.data?.geometry?.nestingPolygons || design.fields?.geometry?.nestingPolygons || []).length).toBeGreaterThan(0);
  }

  const materials = (await instancesOf('sheet-material')).filter(material => orderIdOf(material) === orderId);
  expect(materials.map(material => material.data?.code ?? material.fields?.code).sort()).toEqual(['ACM-1250x2500-04', 'ACM-1500x3000-06']);

  const entries = (await instancesOf('queue-entry')).filter(entry => orderIdOf(entry) === orderId);
  expect(entries, 'one queue entry per table line').toHaveLength(3);
  expect(entries.map(entry => Number(entry.fields?.count ?? 0)).sort()).toEqual([1, 2, 3]);
  const cassettes = (await instancesOf('cassette-instance')).filter(instance => orderIdOf(instance) === orderId);
  expect(cassettes, 'one physical cassette per entry').toHaveLength(3);
  for (const cassette of cassettes) expect(cassette.fields?.design).toBeTruthy();

  const attempts = (await instancesOf('nesting-attempt')).filter(attempt => orderIdOf(attempt) === orderId);
  expect(attempts).toHaveLength(2);
  for (const attempt of attempts) {
    const result = attempt.data?.result ?? attempt.fields?.result;
    expect(result?.summary?.sheetCount).toBeGreaterThan(0);
  }

  const familyOf = async attemptIds => {
    const inAttempt = instance => attemptIds.has(String(instance.lineage?.nestingAttemptId ?? ''));
    const [sheetDesigns, sheetInstances, cutPlans] = await Promise.all(
      ['sheet-design', 'sheet-instance', 'sheet-cut-plan'].map(async typeId =>
        (await instancesOf(typeId)).filter(inAttempt))
    );
    return { sheetDesigns, sheetInstances, cutPlans };
  };
  const family = await familyOf(new Set(attempts.map(attempt => String(attempt._id))));
  expect(family.sheetDesigns.length, 'each attempt produces its sheet designs').toBeGreaterThan(0);
  expect(family.sheetInstances.length, 'one sheet per grouped design').toBe(family.sheetDesigns.length);
  expect(family.cutPlans.length, 'one cut plan per grouped design').toBe(family.sheetDesigns.length);
  for (const design of family.sheetDesigns) {
    expect(design.fields?.compositionKey, 'the sheet design carries its composition key').toBeTruthy();
    expect(design.fields?.geometry?.data?.solution?.layouts?.[0]?.count).toBeGreaterThanOrEqual(1);
    expect((design.relations?.parts || []).length).toBeGreaterThan(0);
  }
  for (const cutPlan of family.cutPlans) {
    expect(cutPlan.fields?.design, 'the cut plan names its sheet design').toBeTruthy();
    expect(cutPlan.fields?.sheet, 'the cut plan names its physical sheet').toBeTruthy();
  }

  // A second identical order reuses the stored sheet designs: the solve
  // produces the same composition, so no new sheet design is constructed
  // and one design now stands behind cut plans from both runs.
  const sheetDesignsBeforeReplay = (await instancesOf('sheet-design')).length;
  const replay = await app.request.post(`/api/process-definitions/active/actions/${orderAction.id}/execute`, {
    data: {
      data: {
        'fields.name': 'Facade order 42',
        'relations.table': { type: TABLE_TYPE, id: String(table._id?.toString?.() || table._id || table.id) }
      }
    }
  });
  expect(replay.ok(), await replay.text()).toBeTruthy();
  const replayOrder = (await instancesOf('facade-order'))
    .filter(order => (order.fields?.name || order.name) === 'Facade order 42')
    .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')))[0];
  const replayOrderId = String(replayOrder._id);
  expect(replayOrderId).not.toBe(orderId);
  const replayEntries = (await instancesOf('queue-entry')).filter(entry => orderIdOf(entry) === replayOrderId);
  expect(replayEntries).toHaveLength(3);
  const replayCassettes = (await instancesOf('cassette-instance')).filter(instance => orderIdOf(instance) === replayOrderId);
  expect(replayCassettes).toHaveLength(3);
  const replayAttempts = (await instancesOf('nesting-attempt')).filter(attempt => orderIdOf(attempt) === replayOrderId);
  expect(replayAttempts).toHaveLength(2);
  const sheetDesignsAfterReplay = (await instancesOf('sheet-design')).length;
  expect(sheetDesignsAfterReplay, 'stored sheet designs are reused, not duplicated').toBe(sheetDesignsBeforeReplay);
  const replayFamily = await familyOf(new Set(replayAttempts.map(attempt => String(attempt._id))));
  expect(replayFamily.sheetDesigns).toHaveLength(0);
  expect(replayFamily.cutPlans.length, 'the replay still cuts sheets').toBeGreaterThan(0);
  const cutPlansByDesign = new Map();
  for (const cutPlan of [...family.cutPlans, ...replayFamily.cutPlans]) {
    const designId = String(cutPlan.fields?.design?.id ?? cutPlan.fields?.design ?? '');
    cutPlansByDesign.set(designId, (cutPlansByDesign.get(designId) || 0) + 1);
  }
  expect([...cutPlansByDesign.values()].some(count => count > 1), 'one sheet design stands behind many cuts').toBe(true);

  const report = {
    process: PROCESS_NAME,
    definitionId,
    tableType: TABLE_TYPE,
    templateId: String(templateId),
    liveRun: {
      orderName: 'Facade order 42',
      cassetteDesigns: designs.map(design => ({ bounds: boundsOf(design), template: String(design.fields?.template ?? '') })),
      materials: materials.map(material => material.data?.code ?? material.fields?.code),
      nestingAttempts: attempts.map(attempt => ({ summary: (attempt.data?.result ?? attempt.fields?.result)?.summary }))
    },
    nodeKinds: Object.values(composed.processNodes || {}).map(node => node.kind),
    edgeCount: (composed.graph?.edges || []).length
  };
  writeFileSync(ART, JSON.stringify(report, null, 2));
  await app.expectCleanRuntime();
});
