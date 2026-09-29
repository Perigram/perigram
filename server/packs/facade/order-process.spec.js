// The facade order process, end to end (the composed test process): an
// uploaded order table (xlsx OR csv) becomes one org-authored container
// with baked cassette-design children, two declared sheet materials
// attach as children, and the nesting service runs once per material
// with every run saved as a child record. The definition is COMPOSED
// through the headless authoring seam (createDefinitionAuthoring — the
// same record factory, presets, and port-gated connections the process
// designer uses); no executable record is hand-forged. The compiler,
// orchestration, durable effect boundary, pack handlers, and generic
// instance services run REAL; only persistence (Mongo/GridFS), the
// cts-types store, and the nesting worker are faked. The durable
// artifact lands in test-results/facade-order-process.json.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import * as XLSX from 'xlsx/xlsx.mjs';
import { createDefaultOccsCassetteTemplateDefinition } from '#utils/occs/templates.js';
import { createDefinitionAuthoring } from '#packages/processes/src/authoring.js';

const harness = vi.hoisted(() => ({
  fileBuffers: new Map(),
  db: null,
  workerCalls: []
}));

// In-memory Mongo: per-class collections with the query shapes the
// instance repository speaks ($or, dotted paths, loose ids).
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

vi.mock('~/server/features/cts-types/service.js', async () => {
  const cts = await import('~/packages/cts/src/index.js');
  const declarations = await import('~/server/packs/declarations.js');
  const vocabulary = await import('./order-process-declarations.js');
  return {
    compileRegistryForOrganization: vi.fn(async () => {
      const registry = cts.createTypeRegistry({ id: 'order-process-spec' });
      for (const declaration of [...cts.frameworkTypes, ...declarations.composeSystemDeclarations(), ...vocabulary.orderOrgTypeDeclarations()]) {
        registry.defineType(declaration);
      }
      return registry;
    })
  };
});

// The per-call declaration resolution reads the org type store directly.
vi.mock('~/server/features/cts-types/repository.js', async () => {
  const vocabulary = await import('./order-process-declarations.js');
  const orgDeclarations = new Map(vocabulary.orderOrgTypeDeclarations().map(declaration => [declaration.id, declaration]));
  return {
    findByTypeId: vi.fn(async (organizationId, typeId) => orgDeclarations.get(typeId) || null),
    listByOrganization: vi.fn(async () => vocabulary.orderOrgTypeDeclarations())
  };
});

