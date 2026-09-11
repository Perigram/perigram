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
    },
    generate: {
      input: {
        abstractEntities: [{ name: 'source', label: 'Source', capability: 'attachments.generate', accepts: ['sheet_design'], required: true }],
        parameters: [{ name: 'kind', type: 'enum', options: ['LAYOUT_DXF'], required: true }]
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
  return validateRequiredInputAvailability(processWith(node, edges), domain).map(diagnostic => diagnostic.message);
}

function checkDiagnostics(node, edges = []) {
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
    const errors = check(typedCreate({
      trigger: { mode: 'event' },
      inputDefaults: { templateId: { id: 'c1', type: 'cassette' } }
    }));
    expect(errors).toEqual([]);
  });

  it('rejects a scalar fallback for a required entity input after type inference', () => {
    const errors = check(typedCreate({ trigger: { mode: 'event' }, inputDefaults: { templateId: 'cassette-1' } }));
    expect(errors).toHaveLength(1);
  });

  it('rejects a null fallback for a required input and accepts an empty primitive', () => {
    const node = {
      id: 'n',
      label: 'design',
      kind: 'effect.createEntity',
      entityType: 'cassette_design',
      construction: {
        mode: 'bakeCassetteDesignFromTemplate',
        inputs: [{ id: 'label', path: 'label', type: 'string', required: true }]
      },
      trigger: { mode: 'event' }
    };
    expect(check({ ...node, inputDefaults: { label: null } })).toHaveLength(1);
    expect(check({ ...node, inputDefaults: { label: '' } })).toEqual([]);
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

  it('treats a domain default as satisfied (the input is not required at activation)', () => {
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

  it('rejects an authored enum fallback outside the declared members', () => {
    const node = {
      id: 'n',
      label: 'nest',
      kind: 'effect.createEntity',
      entityType: 'nest',
      construction: {
        mode: 'buildNest',
        inputs: [{ id: 'mode', path: 'mode', type: 'enum', options: ['A', 'B'], required: true }]
      },
      trigger: { mode: 'event' }
    };
    expect(check({ ...node, inputDefaults: { mode: 'C' } })).toHaveLength(1);
    expect(check({ ...node, inputDefaults: { mode: 'A' } })).toEqual([]);
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

  it('satisfies the required identity block with a connected block edge', () => {
    const node = {
      id: 'n',
      label: 'project',
      kind: 'effect.createEntity',
      entityType: 'project',
      construction: { mode: 'genericCreate', inputs: [] },
      blocks: ['identity'],
      trigger: { mode: 'event' }
    };
    expect(check(node, [
      { id: 'e1', source: 'composer', target: 'gn', sourceHandle: 'data:block', targetHandle: 'data:identity' }
    ])).toEqual([]);
  });

  it('rejects an attachment upload construction input whose fallback is empty or scalar', () => {
    const node = {
      id: 'n',
      label: 'artifact',
      kind: 'effect.createEntity',
      entityType: 'artifact',
      construction: {
        mode: 'uploadArtifact',
        inputs: [{ id: 'artifact', type: 'artifactUpload', required: true, prompt: true, creator: { entityType: 'artifact', attachmentKinds: 'userCreatable' } }]
      },
      trigger: { mode: 'event' }
    };
    expect(check({ ...node, inputDefaults: { artifact: '' } })).toHaveLength(1);
    expect(check({ ...node, inputDefaults: { artifact: { fileId: 'f1' } } })).toEqual([]);
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
    const errors = check(node);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('secret');
  });

  it('prompts a required abstract command entity on a manual path and rejects it on an automatic path', () => {
    const node = {
      id: 'n',
      label: 'generate',
      kind: 'effect.runCommand',
      commandId: 'generate',
      trigger: { mode: 'manual' }
    };
    expect(check(node)).toEqual([]);
    const automatic = check({ ...node, trigger: { mode: 'event' } });
    expect(automatic.length).toBeGreaterThan(0);
    expect(automatic.some(error => error.includes('source'))).toBe(true);
  });

  it('anchors availability diagnostics on the graph node and socket', () => {
    const diagnostics = checkDiagnostics({ ...typedCreate({ trigger: { mode: 'event' } }) });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ nodeId: 'gn', socketId: 'templateId' });
    expect(diagnostics[0].message).toContain('templateId');
  });
});
