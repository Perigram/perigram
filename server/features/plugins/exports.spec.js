import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../core/access/service.js', () => ({ assertEntityAccess: vi.fn(() => true) }));
vi.mock('../files/service.js', () => ({
  uploadFile: vi.fn(async (buffer, filename, meta, bucket, mime) => ({ id: `stored-${filename}`, filename, mime })),
  getFileBuffer: vi.fn(async () => Buffer.from('uploaded'))
}));
vi.mock('../instances/service.js', () => ({
  declarationForType: vi.fn(async () => ({ id: 'text-document' })),
  instanceServiceResolver: vi.fn(() => ({
    getById: vi.fn(async () => ({
      _id: 'src-1',
      type: 'text-document',
      name: 'Report A',
      fields: { title: 'Q4' },
      payload: { fileId: 'file-1', mime: 'text/markdown', name: 'report.md' }
    }))
  })),
  writeGrantTarget: vi.fn(async () => ({ typeId: 'text-document', feature: 'text-document' }))
}));
vi.mock('./service.js', () => ({
  executeConnectorService: vi.fn(),
  exportersForOrganization: vi.fn(async () => [])
}));

import { generateAttachment } from './operations.js';
import { executeConnectorService, exportersForOrganization } from './service.js';
import * as filesService from '../files/service.js';

const b64 = value => Buffer.from(value, 'utf8').toString('base64');
const AUTH = { userId: 'u1', organizationId: 'org-1' };
const ENTITIES = { source: { type: 'text-document', _id: 'src-1' } };

function bindExport(binding) {
  exportersForOrganization.mockImplementation(async () => [binding]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateAttachment (exports are declarations, SPEC §21)', () => {
  it('stores the executor payload with the service mime and name', async () => {
    bindExport({ typeId: 'text-document', kind: 'pdf', service: 'plugin.documents.render-pdf' });
    executeConnectorService.mockResolvedValueOnce({
      payload: { base64: b64('%PDF-1.4'), mime: 'application/pdf', name: 'report.pdf' }
    });

    const result = await generateAttachment({ entities: ENTITIES, parameters: { kind: 'pdf' }, auth: AUTH });

    expect(filesService.uploadFile).toHaveBeenCalledWith(
      Buffer.from('%PDF-1.4'),
      'report.pdf',
      { userId: 'u1', organizationId: 'org-1', exportedFrom: 'text-document:src-1', kind: 'pdf' },
      'files',
      'application/pdf'
    );
    expect(result.data).toEqual({ kind: 'pdf', fileId: 'stored-report.pdf', name: 'report.pdf', mimeType: 'application/pdf' });
    expect(result.events[0].type).toBe('attachment.generationCompleted');
  });

  it('derives the stored name from the instance name and the declared kind', async () => {
    bindExport({ typeId: 'text-document', kind: 'pdf', service: 'plugin.documents.render-pdf' });
    executeConnectorService.mockResolvedValueOnce({
      payload: { base64: b64('%PDF-1.4'), mime: 'application/pdf' }
    });

    await generateAttachment({ entities: ENTITIES, parameters: { kind: 'pdf' }, auth: AUTH });

    expect(filesService.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'Report A.pdf',
      expect.any(Object),
      'files',
      'application/pdf'
    );
  });

  it('sends the source instance as values with its payload as base64', async () => {
    bindExport({ typeId: 'text-document', kind: 'pdf', service: 'plugin.documents.render-pdf' });
    executeConnectorService.mockResolvedValueOnce({ payload: { base64: b64('%PDF-1.4'), mime: 'application/pdf' } });

    await generateAttachment({ entities: ENTITIES, parameters: { kind: 'pdf' }, auth: AUTH });

    const [, call] = executeConnectorService.mock.calls[0];
    expect(call.parameters).toEqual({
      typeId: 'text-document',
      id: 'src-1',
      name: 'Report A',
      fields: { title: 'Q4' },
      payloadBase64: b64('uploaded'),
      payloadMime: 'text/markdown'
    });
  });

  it('refuses a service that returns no payload', async () => {
    bindExport({ typeId: 'text-document', kind: 'pdf', service: 'plugin.documents.render-pdf' });
    executeConnectorService.mockResolvedValueOnce({ dxf: 'legacy shape' });

    await expect(generateAttachment({ entities: ENTITIES, parameters: { kind: 'pdf' }, auth: AUTH }))
      .rejects.toThrow(/returned no payload/);
    expect(filesService.uploadFile).not.toHaveBeenCalled();
  });

  it('refuses a malformed executor payload before storing anything', async () => {
    bindExport({ typeId: 'text-document', kind: 'pdf', service: 'plugin.documents.render-pdf' });
    executeConnectorService.mockResolvedValueOnce({ payload: { base64: b64('x') } });

    await expect(generateAttachment({ entities: ENTITIES, parameters: { kind: 'pdf' }, auth: AUTH }))
      .rejects.toThrow(/payload requires base64 and mime/);
    expect(filesService.uploadFile).not.toHaveBeenCalled();
  });

  it('refuses a kind no installed plugin exports for the source type', async () => {
    exportersForOrganization.mockImplementation(async () => []);
    await expect(generateAttachment({ entities: ENTITIES, parameters: { kind: 'pdf' }, auth: AUTH }))
      .rejects.toThrow(/No installed plugin exports pdf from text-document/);
  });
});