vi.mock('../../features/process-definitions/repository.js', () => ({
  find: vi.fn(),
  findById: vi.fn(),
  findActiveByOrganization: vi.fn(),
  // The additive active set: this org runs exactly the composed
  // definition, resolved by id through findById above.
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

// The nesting worker: records every request and answers with one layout
// per requested sheet so per-material runs are distinguishable.
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
import { validateActivatableProcess } from '../../features/process-definitions/compiler-adapter.js';
import { instanceServiceResolver } from '../../features/instances/service.js';
import * as processRepository from '../../features/process-definitions/repository.js';
import * as filesService from '../../features/files/service.js';
import * as ctsTypesService from '../../features/cts-types/service.js';
import { facadeDomain } from '~/packages/facade/src/index.js';
import { composePackServices } from '~/server/packs/declarations.js';
import { projectDomainFromView } from '~/packages/cts/src/index.js';
import {
  ORDER_LINEAGE_KEY,
  ORDER_TABLE_RELATION,
  ORDER_TYPE_ID,
  ATTEMPT_TYPE_ID
} from './order-process-declarations.js';
import { composeOrderProcessDefinition } from './order-process.js';

// The order table content: one row per cassette design — a name, the
// cassette template it names, and the bake parameters as cells. The
// header row is authored vocabulary: the graph's record-field paths
// (`name`, `cassette`, the parameter keys) ARE the column selection.
const ORDER_TABLE_HEADERS = ['name', 'cassette', 'A', 'B'];
const ORDER_ROWS = [
  { name: 'Tray A left', templateName: 'Tray 600', parameters: { A: 600, B: 450 } },
  { name: 'Tray B small', templateName: 'Tray 600', parameters: { A: 300, B: 300 } }
];

const ORG = 'org-order-1';
const auth = {
  userId: 'user-1',
  organizationId: ORG,
  role: 'role_admin',
  // Real command-level gates: the solver gate keeps sheet-design write
  // authority, organizations admin covers the process-definition access.
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

function cassetteTemplatePayload() {
  return Buffer.from(JSON.stringify(createDefaultOccsCassetteTemplateDefinition()), 'utf8');
}

describe.each(['xlsx-workbook', 'csv-table'])('the facade order process composed over %s', (tableType) => {
  let table;

  beforeEach(() => {
    vi.clearAllMocks();
    harness.db = null;
    harness.fileBuffers.clear();
    harness.workerCalls.length = 0;
  });

  async function seedAndRun() {
    await seedInstance('cassette',
      { identity: { name: 'Tray 600' } },
      cassetteTemplatePayload(), 'application/perigram+occs');
    table = await seedInstance(tableType,
      { identity: { name: 'Order table 42' } },
      tableBuffer(tableType),
      tableType === 'csv-table' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const domain = projectDomainFromView(
      await ctsTypesService.compileRegistryForOrganization(ORG),
      ORG,
      facadeDomain,
      { packServices: composePackServices() }
    );
    const definition = composeOrderProcessDefinition(domain, tableType);
    // The activation gate (the same passes Apply runs) over the composed
    // definition, plus the canvas round-trip the designer requires of a
    // saved draft.
    const validation = validateActivatableProcess(definition, domain, { role_admin: { label: 'Admin' } });
    expect(validation.errors || []).toEqual([]);

    processRepository.findById.mockResolvedValue({
      _id: 'process-order',
      identity: { uid: 'process-order', name: 'Facade order process', slug: 'facade-order-process' },
      lineage: { organizationId: ORG },
      status: { state: 'ACTIVE' },
      data: definition
    });

    const run = await startRun('process-order', {
      trigger: { nodeId: 'order' },
      inputs: { data: { [`relations.${ORDER_TABLE_RELATION}`]: { type: tableType, id: table._id } } }
    }, auth);
    return { definition, run };
  }

  it('validates and runs the composed process to completion', async () => {
    const { run } = await seedAndRun();
    expect(run.status).toBe('succeeded');
    expect(run.error).toBeNull();
    expect(run.steps.map(step => step.status)).not.toContain('failed');
  });

  it('builds one container with baked cassette-design children from the table rows', async () => {
    await seedAndRun();
    const orders = documentsOf(ORDER_TYPE_ID);
    expect(orders).toHaveLength(1);
    expect(orders[0].name).toBe('Facade order 42');
    const orderId = orders[0]._id.toString();

    const designs = documentsOf('cassette-design');
    expect(designs.map(design => design.name)).toEqual(ORDER_ROWS.map(row => row.name));
    for (const design of designs) {
      expect(design.fields.template.toString()).toBeTruthy();
      expect(design.fields.geometry?.nestingPolygons?.length).toBeGreaterThan(0);
      expect(design.lineage[ORDER_LINEAGE_KEY].toString()).toBe(orderId);
    }
    // The bake parameters are exactly the parameter columns — the
    // composed parameter record carries no row residue.
    const parameters = designs.map(design => design.fields.parameters);
    expect(parameters[0]).toEqual({ A: 600, B: 450 });
    expect(parameters[1]).toEqual({ A: 300, B: 300 });
  });

  it('attaches the declared sheet materials as children', async () => {
    await seedAndRun();
    const orders = documentsOf(ORDER_TYPE_ID);
    const orderId = orders[0]._id.toString();
    const materials = documentsOf('sheet-material');
    expect(materials.map(material => material.fields.code)).toEqual(['ACM-1250x2500-04', 'ACM-1500x3000-06']);
    expect(materials.map(material => material.fields.width)).toEqual([1250, 1500]);
    expect(materials.every(material => material.lineage[ORDER_LINEAGE_KEY].toString() === orderId)).toBe(true);
  });

  it('runs the nesting service once per material and saves every run as a child', async () => {
    const { run } = await seedAndRun();
    const orders = documentsOf(ORDER_TYPE_ID);
    const orderId = orders[0]._id.toString();

    expect(harness.workerCalls).toHaveLength(2);
    expect(harness.workerCalls.map(call => call.params.width)).toEqual([1250, 1500]);
    expect(harness.workerCalls.map(call => call.params.height)).toEqual([2500, 3000]);
    // Both order rows reached the solver as job items, every run.
    for (const call of harness.workerCalls) {
      expect(call.items).toHaveLength(2);
    }

    const attempts = documentsOf(ATTEMPT_TYPE_ID);
    expect(attempts).toHaveLength(2);
    for (const attempt of attempts) {
      expect(attempt.lineage[ORDER_LINEAGE_KEY].toString()).toBe(orderId);
      expect(attempt.fields.result?.layouts?.length).toBeGreaterThan(0);
      expect(attempt.fields.result?.summary?.sheetCount).toBeGreaterThan(0);
    }

    // The durable artifact: the composed process plus what it produced.
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync('test-results', { recursive: true });
    writeFileSync(`test-results/facade-order-process-${tableType}.json`, JSON.stringify({
      process: 'facade order process',
      tableType,
      run: { status: run.status, steps: run.steps.length },
      container: documentsOf(ORDER_TYPE_ID).map(doc => ({ id: String(doc._id), name: doc.name })),
      cassetteDesigns: documentsOf('cassette-design').map(doc => ({
        id: String(doc._id), name: doc.name, parameters: doc.fields.parameters
      })),
      materials: documentsOf('sheet-material').map(doc => ({ id: String(doc._id), code: doc.fields.code })),
      nestingAttempts: documentsOf(ATTEMPT_TYPE_ID).map(doc => ({
        id: String(doc._id), summary: doc.fields.result?.summary
      })),
      workerRequests: harness.workerCalls.map(call => call.params)
    }, null, 2));
  }, 20000);
});
