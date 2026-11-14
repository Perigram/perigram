import { describe, expect, it, vi } from 'vitest';

vi.mock('../plugins/repository.js', async () => {
  const { facadePackContent } = await import('../../../test-tools/facade-plugin.js');
  return {
    listDisabledPacks: vi.fn(async () => []),
    enablePack: vi.fn(),
    disablePack: vi.fn(),
    listInstallsByOrganization: vi.fn(async () => []),
    listDeclarationsByOrganization: vi.fn(async () => facadePackContent.types),
    findDeclarationByTypeId: vi.fn(async (organizationId, typeId) => (
      facadePackContent.types.find(type => type.id === String(typeId)) || null
    )),
    findInstallByConnectorToken: vi.fn(async () => null)
  };
});
vi.mock('../cts-types/service.js', async () => {
  const cts = await import('#packages/cts');
  const { facadePackContent } = await import('../../../test-tools/facade-plugin.js');
  const registry = cts.createTypeRegistry({ id: 'spec-cts' });
  for (const declaration of [...cts.frameworkTypes, ...facadePackContent.types]) {
    registry.defineType(declaration);
  }
  return { compileRegistryForOrganization: async () => registry };
});
import { compileActiveProcessRuntime, resolveCompiledProducerOutputWorkflow } from './runtime.js';

const compiled = {
  producerOutputs: {
    'create:entity': { typeId: 'cassette', workflow: { primaryRegion: 'main' } },
    'import:entity': { typeId: 'cassette', workflow: { primaryRegion: 'imported' } }
  },
};

describe('process workflow resolution', () => {
  it('repairs a persisted operational producer before compiling active runtime', async () => {
    const id = 'processNode_1785860422855';
    const result = await compileActiveProcessRuntime({
      dataflowVersion: 4,
      graphProtocol: 5,
      processNodes: {
        [id]: {
          id,
          kind: 'cts.construct',
          typeId: 'cassette',
          construction: { mode: 'genericCreate', inputs: [] },
          trigger: { mode: 'manual' }
        }
      },
      graph: { nodes: [{ id, type: 'processNode', data: { refId: id } }], edges: [] }
    }, {}, 'org-1');

    expect(result.actions[id].producerOutputId).toBe(`${id}:result`);
    expect(result.producerOutputs[`${id}:result`]).toMatchObject({
      nodeId: id,
      outputSocketId: 'result',
      typeId: 'cassette'
    });
  });

  it('requires the authoritative producer output identity', () => {
    expect(() => resolveCompiledProducerOutputWorkflow({ compiled, typeId: 'cassette' }))
      .toThrow('producerOutputId is required');
  });

  it('resolves by producer output and rejects type mismatches', () => {
    expect(resolveCompiledProducerOutputWorkflow({
      compiled,
      producerOutputId: 'create:entity',
      typeId: 'cassette'
    })).toEqual({ primaryRegion: 'main' });

    expect(() => resolveCompiledProducerOutputWorkflow({
      compiled,
      producerOutputId: 'create:entity',
      typeId: 'queue'
    })).toThrow('emits cassette, not queue');
  });

  it('resolves the exact same-type producer among candidates and never falls back to the first', () => {
    expect(resolveCompiledProducerOutputWorkflow({
      compiled,
      producerOutputId: 'import:entity',
      typeId: 'cassette'
    })).toEqual({ primaryRegion: 'imported' });

    expect(() => resolveCompiledProducerOutputWorkflow({
      compiled,
      typeId: 'cassette'
    })).toThrow('producerOutputId is required');
  });
});
