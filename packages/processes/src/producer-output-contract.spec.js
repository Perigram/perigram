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
        typeId: 'project',
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

  it('compiles authoritative producer-keyed records', () => {
    const compiled = compileProcessDefinition(definition(), domain);

    expect(compiled).not.toHaveProperty('workflows');
    expect(compiled).not.toHaveProperty('fieldPolicies');
    expect(compiled.producerOutputs['create:entity']).toMatchObject({
      producerOutputId: 'create:entity',
      nodeId: 'create',
      outputSocketId: 'entity',
      typeId: 'project'
    });
    expect(compiled.producerOutputs['create:entity'].workflow).toBeTruthy();
    expect(compiled.producerOutputs['create:entity'].fieldPolicy).toBeTruthy();
  });

  it('rejects keys that are not the stable node and output socket identity', () => {
    const invalid = definition();
    invalid.producerOutputs['create:entity'].producerOutputId = 'project';

    expect(() => compileProcessDefinition(invalid, domain)).toThrow('must match producerOutputId');
  });

  it('requires entity actions to carry their producer output context', () => {
    const process = normalizeProcessDefinition(definition(), domain);
    const action = { id: 'rename', actionKind: 'updateEntity', typeId: 'project' };

    expect(() => compileActions({ rename: action }, process, domain)).toThrow('requires producerOutputId');
    expect(compileActions({
      rename: { ...action, producerOutputId: 'create:entity' }
    }, process, domain).rename).toMatchObject({
      typeId: 'project',
      producerOutputId: 'create:entity'
    });
  });

  it('preserves an authored effect node producer identity on its derived action', () => {
    const source = definition();
    source.processNodes = {
      create: {
        id: 'create',
        kind: 'effect.createEntity',
        typeId: 'project',
        producerOutputId: 'create:entity',
        construction: { mode: 'genericCreate', inputs: [] },
        status: { to: 'CREATED' },
        inputs: [],
        outputs: []
      }
    };
    source.graph.nodes = [{ id: 'create', type: 'processNode', data: { refId: 'create' } }];

    expect(compileProcessDefinition(source, domain).actions.create)
      .toMatchObject({ id: 'create', producerOutputId: 'create:entity', typeId: 'project' });
  });
});

describe('producer output entry-state and binding diagnostics', () => {
  it('compiles two same-type producers into independent workflows and field policies', () => {
    const source = definition();
    const base = source.producerOutputs['create:entity'];
    source.producerOutputs = {
      'create_a:entity': {
        ...structuredClone(base),
        producerOutputId: 'create_a:entity',
        nodeId: 'create_a'
      },
      'import_b:entity': {
        ...structuredClone(base),
        producerOutputId: 'import_b:entity',
        nodeId: 'import_b',
        lifecycle: {
          mode: 'custom',
          workflow: {
            schemaVersion: 2,
            primaryRegion: 'main',
            regions: { main: { initial: 'IMPORTED', states: { IMPORTED: { canUpdateMeta: true } }, transitions: [] } }
          }
        }
      }
    };
    source.graph.nodes = [
      { id: 'create_a', type: 'entity', data: { refId: 'create_a:entity' } },
      { id: 'import_b', type: 'entity', data: { refId: 'import_b:entity' } }
    ];

    const compiled = compileProcessDefinition(source, domain);
    const createA = compiled.producerOutputs['create_a:entity'];
    const importB = compiled.producerOutputs['import_b:entity'];
    expect(createA.workflow.initial).toBe('CREATED');
    expect(importB.workflow.initial).toBe('IMPORTED');
    expect(createA.workflow).not.toBe(importB.workflow);
    expect(createA.fieldPolicy).not.toBe(importB.fieldPolicy);
    expect(importB.fieldPolicy).toMatchObject({ read: [], write: [], private: [] });
  });

  it('binds consumer effects to the upstream producer instead of minting own outputs', () => {
    const source = definition();
    source.processNodes = {
      create: { id: 'create', kind: 'effect.createEntity', typeId: 'project', producerOutputId: 'create:entity', construction: { mode: 'genericCreate', inputs: [] }, status: { to: 'CREATED' } },
      rename: { id: 'rename', kind: 'effect.updateEntity', typeId: 'project', trigger: { mode: 'manual' }, status: { to: 'ACTIVE' } },
      stale: { id: 'stale', kind: 'effect.changeStatus', typeId: 'project', trigger: { mode: 'manual' }, status: { to: 'ACTIVE' }, producerOutputId: 'stale:result' }
    };
    source.producerOutputs['stale:result'] = {
      producerOutputId: 'stale:result',
      nodeId: 'stale',
      outputSocketId: 'result',
      typeId: 'project',
      fields: { read: [], write: [], private: [] }
    };
    source.graph = {
      nodes: ['create', 'rename', 'stale'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
      edges: [
        { id: 'create-rename', source: 'create', sourceHandle: 'data:result', target: 'rename', targetHandle: 'data:entity', role: 'data' },
        { id: 'rename-stale', source: 'rename', sourceHandle: 'data:result', target: 'stale', targetHandle: 'data:entity', role: 'data' }
      ]
    };

    const compiled = compileProcessDefinition(source, domain);

    expect(compiled.producerOutputs).not.toHaveProperty('stale:result');
    expect(compiled.processNodes.stale.producerOutputId).toBeUndefined();
    expect(compiled.actions.rename).toMatchObject({ producerOutputId: 'create:entity' });
    // changeStatus nodes derive no action; they execute through orchestration
    // with the upstream producer context.
    expect(compiled.actions.stale).toBeUndefined();
    expect(Object.keys(compiled.producerOutputs)).toEqual(['create:entity']);
  });

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
    invalid.actions = { rename: { id: 'rename', actionKind: 'updateEntity', typeId: 'project' } };

    const validation = validateProcessDefinition(invalid, domain);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('Action rename on project requires producerOutputId');
    expect(() => compileProcessDefinition(invalid, domain)).toThrow('requires producerOutputId');
  });

  it('rejects an action bound to an unknown or mistyped producer output', () => {
    const unknown = definition();
    unknown.actions = { rename: { id: 'rename', actionKind: 'updateEntity', typeId: 'project', producerOutputId: 'ghost:entity' } };
    expect(validateProcessDefinition(unknown, domain).errors.join('\n'))
      .toContain('Action rename uses unknown producerOutputId ghost:entity');

    const mistyped = definition();
    mistyped.producerOutputs['other:entity'] = {
      ...mistyped.producerOutputs['create:entity'],
      producerOutputId: 'other:entity',
      nodeId: 'other',
      typeId: 'queue'
    };
    mistyped.actions = { rename: { id: 'rename', actionKind: 'updateEntity', typeId: 'project', producerOutputId: 'other:entity' } };
    expect(validateProcessDefinition(mistyped, domain).errors.join('\n'))
      .toContain('Action rename producerOutputId emits queue, not project');
  });
});
