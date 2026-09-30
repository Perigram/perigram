// The facade order process, end to end: an uploaded order table (xlsx OR
// csv) becomes one org-authored container with baked cassette-design
// children, declared sheet materials, and one nesting run per material
// saved as a child record. The definition is authored the way the
// designer authors: its org vocabulary (container, per-run record) is
// declared IN-TREE (ctsTypes records + declaration wires), every type
// binding derives from a binds wire, and the apply follows the
// designer's own Apply sequence — the compiled tree declarations are
// posted, then the definition validates, activates, and runs. The
// compiler, orchestration, durable effect boundary, pack handlers, and
// generic instance services run REAL; only persistence (Mongo/GridFS),
// the cts-types store, and the nesting worker are faked.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import * as XLSX from 'xlsx/xlsx.mjs';
import { createDefaultOccsCassetteTemplateDefinition } from '#utils/occs/templates.js';
import { createDefinitionAuthoring } from '#packages/processes/src/authoring.js';
import { composeOrderTree, composeOrderGraph, ORDER_LINEAGE_KEY, emptyAuthoringDomain } from '#test-data/order-process-authoring.js';
import { compileTreeDeclarations } from '#packages/processes/src/designer.js';
import { instanceServiceResolver } from '../../features/instances/service.js';

const harness = vi.hoisted(() => ({
  fileBuffers: new Map(),
  db: null,
  workerCalls: [],
  orgDeclarations: []
}));

function createFakeDb() {
  const collections = new Map();
  const idOf = value => (value instanceof ObjectId ? value.toString() : value == null ? null : String(value));
  function matchValue(docValue, expected) {
    if (expected instanceof ObjectId) return idOf(docValue) === idOf(expected);
    if (expected === null) return docValue == null;
    if (typeof expected === 'object') return Object.entries(expected)
      .every(([key, value]) => matchValue(docValue?.[key], value));
    return docValue === expected || idOf(docValue) === String(expected);
  }
  function matches(doc, query = {}) {
    return Object.entries(query).every(([key, expected]) => {
      if (key === '$or') return expected.some(alternative => matches(doc, alternative));
      const value = String(key).split('.').reduce((current, segment) => current?.[segment], doc);
      return matchValue(value, expected);
    });
  }
  const cursor = docs => ({
    sort: () => cursor(docs),
    limit: count => cursor(docs.slice(0, count)),
    skip: count => cursor(docs.slice(count)),
    toArray: async () => docs
  });
  return {
    collection(name) {
      if (!collections.has(name)) collections.set(name, []);
      const docs = collections.get(name);
      return {
        insertOne: async doc => { docs.push(doc); return doc; },
        insertMany: async inserted => { docs.push(...inserted); return inserted; },
        find: query => cursor(docs.filter(doc => matches(doc, query))),
        findOne: async query => docs.find(doc => matches(doc, query)) || null,
        findOneAndUpdate: async (query, update) => {
          const doc = docs.find(item => matches(item, query));
          if (doc) Object.assign(doc, update.$set || {});
          return doc || null;
        },
        updateOne: async (query, update) => {
          const doc = docs.find(item => matches(item, query));
          if (doc && update.$set) Object.assign(doc, update.$set);
          return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
        },
        deleteOne: async query => {
          const index = docs.findIndex(item => matches(item, query));
          if (index >= 0) docs.splice(index, 1);
          return { deletedCount: index >= 0 ? 1 : 0 };
        },
        deleteMany: async query => {
          const kept = docs.filter(doc => !matches(doc, query));
          const removed = docs.length - kept.length;
          docs.length = 0;
          docs.push(...kept);
          return { deletedCount: removed };
        },
        countDocuments: async query => docs.filter(doc => matches(doc, query)).length
      };
    },
    __docs: collections
  };
}

vi.mock('~/server/db/mongo', () => ({
  connectDB: vi.fn(async () => {
    if (!harness.db) harness.db = createFakeDb();
    return harness.db;
  })
}));

vi.mock('~/server/features/files/service.js', () => ({
  uploadFile: vi.fn(async buffer => {
    const id = `file-${harness.fileBuffers.size + 1}`;
    harness.fileBuffers.set(id, buffer);
    return { id, filename: 'payload', url: '#' };
  }),
  getFileBuffer: vi.fn(async id => {
    const buffer = harness.fileBuffers.get(String(id));
    if (!buffer) throw new Error(`File ${id} not found`);
    return buffer;
  }),
  deleteFile: vi.fn(async () => {})
}));

