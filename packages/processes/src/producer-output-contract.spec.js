import { describe, expect, it } from 'vitest';
import { compileActions, compileProcessDefinition, normalizeProcessDefinition } from './index.js';

const domain = {
  entities: [{ type: 'project', label: 'Project', fields: [] }],
  relations: [],
  workflows: {}
};

function definition() {
  return {
    graph: {
      nodes: [{ id: 'create', type: 'entity', data: { refId: 'create:entity' } }],
      edges: []
    },
    producerOutputs: {
      'create:entity': {
        producerOutputId: 'create:entity',
        nodeId: 'create',
        outputSocketId: 'entity',
        entityType: 'project',
        fields: { read: [], write: [], private: [] }
      }
    }
  };
}

describe('producer output process contract', () => {
  it('normalizes only producer-scoped workflow records', () => {
    const normalized = normalizeProcessDefinition(definition(), domain);

    expect(normalized.producerOutputs).toHaveProperty('create:entity');
    expect(normalized).not.toHaveProperty('entityProfiles');
  });

  it('compiles authoritative producer records and a non-authoritative type index', () => {
    const compiled = compileProcessDefinition(definition(), domain);

    expect(compiled).not.toHaveProperty('workflows');
    expect(compiled).not.toHaveProperty('fieldPolicies');
    expect(compiled.producerOutputs['create:entity']).toMatchObject({
      producerOutputId: 'create:entity',
      nodeId: 'create',
      outputSocketId: 'entity',
      entityType: 'project'
    });
    expect(compiled.producerOutputs['create:entity'].workflow).toBeTruthy();
    expect(compiled.producerOutputs['create:entity'].fieldPolicy).toBeTruthy();
    expect(compiled.entityTypeIndex).toEqual({ project: ['create:entity'] });
  });

  it('rejects keys that are not the stable node and output socket identity', () => {
    const invalid = definition();
    invalid.producerOutputs['create:entity'].producerOutputId = 'project';

    expect(() => compileProcessDefinition(invalid, domain)).toThrow('must match producerOutputId');
  });

  it('requires entity actions to carry their producer output context', () => {
    const process = normalizeProcessDefinition(definition(), domain);
    const action = { id: 'rename', actionKind: 'updateEntity', entityType: 'project' };

    expect(() => compileActions({ rename: action }, process, domain)).toThrow('requires producerOutputId');
    expect(compileActions({
      rename: { ...action, producerOutputId: 'create:entity' }
    }, process, domain).rename).toMatchObject({
      entityType: 'project',
      producerOutputId: 'create:entity'
    });
  });
});
