import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultOccsCassetteTemplateDefinition } from '#utils/occs/templates.js';

const { resolverMock, getFileBufferMock } = vi.hoisted(() => ({
  resolverMock: vi.fn(),
  getFileBufferMock: vi.fn()
}));

vi.mock('#services/features/instances/service.js', () => ({
  instanceServiceResolver: resolverMock
}));
vi.mock('#services/features/files/service.js', () => ({
  getFileBuffer: getFileBufferMock,
  uploadFile: vi.fn()
}));

import { evaluateTemplate } from './evaluation.js';

const definition = createDefaultOccsCassetteTemplateDefinition();

describe('cassette OCCS evaluation', () => {
  beforeEach(() => {
    resolverMock.mockReset();
    getFileBufferMock.mockReset();
  });

  it('evaluates the payload OCCS document — the one definition home', async () => {
    resolverMock.mockReturnValue({
      getById: vi.fn(async () => ({
        _id: 'template-1',
        identity: { uid: 'template-1', name: 'Template 1' },
        attachments: { primary: { fileId: 'file-1' } }
      }))
    });
    getFileBufferMock.mockResolvedValue(Buffer.from(JSON.stringify(definition), 'utf8'));

    const result = await evaluateTemplate('template-1', { A: 700, B: 300, R: 40 });

    expect(result.nestingPolygons).toHaveLength(1);
    expect(result.nestingPolygons[0]).toMatchObject({
      workpieceId: 'wp_1',
      workpieceDefinitionId: 'wp_1_def',
      occurrenceId: 'wp_1'
    });
  });

  it('refuses a template whose payload is not an OCCS document', async () => {
    resolverMock.mockReturnValue({
      getById: vi.fn(async () => ({
        _id: 'template-2',
        identity: { uid: 'template-2', name: 'Template 2' },
        attachments: { primary: { fileId: 'file-2' } }
      }))
    });
    getFileBufferMock.mockResolvedValue(Buffer.from(JSON.stringify({ params: {} }), 'utf8'));

    await expect(evaluateTemplate('template-2', {})).rejects.toMatchObject({ statusCode: 422 });
  });
});