vi.mock('~/server/features/instance-revisions/service.js', () => ({
  getById: vi.fn(async () => null),
  ensureForEntitySnapshot: vi.fn(async () => ({ _id: 'rev-1', data: { number: 1 } }))
}));

vi.mock('~/server/features/instances/indexes.js', () => ({ ensureInstanceIndexes: vi.fn(async () => []) }));

vi.mock('~/server/core/access/service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  hasInstanceAccess: vi.fn(() => true)
}));

vi.mock('~/server/core/machines/service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    stateService: { ...actual.stateService, transitionWithResult: vi.fn(), setInitialStateForOrganization: vi.fn() }
  };
});

// The cts-types store mirrors the designer's Apply: declarations posted
// from the composed tree land here, and the registry compiles them for
// every later acceptance.
vi.mock('~/server/features/cts-types/service.js', async () => {
  const cts = await import('~/packages/cts/src/index.js');
  const declarations = await import('~/server/packs/declarations.js');
  return {
    compileRegistryForOrganization: vi.fn(async () => {
      const registry = cts.createTypeRegistry({ id: 'order-process-spec' });
      for (const declaration of [...cts.frameworkTypes, ...declarations.composeSystemDeclarations(), ...harness.orgDeclarations]) {
        registry.defineType(declaration);
      }
      return registry;
    })
  };
});

vi.mock('~/server/features/cts-types/repository.js', async () => {
  return {
    findByTypeId: vi.fn(async (organizationId, typeId) => harness.orgDeclarations.find(declaration => declaration.id === typeId) || null),
    listByOrganization: vi.fn(async () => harness.orgDeclarations)
  };
});

vi.mock('../../features/process-definitions/repository.js', () => ({
  find: vi.fn(),
  findById: vi.fn(),
  findActiveByOrganization: vi.fn(),
  findActiveSetByOrganization: vi.fn(async () => []),
  create: vi.fn(),
  updateById: vi.fn(),
  archiveActiveByOrganization: vi.fn(),
  getConnection: vi.fn()
}));

vi.mock('../../features/process-definitions/run-repository.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRunRepository: () => ({
      createRun: async ({ run }) => ({ runId: run.id, state: run, definition: {}, revision: 0 }),
      saveRunState: async (_runId, state, revision) => ({ state, revision: revision + 1 }),
      findUnreceiptedInvocations: async () => []
    }),
    executeManualRun: actual.executeManualRun
  };
});

global.fetch = vi.fn(async (_url, options = {}) => {
  const request = JSON.parse(options.body);
  harness.workerCalls.push(request);
  const layouts = Array.from({ length: request.params.sheetCount }, (_, index) => ({
    index,
    placed: [{ id: 'a', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] }]
  }));
  return {
    ok: true,
    json: async () => ({ status: 'ok', layouts, used_sheets: request.params.sheetCount })
  };
});

import { startRun } from '../../features/process-definitions/service.js';
import { validateActivatableProcess, declarationOverlayDomain } from '../../features/process-definitions/compiler-adapter.js';
import { instanceServiceResolver } from '../../features/instances/service.js';
import * as processRepository from '../../features/process-definitions/repository.js';
import * as filesService from '../../features/files/service.js';
import * as ctsTypesService from '../../features/cts-types/service.js';
import { facadeDomain } from '~/packages/facade/src/index.js';
import { composePackServices } from '~/server/packs/declarations.js';
import { projectDomainFromView } from '~/packages/cts/src/index.js';

const ORG = 'org-order-1';
const ORDER_LINEAGE_KEY = 'facadeOrderId';
const auth = {
  userId: 'user-1',
  organizationId: ORG,
  role: 'role_admin',
  effectivePermissions: {
    organizations: { level: 'admin' },
    sheet_designs: { level: 'write' }
  }
};

function documentsOf(typeId) {
  const docs = [];
  for (const collection of harness.db.__docs.values()) {
    docs.push(...collection.filter(doc => doc.type === typeId));
  }
  return docs;
}

async function seedInstance(typeId, draft, buffer, mime) {
  const stored = await filesService.uploadFile(buffer, `${typeId}.payload`, {}, 'files');
  return await instanceServiceResolver(typeId).create({
    ...draft,
    payload: { fileId: stored.id, mime, size: buffer.length }
  }, auth.userId, ORG);
}

