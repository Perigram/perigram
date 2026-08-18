import { describe, expect, it } from 'vitest';
import { validateRequiredInputAvailability } from './index.js';

const domain = {
  entities: [
    { type: 'cassette' },
    { type: 'cassette_design' },
    { type: 'artifact' },
    { type: 'project' },
    { type: 'nest' }
  ],
  construction: {
    cassette_design: {
      modes: ['bakeCassetteDesignFromTemplate'],
      defaultMode: 'bakeCassetteDesignFromTemplate',
      derived: true,
      modeInputs: {
        bakeCassetteDesignFromTemplate: [
          { id: 'templateId', path: 'templateId', type: 'entity', entityType: 'cassette', required: true, prompt: true },
          { id: 'parameters', path: 'parameters', type: 'object', required: false, prompt: true }
        ]
      }
    },
    project: {
      modes: ['genericCreate'],
      defaultMode: 'genericCreate',
      inputs: [{ id: 'name', path: 'name', type: 'string', required: true, prompt: true }]
    },
    nest: {
      modes: ['buildNest'],
      defaultMode: 'buildNest',
      derived: true,
      modeInputs: {
        buildNest: [
          { id: 'items', path: 'items', type: 'entityList', accepts: ['cassette_design'], required: true },
          { id: 'mode', path: 'mode', type: 'enum', options: ['A', 'B'], required: true, default: 'A' }
        ]
      }
    },
    artifact: {
      modes: ['uploadArtifact'],
      defaultMode: 'uploadArtifact',
      derived: true,
      modeInputs: {
        uploadArtifact: [
          { id: 'artifact', type: 'artifactUpload', required: true, prompt: true, creator: { entityType: 'artifact', attachmentKinds: 'userCreatable' } }
        ]
      }
    }
  },
  commands: {
    solve: {
      input: {
        parameters: [
          { name: 'machineId', type: 'entityId', entityType: 'machine', required: true },
          { name: 'secret', type: 'string', required: true, display: 'hidden' }
        ]
      }
    }
  },
  blockComposition: {},
  attachmentKinds: { userCreatable: { creation: { mode: 'upload' } } },
  fieldSchemas: []
};

function processWith(node, edges = []) {
  return {
    dataflowVersion: 4,
    graph: {
      nodes: [{ id: 'gn', type: 'processNode', data: { refId: 'n' } }],
      edges
    },
    processNodes: { n: node }
  };
}

function check(node, edges = []) {
  return validateRequiredInputAvailability(processWith(node, edges), domain);
}

function typedCreate(overrides = {}) {
  return {
    id: 'n',
    label: 'design',
    kind: 'effect.createEntity',
    entityType: 'cassette_design',
    construction: {
      mode: 'bakeCassetteDesignFromTemplate',
      inputs: [
        { id: 'templateId', path: 'templateId', type: 'entity', entityType: 'cassette', required: true, prompt: true }
      ]
    },
    ...overrides
  };
}

describe('required input availability', () => {
  it('accepts a required entity input with a connected upstream edge on an automatic path', () => {
    const errors = check(typedCreate({ trigger: { mode: 'event' } }), [
      { id: 'e1', source: 'src', target: 'gn', sourceHandle: 'output:x', targetHandle: 'input:templateId' }
    ]);
    expect(errors).toEqual([]);
  });

  it('rejects a required entity input with no source on an automatic path', () => {
    const errors = check(typedCreate({ trigger: { mode: 'event' } }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('templateId');
    expect(errors[0]).toContain('automatically evaluated');
  });

  it('satisfies a required entity input with a non-empty authored fallback', () => {
    const errors = check(typedCreate({ trigger: { mode: 'event' }, inputDefaults: { templateId: { id: 'c1', type: 'cassette' } } }));
    expect(errors).toEqual([]);
  });

  it('rejects a scalar fallback for a required entity input after type inference', () => {
    const errors = check(typedCreate({ trigger: { mode: 'event' }, inputDefaults: { templateId: 'cassette-1' } }));
    expect(errors).toHaveLength(1);
  });

  it('rejects a null fallback for a required input', () => {
    const errors = check(typedCreate({ trigger: { mode: 'event' }, inputDefaults: { templateId: null } }));
    expect(errors).toHaveLength(1);
  });

  it('accepts a required entity input on a manual path via its prompt', () => {
    const errors = check(typedCreate({ trigger: { mode: 'manual' } }));
    expect(errors).toEqual([]);
  });

  it('rejects a required entity-list input with an empty fallback and accepts a non-empty one', () => {
    const node = {
      id: 'n',
      label: 'nest',
      kind: 'effect.createEntity',
      entityType: 'nest',
      construction: {
        mode: 'buildNest',
        inputs: [{ id: 'items', path: 'items', type: 'entityList', accepts: ['cassette_design'], required: true }]
      },
      trigger: { mode: 'event' }
    };
    expect(check({ ...node, inputDefaults: { items: [] } })).toHaveLength(1);
    expect(check({ ...node, inputDefaults: { items: [{ id: 'd1' }] } })).toEqual([]);
  });

  it('treats a domain default as an availability source (input not required at activation)', () => {
    const node = {
      id: 'n',
      label: 'nest',
      kind: 'effect.createEntity',
      entityType: 'nest',
      construction: {
        mode: 'buildNest',
        inputs: [{ id: 'mode', path: 'mode', type: 'enum', options: ['A', 'B'], required: true, default: 'A' }]
      },
      trigger: { mode: 'event' }
    };
    expect(check(node)).toEqual([]);
  });

  it('requires the identity block on an automatic generic create and accepts it on a manual create', () => {
    const node = {
      id: 'n',
      label: 'project',
      kind: 'effect.createEntity',
      entityType: 'project',
      construction: { mode: 'genericCreate', inputs: [] },
      blocks: ['identity']
    };
    expect(check({ ...node, trigger: { mode: 'event' } })).toHaveLength(1);
    expect(check({ ...node, trigger: { mode: 'manual' } })).toEqual([]);
  });

  it('resolves required entity and status ports from runtime context on a manual status change', () => {
    const node = {
      id: 'n',
      label: 'move',
      kind: 'effect.changeStatus',
      entityType: 'project'
    };
    expect(check({ ...node, trigger: { mode: 'manual' } })).toEqual([]);
    expect(check({ ...node, trigger: { mode: 'event' } }).length).toBeGreaterThan(0);
  });

  it('prompts a visible command parameter but rejects a required hidden one with no source', () => {
    const node = {
      id: 'n',
      label: 'solve',
      kind: 'effect.runCommand',
      commandId: 'solve',
      trigger: { mode: 'manual' }
    };
    expect(check(node)).toHaveLength(1);
    expect(check(node)[0]).toContain('secret');
  });
});
