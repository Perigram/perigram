import { describe, expect, it, vi } from 'vitest';

const { mockedHasInstanceAccess } = vi.hoisted(() => ({
  mockedHasInstanceAccess: vi.fn(() => true)
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));
vi.mock('./organization-sequence.js', () => ({
  runOrganizationChange: vi.fn(async (_organizationId, _metadata, mutate) => await mutate()),
  recordOrganizationChange: vi.fn(async () => 1),
  getOrganizationChangeSequence: vi.fn(async () => 0),
  withOrganizationChangeSequence: vi.fn()
}));
vi.mock('../files/service.js', () => ({
  uploadFile: vi.fn(async (buffer, filename) => ({ id: `stored-${filename}`, filename, url: '#' })),
  deleteFile: vi.fn(async () => {}),
  getFileBuffer: vi.fn(async () => Buffer.from('uploaded'))
}));
vi.mock('../instance-revisions/service.js', () => ({
  ensureForEntitySnapshot: vi.fn(async () => ({ _id: 'rev-1', data: { number: 1, contentHash: 'sha256:x' } })),
  getCurrentForEntity: vi.fn(),
  getById: vi.fn(),
  pinnedRevisionFile: vi.fn()
}));
vi.mock('../../core/access/service.js', () => ({
  hasInstanceAccess: mockedHasInstanceAccess
}));
vi.mock('../plugins/repository.js', () => ({
  listDeclarationsByOrganization: vi.fn(async () => []),
  findDeclarationByTypeId: vi.fn()
}));
vi.mock('../plugins/service.js', () => ({
  invokeConstructionValueService: vi.fn(),
  constructionsForOrganization: vi.fn(async () => ({}))
}));
vi.mock('../workflow-overrides/service.js', () => ({
  resolveActiveWorkflow: vi.fn(async () => null)
}));

vi.mock('../cts-types/repository.js', () => ({
  findByTypeId: vi.fn(async () => null),
  listByOrganization: vi.fn(async () => [])
}));

import { applyConstructionService, previewConstructionService, serviceBackedConstruction, storedConstructionDraft } from './construction-services.js';
import { invokeConstructionValueService, constructionsForOrganization } from '../plugins/service.js';
import * as filesService from '../files/service.js';
import * as pluginInstalls from '../plugins/repository.js';
import * as revisionService from '../instance-revisions/service.js';

const connectDB = (await import('~/server/db/mongo')).connectDB;
const db = { collection: vi.fn() };
connectDB.mockResolvedValue(db);

const REPORT_TYPE = {
  id: 'report',
  class: 'file',
  version: 1,
  payload: {
    mime: ['application/pdf'],
    accept: ['.pdf'],
    maxSize: 64,
    inputs: { mapping: { base: 'json' } }
  },
  fields: { name: { base: 'string', identifier: true } }
};
const PLAIN_TYPE = { id: 'plain', class: 'item', version: 1, fields: { name: { base: 'string' } } };
const DRAWING_TYPE = {
  id: 'drawing',
  class: 'file',
  version: 1,
  payload: { mime: ['application/dxf'], accept: ['.dxf'], maxSize: 1048576 },
  fields: { name: { base: 'string', identifier: true } },
  operators: {
    place: {
      id: 'place',
      species: 'construct',
      input: {
        base: 'record',
        fields: {
          name: { base: 'string', nullable: true },
          template: { base: 'ref', accepts: ['drawing'] },
          parts: { base: 'list', itemType: { base: 'ref', accepts: ['drawing'] } }
        }
      }
    }
  }
};
pluginInstalls.findDeclarationByTypeId.mockImplementation(async (organizationId, typeId) => (
  typeId === 'report' ? REPORT_TYPE : typeId === 'plain' ? PLAIN_TYPE : typeId === 'drawing' ? DRAWING_TYPE : null
));
constructionsForOrganization.mockImplementation(async organizationId => (
  organizationId === 'org-1'
    ? {
        report: { fromTemplate: 'plugin.docs.fill', upload: 'plugin.docs.upload' },
        plain: { fromTemplate: 'plugin.docs.fill' },
        drawing: { place: 'plugin.td.place-dxf' }
      }
    : {}
));

function stubCollection() {
  const coll = { insertOne: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), find: vi.fn(), deleteOne: vi.fn() };
  coll.find.mockReturnValue({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) });
  db.collection.mockReturnValue(coll);
  return coll;
}