// The template is a §13 file instance: the OCCS document rides the
// payload, exactly the way the save command and the designer persist it.
async function seedCassetteTemplate(name) {
  const buffer = Buffer.from(JSON.stringify(createDefaultOccsCassetteTemplateDefinition()), 'utf8');
  return await seedInstance('cassette', { identity: { name } }, buffer, 'application/perigram+occs');
}

const ORDER_TABLE_HEADERS = ['name', 'cassette', 'A', 'B'];
const ORDER_ROWS = [
  { name: 'Tray A left', templateName: 'Tray 600', parameters: { A: 600, B: 450 } },
  { name: 'Tray B small', templateName: 'Tray 600', parameters: { A: 300, B: 300 } }
];

function tableBuffer(tableType) {
  const rows = [ORDER_TABLE_HEADERS, ...ORDER_ROWS.map(row => [row.name, row.templateName, row.parameters.A, row.parameters.B])];
  if (tableType === 'csv-table') {
    return Buffer.from(rows.map(row => row.map(cell => /[",]/.test(String(cell)) ? `"${String(cell)}"` : String(cell)).join(',')).join('\n'), 'utf8');
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Order');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe.each(['xlsx-workbook', 'csv-table'])('the order process authored in-tree over %s', (tableType) => {
  let table;

  beforeEach(() => {
    vi.clearAllMocks();
    harness.db = null;
    harness.fileBuffers.clear();
    harness.workerCalls.length = 0;
    harness.orgDeclarations.length = 0;
  });

  async function composeApplyAndRun() {
    await seedCassetteTemplate('Tray 600');
    table = await seedInstance(tableType,
      { identity: { name: 'Order table 42' } },
      tableBuffer(tableType),
      tableType === 'csv-table' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // The designer's Apply sequence: the tree composes and its
    // declarations post first; the graph then composes over the overlaid
    // domain (the draft-overlay rule) and validates against it.
    const authoring = composeOrderTree(createDefinitionAuthoring(emptyAuthoringDomain()));
    const { declarations, diagnostics } = compileTreeDeclarations(
      authoring.definition().graph.nodes.filter(node => node.type !== 'processNode'),
      authoring.definition().graph.edges,
      authoring.definition().processNodes);
    expect(diagnostics).toEqual([]);
    harness.orgDeclarations.push(...declarations);

    const domain = projectDomainFromView(
      await ctsTypesService.compileRegistryForOrganization(ORG),
      ORG, facadeDomain, { packServices: composePackServices() });
    authoring.withDomain(domain);
    const definition = composeOrderGraph(authoring, tableType);
    const validation = validateActivatableProcess(definition, domain, { role_admin: { label: 'Admin' } });
    expect(validation.errors || []).toEqual([]);

    // The order's `table` relation entry accepts BOTH table types (one
    // authored ref field, two declared targets): it compiles to ONE link
    // action accepting the union, captioned by the authored field label —
    // never per-target buttons or raw type ids.
    const { compileProcessDefinition } = await import('#packages/processes/src/index.js');
    const { tryAcceptGraphProtocol } = await import('../../features/process-definitions/compiler-adapter.js');
    const accepted = tryAcceptGraphProtocol(definition, domain).definition;
    const compiled = compileProcessDefinition(accepted, declarationOverlayDomain(definition, domain), {
      roles: { role_admin: { label: 'Admin' } }
    });
    const tableLinks = Object.values(compiled.actions || {})
      .filter(action => action.relationMutation?.key === 'table' && action.relationMutation.operation === 'link');
    expect(tableLinks).toHaveLength(1);
    expect([...tableLinks[0].relationMutation.targetTypes].sort()).toEqual(['csv-table', 'xlsx-workbook']);
    expect(tableLinks[0].label).toMatch(/^Link /);
    expect(tableLinks[0].label).not.toMatch(/csv|xlsx/i);

    processRepository.findById.mockResolvedValue({
      _id: 'process-order',
      identity: { uid: 'process-order', name: 'Facade order process', slug: 'facade-order-process' },
      lineage: { organizationId: ORG },
      status: { state: 'ACTIVE' },
      data: definition
    });

    const run = await startRun('process-order', {
      trigger: { nodeId: 'order' },
      inputs: { data: { 'relations.table': { type: tableType, id: table._id } } }
    }, auth);
    return { definition, declarations, run };
  }

  it('validates and runs the composed process to completion', async () => {
    const { run } = await composeApplyAndRun();
    expect(run.status).toBe('succeeded');
    expect(run.error).toBeNull();
  });

  it('carries its vocabulary in-tree: posted declarations compile from its own canvas', async () => {
    const { declarations } = await composeApplyAndRun();
    expect(declarations).toEqual([
      {
        id: 'sheet-material', class: 'file', name: 'Sheet material',
        fields: { code: { base: 'string', identifier: true }, width: { base: 'quantity', unit: 'mm' }, height: { base: 'quantity', unit: 'mm' }, thickness: { base: 'quantity', unit: 'mm' } }
      },
      { id: 'nesting-attempt', class: 'item', name: 'Nesting attempt', fields: { label: { base: 'string', identifier: true }, result: { base: 'json' } } },
      {
        id: 'facade-order', class: 'group', name: 'Facade order',
        fields: { name: { base: 'string', identifier: true }, table: { base: 'ref', accepts: ['xlsx-workbook', 'csv-table'] } },
        edges: { children: { contents: { types: ['cassette-design', 'sheet-material', 'nesting-attempt'], onRemove: 'restrict' } } }
      }
    ]);
  });

  it('builds one container with baked cassette-design children from the table rows', async () => {
    await composeApplyAndRun();
    const orders = documentsOf('facade-order');
    expect(orders).toHaveLength(1);
    expect(orders[0].name).toBe('Facade order 42');
    const orderId = orders[0]._id.toString();

    const designs = documentsOf('cassette-design');
    expect(designs.map(design => design.name)).toEqual(['Tray A left', 'Tray B small']);
    for (const design of designs) {
      expect(design.fields.template.toString()).toBeTruthy();
      expect(design.fields.geometry?.nestingPolygons?.length).toBeGreaterThan(0);
      expect(design.lineage[ORDER_LINEAGE_KEY].toString()).toBe(orderId);
    }
    const parameters = designs.map(design => design.fields.parameters);
    expect(parameters[0]).toEqual({ A: 600, B: 450 });
    expect(parameters[1]).toEqual({ A: 300, B: 300 });
  });

  it('attaches the declared sheet materials as children', async () => {
    await composeApplyAndRun();
    const orders = documentsOf('facade-order');
    const orderId = orders[0]._id.toString();
    const materials = documentsOf('sheet-material');
    expect(materials.map(material => material.fields.code)).toEqual(['ACM-1250x2500-04', 'ACM-1500x3000-06']);
    expect(materials.every(material => material.lineage[ORDER_LINEAGE_KEY].toString() === orderId)).toBe(true);
  });

  it('runs the nesting service once per material and saves every run as a child', async () => {
    const { run } = await composeApplyAndRun();
    const orders = documentsOf('facade-order');
    const orderId = orders[0]._id.toString();

    expect(harness.workerCalls).toHaveLength(2);
    expect(harness.workerCalls.map(call => call.params.width)).toEqual([1250, 1500]);
    expect(harness.workerCalls.map(call => call.params.height)).toEqual([2500, 3000]);
    for (const call of harness.workerCalls) {
      expect(call.items).toHaveLength(2);
    }

    const attempts = documentsOf('nesting-attempt');
    expect(attempts).toHaveLength(2);
    for (const attempt of attempts) {
      expect(attempt.lineage[ORDER_LINEAGE_KEY].toString()).toBe(orderId);
      expect(attempt.fields.result?.layouts?.length).toBeGreaterThan(0);
      expect(attempt.fields.result?.summary?.sheetCount).toBeGreaterThan(0);
    }

    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync('test-results', { recursive: true });
    writeFileSync(`test-results/facade-order-process-${tableType}.json`, JSON.stringify({
      process: 'facade order process',
      tableType,
      authoredBy: 'in-tree declarations + binds wires (the designer means)',
      run: { status: run.status, steps: run.steps.length },
      container: documentsOf('facade-order').map(doc => ({ id: String(doc._id), name: doc.name })),
      cassetteDesigns: documentsOf('cassette-design').map(doc => ({
        id: String(doc._id), name: doc.name, parameters: doc.fields.parameters
      })),
      materials: documentsOf('sheet-material').map(doc => ({ id: String(doc._id), code: doc.fields.code })),
      nestingAttempts: documentsOf('nesting-attempt').map(doc => ({
        id: String(doc._id), summary: doc.fields.result?.summary
      })),
      workerRequests: harness.workerCalls.map(call => call.params)
    }, null, 2));
  }, 20000);
});
