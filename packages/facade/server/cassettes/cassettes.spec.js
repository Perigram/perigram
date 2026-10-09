// Pack-operation specs over the §13 boundary: cassette CRUD, tenancy,
// payload validation, and revision chain are the generic instance
// service's contract (its specs own them); what this file pins is the
// pack's own semantics — the STANDARD DXF import (artifact → extracted
// geometry fields + payload) and the mount shape (no bridge: the generic
// resolver serves the type).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolverMock, artifactsGetByIdMock, getFileBufferMock, uploadFileMock } = vi.hoisted(() => ({
  resolverMock: vi.fn(),
  artifactsGetByIdMock: vi.fn(),
  getFileBufferMock: vi.fn(),
  uploadFileMock: vi.fn()
}));

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));
vi.mock('../../../features/artifacts/service.js', () => ({
  getById: artifactsGetByIdMock,
  createUploaded: vi.fn()
}));
vi.mock('../../../features/files/service.js', () => ({
  getFileBuffer: getFileBufferMock,
  uploadFile: uploadFileMock
}));
vi.mock('../../../features/instances/service.js', () => ({
  instanceServiceResolver: resolverMock
}));

import { importFromArtifact } from './service.js';
import { facadePack } from '../index.js';
import { createDefaultOccsCassetteTemplateDefinition } from '#utils/occs/templates.js';

const AUTH = { userId: 'user-1', organizationId: 'org-1', role: 'owner' };

function dxfWithCutOuter() {
  // One closed rectangle on the canonical nesting layer — enough for the
  // extractor to produce one polygon part.
  const polyline = (points, layer) => [
    '0', 'LWPOLYLINE', '8', layer, '90', String(points.length), '70', '1',
    ...points.flatMap(([x, y]) => ['10', String(x), '20', String(y)])
  ];
  return [
    '0', 'SECTION', '2', 'ENTITIES',
    ...polyline([[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]], 'cut.outer'),
    '0', 'ENDSEC', '0', 'EOF'
  ].join('\n');
}

describe('cassette pack operations (§13)', () => {
  let created;

  beforeEach(() => {
    vi.clearAllMocks();
    created = [];
    resolverMock.mockReturnValue({
      create: vi.fn(async draft => {
        created.push(draft);
        return { _id: `cassette-${created.length}`, ...draft };
      })
    });
  });

  it('imports a DXF_SOURCE artifact as a STANDARD template with extracted geometry and payload', async () => {
    const dxf = dxfWithCutOuter();
    artifactsGetByIdMock.mockResolvedValue({
      _id: 'artifact-1',
      identity: { name: 'Tray.dxf' },
      data: { type: 'DXF_SOURCE' },
      attachments: { primary: { fileId: 'dxf-1', name: 'Tray.dxf' } }
    });
    getFileBufferMock.mockResolvedValue(Buffer.from(dxf, 'utf8'));
    uploadFileMock.mockResolvedValue({ id: 'stored-1' });

    const template = await importFromArtifact('artifact-1', 'Tray 600', AUTH, { 'cut.outer': 'cut.outer' });

    expect(template._id).toBe('cassette-1');
    const draft = created[0];
    expect(draft.identity.name).toBe('Tray 600');
    expect(draft.data.templateType).toBe('STANDARD');
    expect(draft.data.polygonParts.length).toBeGreaterThan(0);
    expect(draft.data.mapping).toEqual({ 'cut.outer': 'cut.outer' });
    expect(draft.payload).toMatchObject({ fileId: 'stored-1', mime: 'application/dxf' });
    expect(draft.provenance.sources).toEqual([{ type: 'artifact', id: 'artifact-1' }]);
    expect(uploadFileMock).toHaveBeenCalledWith(expect.any(Buffer), 'Tray.dxf', expect.objectContaining({ type: 'cassette' }), 'files');
  });

  it('refuses an import whose DXF carries no closed cut.outer polygon', async () => {
    artifactsGetByIdMock.mockResolvedValue({
      _id: 'artifact-2',
      data: { type: 'DXF_SOURCE' },
      attachments: { primary: { fileId: 'dxf-2' } }
    });
    getFileBufferMock.mockResolvedValue(Buffer.from(['0', 'SECTION', '2', 'ENTITIES', '0', 'ENDSEC', '0', 'EOF'].join('\n'), 'utf8'));

    await expect(importFromArtifact('artifact-2', 'Empty', AUTH, {})).rejects.toMatchObject({ statusCode: 400 });
    expect(created).toHaveLength(0);
  });

  it('mounts no cassette bridge: the generic resolver serves the type', () => {
    expect(facadePack.instanceServices.cassette).toBeUndefined();
    expect(facadePack.processLists.cassette).toBeUndefined();
    expect(facadePack.processReads.cassette).toBeUndefined();
    expect(facadePack.constructionHandlers.cassette).toBeUndefined();
  });

  it('bake resolves the template through the generic service', async () => {
    const definition = createDefaultOccsCassetteTemplateDefinition();
    resolverMock.mockReturnValue({
      getById: vi.fn(async () => ({
        _id: 'template-9',
        identity: { uid: 'template-9', name: 'Tray 600' },
        lineage: { organizationId: 'org-1' },
        attachments: { primary: { fileId: 'file-9' } }
      })),
      create: vi.fn(async draft => ({ _id: 'design-1', ...draft }))
    });
    getFileBufferMock.mockResolvedValue(Buffer.from(JSON.stringify(definition), 'utf8'));

    const { bakeCassetteDesign } = await import('./cassette-design-construction.js');
    const design = await bakeCassetteDesign({
      data: { template: 'template-9', parameters: { A: 600, B: 450, R: 30 } }
    }, { userId: 'user-1', organizationId: 'org-1' });

    expect(design.data.template).toBe('template-9');
    expect(design.data.geometry.nestingPolygons.length).toBeGreaterThan(0);
  });
});
