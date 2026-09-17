import { describe, expect, it } from 'vitest';
import { compileActiveProcessRuntime, resolveCompiledProducerOutputWorkflow } from './runtime.js';

const compiled = {
  producerOutputs: {
    'create:entity': { entityType: 'project', workflow: { primaryRegion: 'main' } },
    'import:entity': { entityType: 'project', workflow: { primaryRegion: 'imported' } }
  },
};

describe('process workflow resolution', () => {
  it('repairs a persisted operational producer before compiling active runtime', async () => {
    const id = 'processNode_1785860422855';
    const result = await compileActiveProcessRuntime({
      dataflowVersion: 4,
      processNodes: {
        [id]: {
          id,
          kind: 'effect.createEntity',
          entityType: 'project',
          construction: { mode: 'genericCreate', inputs: [] },
          trigger: { mode: 'manual' },
          status: { to: 'CREATED' }
        }
      },
      graph: { nodes: [{ id, type: 'processNode', data: { refId: id } }], edges: [] }
    });

    expect(result.actions[id].producerOutputId).toBe(`${id}:result`);
    expect(result.producerOutputs[`${id}:result`]).toMatchObject({
      nodeId: id,
      outputSocketId: 'result',
      entityType: 'project'
    });
  });

  it('requires the authoritative producer output identity', () => {
    expect(() => resolveCompiledProducerOutputWorkflow({ compiled, entityType: 'project' }))
      .toThrow('producerOutputId is required');
  });

  it('resolves by producer output and rejects type mismatches', () => {
    expect(resolveCompiledProducerOutputWorkflow({
      compiled,
      producerOutputId: 'create:entity',
      entityType: 'project'
    })).toEqual({ primaryRegion: 'main' });

    expect(() => resolveCompiledProducerOutputWorkflow({
      compiled,
      producerOutputId: 'create:entity',
      entityType: 'queue'
    })).toThrow('emits project, not queue');
  });

  it('resolves the exact same-type producer among candidates and never falls back to the first', () => {
    expect(resolveCompiledProducerOutputWorkflow({
      compiled,
      producerOutputId: 'import:entity',
      entityType: 'project'
    })).toEqual({ primaryRegion: 'imported' });

    expect(() => resolveCompiledProducerOutputWorkflow({
      compiled,
      entityType: 'project'
    })).toThrow('producerOutputId is required');
  });
});
