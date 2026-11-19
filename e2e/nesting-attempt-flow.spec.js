import { test, expect } from './fixtures.js';
import { writeFileSync } from 'node:fs';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '#packages/cts/src/index.js';
import { facadeDomain, facadePackContent } from '../test-tools/facade-plugin.js';
import documentsListing from '../workers/documents/listing.json' with { type: 'json' };
import techDrawingListing from '../workers/tech-drawing/listing.json' with { type: 'json' };
import nestingListing from '../workers/nesting/listing.json' with { type: 'json' };
import { composeNestingAttemptTree, composeNestingAttemptGraph } from '#test-data/nesting-attempt-authoring.js';
import { compileTreeDeclarations } from '#packages/processes/designer';
import { createDefinitionAuthoring } from '#packages/processes/src/authoring.js';

// Org1's nesting flow: a manual solve over the attempt's designs, with the
// result patched onto the attempt and sheet designs constructed from the
// solved layouts — sheet designs are the run's results. Artifacts:
// test-results/nesting-attempt-flow.json
const ART = 'test-results/nesting-attempt-flow.json';
const CUT_SQUARE = [[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]];
const LAYER_DATA = [
  { layer: 'cut.outer', coordinates: CUT_SQUARE },
  { layer: 'fold.route', coordinates: [[20, 150], [280, 150]] }
];

