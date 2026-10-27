import { describe, expect, it, vi } from 'vitest';

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));
vi.mock('../files/service.js', () => ({
  uploadFile: vi.fn(async (buffer, filename) => ({ id: `stored-${filename}`, filename, url: '#' })),
  deleteFile: vi.fn(async () => {}),
  getFileBuffer: vi.fn(async () => Buffer.from('uploaded'))
}));
vi.mock('../instance-revisions/service.js', () => ({
  ensureForEntitySnapshot: vi.fn(async () => ({ _id: 'rev-1', data: { number: 1, contentHash: 'sha256:x' } }))
}));
vi.mock('../../core/access/service.js', () => ({
  hasInstanceAccess: vi.fn(() => true)
}));
vi.mock('../plugins/repository.js', () => ({
  listDeclarationsByOrganization: vi.fn(async () => []),
  findDeclarationByTypeId: vi.fn()
}));
vi.mock('../plugins/service.js', () => ({
  executeConnectorService: vi.fn(),
  constructionsForOrganization: vi.fn(async () => ({}))
}));
vi.mock('../workflow-overrides/service.js', () => ({
  resolveActiveWorkflow: vi.fn(async () => null)
}));
vi.mock('../cts-types/repository.js', () => ({
  findByTypeId: vi.fn(async () => null),
  listByOrganization: vi.fn(async () => [])
}));

import { applyConstructionService, serviceBackedConstruction } from './construction-services.js';
import { executeConnectorService, constructionsForOrganization } from '../plugins/service.js';
import * as filesService from '../files/service.js';
import * as pluginInstalls from '../plugins/repository.js';

const connectDB = (await import('~/server/db/mongo')).connectDB;
const db = { collection: vi.fn() };
connectDB.mockResolvedValue(db);

const REPORT_TYPE = {
  id: 'report',
  class: 'file',
  version: 1,
  payload: { mime: ['application/pdf'], accept: ['.pdf'], maxSize: 64 },
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
  executeConnectorService.mockResolvedValueOnce(output);
}

beforeEach(() => {
  vi.clearAllMocks();
  executeConnectorService.mockReset();
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
    expect(executeConnectorService).not.toHaveBeenCalled();
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

    const [, call] = executeConnectorService.mock.calls[0];
    expect(call.parameters.refs.template.name).toBe('Sheet template');
    expect(call.parameters.refs.template.payloadBase64).toBe(b64('uploaded'));
    expect(call.parameters.refs.parts.map(part => part.name)).toEqual(['frame', 'logo']);
    expect(call.parameters.refs.parts.every(part => part.payloadBase64 === b64('uploaded'))).toBe(true);
    expect(merged.payload.fileId).toBe('stored-Site plan.dxf');
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
