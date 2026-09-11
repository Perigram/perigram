import { describe, expect, it } from 'vitest';
import { compileActions, compileProcessDefinition, normalizeProcessDefinition, validateProcessDefinition } from './index.js';

const domain = {
  entities: [{ type: 'project', label: 'Project', fields: [] }],
  relations: [],
  workflows: {},
  construction: {
    project: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] }
  }
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

  it('preserves an authored effect node producer identity on its derived action', () => {
    const source = definition();
    source.processNodes = {
      create: {
        id: 'create',
        kind: 'effect.createEntity',
        entityType: 'project',
        producerOutputId: 'create:entity',
        construction: { mode: 'genericCreate', inputs: [] },
        status: { to: 'CREATED' },
        inputs: [],
        outputs: []
      }
    };
    source.graph.nodes = [{ id: 'create', type: 'processNode', data: { refId: 'create' } }];

    expect(compileProcessDefinition(source, domain).actions.create)
      .toMatchObject({ id: 'create', producerOutputId: 'create:entity', entityType: 'project' });
  });
});

describe('producer output entry-state and binding diagnostics', () => {
  it('rejects a lifecycle entry state that is not declared', () => {
    const invalid = definition();
    invalid.producerOutputs['create:entity'].lifecycle = {
      mode: 'custom',
      workflow: {
        schemaVersion: 2,
        primaryRegion: 'main',
        regions: { main: { initial: 'READY', states: { DRAFT: {}, DONE: {} }, transitions: [] } }
      }
    };

    const validation = validateProcessDefinition(invalid, domain);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain("Producer output create:entity region main entry state READY is not declared");
  });

  it('keeps the declared entry state instead of selecting the first state', () => {
    const source = definition();
    source.producerOutputs['create:entity'].lifecycle = {
      mode: 'custom',
      workflow: {
        schemaVersion: 2,
        primaryRegion: 'main',
        regions: { main: { initial: 'DONE', states: { DRAFT: {}, DONE: {} }, transitions: [] } }
      }
    };

    const compiled = compileProcessDefinition(source, domain);
    const workflow = compiled.producerOutputs['create:entity'].workflow;
    expect(workflow.regions.main.initial).toBe('DONE');
    expect(workflow.initial).toBe('DONE');
  });

  it('rejects an entity action without a producer binding at validation time', () => {
    const invalid = definition();
    invalid.actions = { rename: { id: 'rename', actionKind: 'updateEntity', entityType: 'project' } };

    const validation = validateProcessDefinition(invalid, domain);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('Action rename on project requires producerOutputId');
    expect(() => compileProcessDefinition(invalid, domain)).toThrow('requires producerOutputId');
  });

  it('rejects an action bound to an unknown or mistyped producer output', () => {
    const unknown = definition();
    unknown.actions = { rename: { id: 'rename', actionKind: 'updateEntity', entityType: 'project', producerOutputId: 'ghost:entity' } };
    expect(validateProcessDefinition(unknown, domain).errors.join('\n'))
      .toContain('Action rename uses unknown producerOutputId ghost:entity');

    const mistyped = definition();
    mistyped.producerOutputs['other:entity'] = {
      ...mistyped.producerOutputs['create:entity'],
      producerOutputId: 'other:entity',
      nodeId: 'other',
      entityType: 'queue'
    };
    mistyped.actions = { rename: { id: 'rename', actionKind: 'updateEntity', entityType: 'project', producerOutputId: 'other:entity' } };
    expect(validateProcessDefinition(mistyped, domain).errors.join('\n'))
      .toContain('Action rename producerOutputId emits queue, not project');
  });
});