test('the solve action patches its attempt and constructs sheet designs from the layouts', async ({ app }) => {
  test.setTimeout(240_000);
  await app.installPlugins(['tech-drawing', 'documents', 'nesting', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');

  const authoring = createDefinitionAuthoring({ entities: [], fieldSchemas: {}, workflows: {}, construction: {}, relations: [], projectionContracts: {}, serviceContracts: {} });
  composeNestingAttemptTree(authoring);
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

  const registry = createTypeRegistry({ id: 'e2e-nesting-attempt' });
  for (const declaration of [
    ...frameworkTypes,
    ...documentsListing.declarations.types,
    ...techDrawingListing.declarations.types,
    ...nestingListing.declarations.types,
    ...facadePackContent.types,
    ...declarations
  ]) {
    registry.defineType(declaration);
  }
  const me = await (await app.request.get('/api/auth/me')).json();
  const organizationId = me.lineage?.organizationId || me.organizationId;
  const packServices = [
    ...(documentsListing.declarations.services || []),
    ...(techDrawingListing.declarations.services || []),
    ...(nestingListing.declarations.services || []).map(service => ({
      id: `plugin.nesting.${service.id}`, species: 'service', command: `plugin.nesting.${service.id}`,
      palette: service.palette, signature: service.signature, render: service.render || { label: service.label || service.id }
    })),
    ...(facadePackContent.services || [])
  ];
  const domain = projectDomainFromView(registry, organizationId, facadeDomain, { packServices });
  authoring.withDomain(domain);

  const organization = await (await app.request.get(`/api/organizations/${organizationId}`)).json();
  const roles = Object.values(organization?.data?.roles || {});
  const adminRole = roles.find(role => String(role.label || '').toLowerCase() === 'admin') || roles[0];
  const adminAccess = { level: 'admin', grants: [{ roleId: adminRole.id, level: 'admin' }] };

  composeNestingAttemptGraph(authoring, { adminAccess });
  const composed = authoring.definition();

  const created = await app.request.post('/api/process-definitions', {
    data: { name: `E2E nesting attempt flow ${Date.now()}`, data: composed }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const definitionId = (await created.json())?._id;
  app.trackCleanup(async () => {
    await app.request.post(`/api/process-definitions/${definitionId}/deactivate`, { failOnStatusCode: false });
    await app.request.delete(`/api/process-definitions/${definitionId}`, { failOnStatusCode: false });
  });
  const validated = await app.request.post(`/api/process-definitions/${definitionId}/validate`);
  expect(validated.ok(), await validated.text()).toBeTruthy();
  const activated = await app.request.post(`/api/process-definitions/${definitionId}/activate`);
  expect(activated.ok(), await activated.text()).toBeTruthy();

  // The species seed grants the org's write access over the domain types.
  await app.seedSpeciesProcess({ types: ['cassette-design', 'sheet-design', 'sheet-dxf', 'nesting-attempt'] });

  // One design with nestable geometry and the attempt that will own the run.
  const designResponse = await app.request.post('/api/instances/cassette-design', {
    data: {
      fields: {
        name: `Flow design ${Date.now()}`,
        geometry: { layerData: LAYER_DATA, polygons: [{ coordinates: CUT_SQUARE }], nestingPolygons: [{ coordinates: CUT_SQUARE }] }
      }
    }
  });
  expect(designResponse.ok(), await designResponse.text()).toBeTruthy();
  const design = await designResponse.json();
  const attemptResponse = await app.request.post('/api/instances/nesting-attempt', {
    data: { fields: { label: `Flow attempt ${Date.now()}` } }
  });
  expect(attemptResponse.ok(), await attemptResponse.text()).toBeTruthy();
  const attempt = await attemptResponse.json();

  // THE RUN: the solve action over the attempt context.
  const executed = await app.request.post('/api/process-definitions/active/actions/solve/execute', {
    data: { instanceId: String(attempt._id), data: {}, parameters: {} }
  });
  expect(executed.ok(), await executed.text()).toBeTruthy();
  const outcome = await executed.json();

  // The attempt carries its result.
  const patched = await (await app.request.get(`/api/instances/nesting-attempt/${attempt._id}`)).json();
  const result = patched?.fields?.result || patched?.data?.result;
  expect(result?.summary?.placedCount, 'the attempt record carries the run result').toBeGreaterThan(0);

  // Sheet designs were constructed from the solved layouts.
  const sheets = await (await app.request.get('/api/instances/sheet-design')).json();
  const sheetItems = Array.isArray(sheets) ? sheets : sheets?.items || [];
  const flowSheets = sheetItems.filter(sheet => sheet?.fields?.geometry?.data?.items?.length);
  expect(flowSheets.length, 'sheet designs constructed from the layouts').toBeGreaterThan(0);

  // Each sheet's DXF was created as a file record with its stored payload.
  const dxfResponse = await (await app.request.get('/api/instances/sheet-dxf')).json();
  const dxfItems = Array.isArray(dxfResponse) ? dxfResponse : dxfResponse?.items || [];
  expect(dxfItems.length, 'the DXF file records the flow created').toBeGreaterThan(0);
  const dxf = dxfItems[0];
  expect(String(dxf?.fields?.sheet?.id || '')).toContain(String(flowSheets[0]._id));
  const sheetAfter = await (await app.request.get(`/api/instances/sheet-design/${flowSheets[0]._id}`)).json();
  const attachedDxf = [].concat(sheetAfter?.relations?.dxf || []);
  expect(attachedDxf.map(ref => String(ref.id || ref._id || '')), 'the sheet carries its cut file relation')
    .toContain(String(dxf._id));
  const payload = dxf?.payload || null;
  expect(payload?.fileId, 'the DXF record carries its stored payload').toBeTruthy();
  expect(payload?.mime).toBe('application/dxf');
  const fileResponse = await app.request.get(`/api/files/download/${payload.fileId}?bucket=files`);
  expect(fileResponse.ok(), await fileResponse.text()).toBeTruthy();
  const dxfText = await fileResponse.text();
  expect(dxfText).toContain('AC1015');
  expect(dxfText).toContain('EOF');

  writeFileSync(ART, JSON.stringify({
    definitionId,
    attemptId: String(attempt._id),
    outcome,
    summary: result?.summary,
    sheets: flowSheets.map(sheet => ({ id: String(sheet._id), placements: sheet.fields?.geometry?.data?.items?.length })),
    dxf: { id: String(dxf._id), fileId: payload.fileId, bytes: dxfText.length }
  }, null, 2));
  await app.expectCleanRuntime();
});
