import { describe, expect, it } from 'vitest';
import { resolveCompiledProducerOutputWorkflow } from './runtime.js';

const compiled = {
  producerOutputs: {
    'create:entity': { entityType: 'project', workflow: { primaryRegion: 'main' } }
  },
  entityTypeIndex: { project: ['create:entity'] }
};

describe('process workflow resolution', () => {
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
});