const CONTEXT = { userId: 'u1', organizationId: 'org-1', role: 'admin' };
const b64 = value => Buffer.from(value, 'utf8').toString('base64');

function executorOutput(output) {
  invokeConstructionValueService.mockResolvedValueOnce(output);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedHasInstanceAccess.mockReturnValue(true);
  invokeConstructionValueService.mockReset();
  connectDB.mockResolvedValue(db);
});

describe('service-backed construction executor payloads (SPEC §24)', () => {
  it('stores an executor payload as the created instance payload beside merged fields', async () => {
    stubCollection();
    executorOutput({ data: { pages: 2 }, payload: { base64: b64('%PDF-1.4 filled'), mime: 'application/pdf', name: 'passport.pdf' } });

    const dto = await serviceBackedConstruction('report', 'fromTemplate')({ name: 'Passport' }, CONTEXT);

    expect(filesService.uploadFile).toHaveBeenCalledWith(
      Buffer.from('%PDF-1.4 filled'),
      'passport.pdf',
      { userId: 'u1', organizationId: 'org-1', type: 'report' },
      'files'
    );
    expect(dto.payload).toEqual({ fileId: 'stored-passport.pdf', mime: 'application/pdf', size: 15, name: 'passport.pdf' });
    expect(dto.fields).toEqual({ pages: 2 });
    expect(filesService.deleteFile).not.toHaveBeenCalled();
  });

  it('derives the stored filename from the draft name and the declared extension', async () => {
    stubCollection();
    executorOutput({ payload: { base64: b64('%PDF-1.4'), mime: 'application/pdf' } });

    const dto = await serviceBackedConstruction('report', 'fromTemplate')({ name: 'Sheet A' }, CONTEXT);

    expect(dto.payload).toEqual({ fileId: 'stored-Sheet A.pdf', mime: 'application/pdf', size: 8, name: 'Sheet A.pdf' });
  });

  it('rejects undeclared user fields even when an executor returns additional fields', async () => {
    stubCollection();
    executorOutput({ data: { pages: 2 } });

    await expect(serviceBackedConstruction('report', 'fromTemplate')({
      name: 'Passport',
      fields: { userSuppliedUnknown: true }
    }, CONTEXT)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates without a payload when the executor returns none', async () => {
    const coll = stubCollection();
    executorOutput({ data: { geometry: { ok: true } } });

    const dto = await serviceBackedConstruction('report', 'fromTemplate')({ name: 'X' }, CONTEXT);

    expect(filesService.uploadFile).not.toHaveBeenCalled();
    expect(dto.payload).toBeUndefined();
    expect(dto.fields).toEqual({ geometry: { ok: true } });
    expect(coll.insertOne).toHaveBeenCalled();
  });

  it('overrides the draft uploaded payload with the executor payload', async () => {
    executorOutput({ payload: { base64: b64('%PDF-1.4 normalized'), mime: 'application/pdf' } });

    const merged = await applyConstructionService('report', 'upload', {
      name: 'U',
      payload: { fileId: 'uploaded-1', mime: 'application/pdf', size: 4 }
    }, CONTEXT);

    expect(merged.payload.fileId).toBe('stored-U.pdf');
    expect(merged.payload.size).toBe(19);
  });

  it('passes payload-declared construction inputs into the executor draft', async () => {
    executorOutput({ data: { geometry: { ok: true } } });

    await applyConstructionService('report', 'upload', {
      payload: { fileId: 'uploaded-1', mime: 'application/pdf', size: 4 },
      mapping: { SOURCE: 'cut.outer' }
    }, CONTEXT);

    const [, call] = invokeConstructionValueService.mock.calls[0];
    expect(call.mode).toBe('upload');
    expect(call.draft.data).toEqual({ mapping: { SOURCE: 'cut.outer' } });
  });

  it('refuses an executor mime the declared traits reject and deletes the stored blob', async () => {
    executorOutput({ payload: { base64: b64('nope'), mime: 'text/plain' } });

    await expect(serviceBackedConstruction('report', 'fromTemplate')({ name: 'X' }, CONTEXT))
      .rejects.toThrow(/Payload mime text\/plain is not accepted by report/);
    expect(filesService.deleteFile).toHaveBeenCalledWith('stored-X.pdf', 'files');
  });

  it('refuses an executor payload over the declared size limit and deletes the stored blob', async () => {
    executorOutput({ payload: { base64: b64('x'.repeat(65)), mime: 'application/pdf' } });

    await expect(serviceBackedConstruction('report', 'fromTemplate')({ name: 'X' }, CONTEXT))
      .rejects.toThrow(/exceeds the 64-byte limit of report/);
    expect(filesService.deleteFile).toHaveBeenCalledWith('stored-X.pdf', 'files');
  });

  it('refuses an executor payload for a type that declares no payload traits', async () => {
    executorOutput({ payload: { base64: b64('x'), mime: 'text/plain' } });

    await expect(serviceBackedConstruction('plain', 'fromTemplate')({ name: 'X' }, CONTEXT))
      .rejects.toThrow(/plain declares no payload/);
    expect(filesService.deleteFile).toHaveBeenCalled();
  });

  it('refuses malformed executor payloads before storing anything', async () => {
    executorOutput({ payload: { mime: 'application/pdf' } });
    await expect(serviceBackedConstruction('report', 'fromTemplate')({ name: 'X' }, CONTEXT))
      .rejects.toThrow(/plugin\.docs\.fill payload requires base64 and mime/);

    executorOutput({ payload: { base64: '!!!not-base64!!!', mime: 'application/pdf' } });
    await expect(serviceBackedConstruction('report', 'fromTemplate')({ name: 'X' }, CONTEXT))
      .rejects.toThrow(/payload base64 does not decode/);

    expect(filesService.uploadFile).not.toHaveBeenCalled();
  });

  it('passes the draft through when the org binds no service for the mode', async () => {
    const draft = { name: 'X', fields: { a: 1 } };
    const merged = await applyConstructionService('report', 'fromTemplate', draft, { userId: 'u1', organizationId: 'org-2' });
    expect(merged).toBe(draft);
    expect(invokeConstructionValueService).not.toHaveBeenCalled();
  });

  it('refuses with the structured failures body an executor refusal names (SPEC §24)', async () => {
    stubCollection();
    executorOutput({ failures: [{ name: 'logo', message: 'spot logo has no matching part' }] });

    await expect(applyConstructionService('report', 'fromTemplate', { name: 'X' }, CONTEXT))
      .rejects.toMatchObject({
        statusCode: 422,
        message: 'logo: spot logo has no matching part',
        data: { failures: [{ name: 'logo', message: 'spot logo has no matching part' }] }
      });
    expect(filesService.uploadFile).not.toHaveBeenCalled();
  });

  it('resolves a list-of-ref input item by item with payloads (SPEC §24)', async () => {
    const coll = stubCollection();
    const stored = new Map([
      ['t1', { _id: 't1', type: 'drawing', organizationId: 'org-1', name: 'Sheet template', data: {}, payload: { fileId: 'f-t', mime: 'application/dxf' } }],
      ['p1', { _id: 'p1', type: 'drawing', organizationId: 'org-1', name: 'frame', data: {}, payload: { fileId: 'f-1', mime: 'application/dxf' } }],
      ['p2', { _id: 'p2', type: 'drawing', organizationId: 'org-1', name: 'logo', data: {}, payload: { fileId: 'f-2', mime: 'application/dxf' } }]
    ]);
    coll.findOne.mockImplementation(query => stored.get(String(query._id)) || null);
    executorOutput({ payload: { base64: b64('0\nEOF\n'), mime: 'application/dxf' } });

    const merged = await applyConstructionService('drawing', 'place', {
      name: 'Site plan',
      data: { template: 't1', parts: ['p1', 'p2'] }
    }, CONTEXT);

    const [, call] = invokeConstructionValueService.mock.calls[0];
    expect(call.refs.template.name).toBe('Sheet template');
    expect(call.refs.template.payloadBase64).toBe(b64('uploaded'));
    expect(call.refs.parts.map(part => part.name)).toEqual(['frame', 'logo']);
    expect(call.refs.parts.every(part => part.payloadBase64 === b64('uploaded'))).toBe(true);
    expect(merged.payload.fileId).toBe('stored-Site plan.dxf');
  });

  it('does not resolve same-organization construction refs without a read grant', async () => {
    const coll = stubCollection();
    coll.findOne.mockImplementation(query => String(query._id) === 't1'
      ? { _id: 't1', type: 'drawing', organizationId: 'org-1', name: 'Private template', data: {}, payload: { fileId: 'f-t', mime: 'application/dxf' } }
      : null);
    mockedHasInstanceAccess.mockReturnValue(false);

    await expect(applyConstructionService('drawing', 'place', {
      name: 'Site plan',
      data: { template: 't1' }
    }, {
      ...CONTEXT,
      executionAuth: { userId: 'u1', organizationId: 'org-1', memberships: [] }
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(invokeConstructionValueService).not.toHaveBeenCalled();
    expect(filesService.getFileBuffer).not.toHaveBeenCalled();
  });

  it('refuses a list-of-ref item none of the accepted types serves', async () => {
    const coll = stubCollection();
    const stored = new Map([
      ['t1', { _id: 't1', type: 'drawing', organizationId: 'org-1', name: 'Sheet template', data: {}, payload: { fileId: 'f-t', mime: 'application/dxf' } }]
    ]);
    coll.findOne.mockImplementation(query => stored.get(String(query._id)) || null);
    await expect(applyConstructionService('drawing', 'place', {
      name: 'X',
      data: { template: 't1', parts: ['ghost'] }
    }, CONTEXT)).rejects.toThrow(/Construction input parts references ghost/);
  });
});

describe('construction preview (SPEC §24)', () => {
  it('returns the composed payload as base64 wire beside computed fields, persisting nothing', async () => {
    stubCollection();
    executorOutput({ data: { placed: 2 }, payload: { base64: b64('composed dxf'), mime: 'application/dxf', name: 'sheet.dxf' } });

    const preview = await previewConstructionService('drawing', 'place', { name: 'Sheet' }, CONTEXT);

    expect(preview).toEqual({
      payload: { base64: b64('composed dxf'), mime: 'application/dxf', name: 'sheet.dxf' },
      fields: { placed: 2 }
    });
    expect(filesService.uploadFile).not.toHaveBeenCalled();
  });

  it('returns a null payload when the executor emits fields only', async () => {
    stubCollection();
    executorOutput({ data: { pages: 3 } });

    const preview = await previewConstructionService('report', 'fromTemplate', { name: 'X' }, CONTEXT);

    expect(preview).toEqual({ payload: null, fields: { pages: 3 } });
  });

  it('passes the executor meta through the preview and never into the created fields', async () => {
    stubCollection();
    executorOutput({ data: { pages: 2 }, meta: { tokens: ['client', 'date'] }, payload: { base64: b64('%PDF'), mime: 'application/pdf' } });

    const preview = await previewConstructionService('report', 'fromTemplate', { name: 'X' }, CONTEXT);
    expect(preview.meta).toEqual({ tokens: ['client', 'date'] });

    executorOutput({ data: { pages: 2 }, meta: { tokens: ['client', 'date'] }, payload: { base64: b64('%PDF'), mime: 'application/pdf' } });
    const dto = await serviceBackedConstruction('report', 'fromTemplate')({ name: 'X' }, CONTEXT);
    expect(dto.fields).toEqual({ pages: 2 });
    expect(dto.meta).toBeUndefined();
  });

  it('answers null when the org binds no service for the mode', async () => {
    await expect(previewConstructionService('drawing', 'fill', {}, CONTEXT)).resolves.toBe(null);
    await expect(previewConstructionService('drawing', 'place', {}, { userId: 'u1', organizationId: 'org-2' })).resolves.toBe(null);
    expect(invokeConstructionValueService).not.toHaveBeenCalled();
  });

  it('refuses 400 without organization context', async () => {
    await expect(previewConstructionService('report', 'fromTemplate', {}, { userId: 'u1' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('propagates the structured refusal body the executor names', async () => {
    executorOutput({ failures: [{ name: 'hinge', message: 'spot hinge has no matching part' }] });

    await expect(previewConstructionService('drawing', 'place', {}, CONTEXT))
      .rejects.toMatchObject({
        statusCode: 422,
        data: { failures: [{ name: 'hinge', message: 'spot hinge has no matching part' }] }
      });
    expect(filesService.uploadFile).not.toHaveBeenCalled();
  });
});

describe('revision pinning (SPEC §24 version fabric)', () => {
  const SOURCE_TYPE = {
    id: 'dxftpl',
    class: 'file',
    version: 1,
    revisions: 'geometry',
    payload: { mime: ['application/dxf'], accept: ['.dxf'], maxSize: 1048576 },
    fields: { name: { base: 'string', identifier: true } }
  };
  const SHEET_TYPE = {
    id: 'sheetd',
    class: 'file',
    version: 1,
    revisions: 'geometry',
    payload: { mime: ['application/dxf'], accept: ['.dxf'], maxSize: 1048576 },
    fields: {
      name: { base: 'string', identifier: true },
      template: { base: 'ref', accepts: ['dxftpl'] },
      parts: { base: 'list', itemType: { base: 'ref', accepts: ['dxftpl'] } }
    },
    operators: {
      place: {
        id: 'place',
        species: 'construct',
        input: {
          base: 'record',
          fields: {
            name: { base: 'string', nullable: true },
            template: { base: 'ref', accepts: ['dxftpl'] },
            parts: { base: 'list', itemType: { base: 'ref', accepts: ['dxftpl'] } }
          }
        }
      }
    }
  };

  function stubStored(type = 'dxftpl') {
    const coll = stubCollection();
    const stored = new Map([
      ['t1', { _id: 't1', type, organizationId: 'org-1', name: 'Sheet template', data: {}, payload: { fileId: 'f-t', mime: 'application/dxf' } }],
      ['p1', { _id: 'p1', type, organizationId: 'org-1', name: 'frame', data: {}, payload: { fileId: 'f-1', mime: 'application/dxf' } }]
    ]);
    coll.findOne.mockImplementation(query => stored.get(String(query._id)) || null);
    return coll;
  }

  beforeEach(() => {
    pluginInstalls.findDeclarationByTypeId.mockImplementation(async (organizationId, typeId) => (
      typeId === 'sheetd' ? SHEET_TYPE
        : typeId === 'dxftpl' ? SOURCE_TYPE
          : typeId === 'drawing' ? DRAWING_TYPE
            : null
    ));
    constructionsForOrganization.mockImplementation(async organizationId => (
      organizationId === 'org-1' ? { drawing: { place: 'plugin.td.place-dxf' }, sheetd: { place: 'plugin.td.place-dxf' } } : {}
    ));
    revisionService.getCurrentForEntity.mockResolvedValue({ _id: 'rev-9' });
    revisionService.getById.mockReset();
    revisionService.pinnedRevisionFile.mockResolvedValue(null);
  });

  it('stamps resolved revisions onto declared ref fields and provenance sources', async () => {
    stubStored();
    executorOutput({ data: { geometry: { ok: true } } });

    const merged = await applyConstructionService('sheetd', 'place', {
      name: 'Site plan',
      data: { template: 't1', parts: ['p1'] },
      provenance: { op: 'cts.construct:n1:place', sources: [{ type: 'drawing', id: 't1' }] }
    }, CONTEXT);

    expect(merged.relations.template).toEqual({ type: 'dxftpl', id: 't1', revision: 'rev-9' });
    expect(merged.relations.parts).toEqual([{ type: 'dxftpl', id: 'p1', revision: 'rev-9' }]);
    expect(merged.provenance.sources).toEqual([
      { type: 'drawing', id: 't1' },
      { type: 'dxftpl', id: 't1', revision: 'rev-9' },
      { type: 'dxftpl', id: 'p1', revision: 'rev-9' }
    ]);
    const [, call] = invokeConstructionValueService.mock.calls[0];
    expect(call.refs.template.revision).toBe('rev-9');
    expect(call.pins).toEqual({
      template: { type: 'dxftpl', id: 't1', revision: 'rev-9' },
      parts: [{ type: 'dxftpl', id: 'p1', revision: 'rev-9' }]
    });
  });

  it('collapses executor-declared relation refs by target identity', async () => {
    stubStored();
    executorOutput({
      data: { geometry: { ok: true } },
      relations: {
        parts: [
          { type: 'dxftpl', id: 'p1', revision: 'rev-9' },
          { type: 'dxftpl', id: 'p1', revision: 'rev-9' },
          { type: 'dxftpl', id: 'p2', revision: 'rev-9' }
        ]
      }
    });

    const merged = await applyConstructionService('sheetd', 'place', { name: 'Sheet' }, CONTEXT);

    expect(merged.relations.parts).toEqual([
      { type: 'dxftpl', id: 'p1', revision: 'rev-9' },
      { type: 'dxftpl', id: 'p2', revision: 'rev-9' }
    ]);
  });

  it('stamps no field when the type declares no ref field, and no pin when the source type has no revision scope', async () => {
    stubStored('drawing');
    revisionService.getCurrentForEntity.mockResolvedValue(null);
    executorOutput({ data: { geometry: { ok: true } } });

    const merged = await applyConstructionService('drawing', 'place', {
      name: 'Site plan',
      data: { template: 't1', parts: ['p1'] }
    }, CONTEXT);

    expect(merged.relations?.template).toBeUndefined();
    expect(merged.relations?.parts).toBeUndefined();
    expect(merged.provenance).toBeUndefined();
    expect(revisionService.getCurrentForEntity).not.toHaveBeenCalled();
  });

  it('passes a spot assignment through to the executor beside the resolved ref', async () => {
    stubStored();
    revisionService.getCurrentForEntity.mockResolvedValue({ _id: 'rev-9' });
    executorOutput({ data: {} });

    const merged = await applyConstructionService('sheetd', 'place', {
      name: 'Assigned',
      data: { template: 't1', parts: [{ id: 'p1', spot: 'Marker' }] }
    }, CONTEXT);

    const [, call] = invokeConstructionValueService.mock.calls[0];
    expect(call.refs.parts[0]).toMatchObject({ id: 'p1', spot: 'Marker', revision: 'rev-9' });
    expect(merged.relations.parts).toEqual([{ type: 'dxftpl', id: 'p1', revision: 'rev-9' }]);
  });

  it('reads a stored pin against the frozen revision bytes only when it belongs to the authorized source', async () => {
    stubStored();
    revisionService.getById.mockResolvedValue({
      data: { source: { type: 'dxftpl', id: 't1' }, scope: 'geometry' }
    });
    revisionService.pinnedRevisionFile.mockResolvedValue({ fileId: 'f-rev3', bucket: 'files', mime: 'application/dxf', name: 'old.dxf' });
    filesService.getFileBuffer.mockImplementation(async fileId => Buffer.from(fileId === 'f-rev3' ? 'frozen' : 'uploaded'));
    executorOutput({ data: { geometry: { ok: true } } });

    const merged = await applyConstructionService('sheetd', 'place', {
      name: 'Re-run',
      data: { template: { type: 'dxftpl', id: 't1', revision: 'rev-3' } }
    }, CONTEXT);

    const [, call] = invokeConstructionValueService.mock.calls[0];
    expect(call.refs.template.payloadBase64).toBe(b64('frozen'));
    expect(call.refs.template.revision).toBe('rev-3');
    expect(merged.relations.template).toEqual({ type: 'dxftpl', id: 't1', revision: 'rev-3' });
  });

  it('refuses a revision pin from a different source before reading its frozen bytes', async () => {
    stubStored();
    revisionService.getById.mockResolvedValue({
      data: { source: { type: 'dxftpl', id: 'another-source' }, scope: 'geometry' }
    });

    await expect(applyConstructionService('sheetd', 'place', {
      name: 'Re-run',
      data: { template: { type: 'dxftpl', id: 't1', revision: 'foreign-revision' } }
    }, CONTEXT)).rejects.toMatchObject({ statusCode: 400 });

    expect(revisionService.pinnedRevisionFile).not.toHaveBeenCalled();
    expect(filesService.getFileBuffer).not.toHaveBeenCalled();
  });

  it('refuses a stored pin whose revision is gone', async () => {
    stubStored();
    revisionService.getById.mockResolvedValue({
      data: { source: { type: 'dxftpl', id: 't1' }, scope: 'geometry' }
    });
    revisionService.pinnedRevisionFile.mockResolvedValue(null);

    await expect(applyConstructionService('sheetd', 'place', {
      name: 'Re-run',
      data: { template: { type: 'dxftpl', id: 't1', revision: 'rev-gone' } }
    }, CONTEXT)).rejects.toThrow(/Pinned revision rev-gone no longer exists/);
  });

  it('builds the stored-inputs draft from declared fields, replay parameters, and source pins', () => {
    const record = {
      type: 'sheetd',
      name: 'Site plan',
      fields: {},
      relations: { template: { type: 'dxftpl', id: 't1', revision: 'rev-3' } },
      provenance: {
        op: 'cts.construct:n1:place',
        sources: [{ type: 'dxftpl', id: 't1', revision: 'rev-3' }, { type: 'dxftpl', id: 'p1', revision: 'rev-4' }],
        effective: { via: 'place', parameters: { template: 't1', parts: ['p1'] } }
      }
    };

    const draft = storedConstructionDraft(record, SHEET_TYPE, 'place');

    expect(draft.data).toEqual({
      template: { type: 'dxftpl', id: 't1', revision: 'rev-3' },
      parts: [{ type: 'dxftpl', id: 'p1', revision: 'rev-4' }]
    });
    expect(draft.fields).toEqual(record.fields);
    expect(draft.provenance).toEqual(record.provenance);
  });
});
