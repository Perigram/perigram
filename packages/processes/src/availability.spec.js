import { describe, expect, it } from 'vitest';
import { validateRequiredInputAvailability } from './index.js';

const domain = {
  entities: [
    { type: 'cassette' },
    { type: 'cassette_design' },
    { type: 'site_photo' },
    { type: 'project' },
    { type: 'nest' },
    { type: 'plate' }
  ],
  construction: {
    plate: {
      modes: ['fabricate'],
      defaultMode: 'fabricate',
      modeInputs: {
        fabricate: [
          { id: 'label', path: 'label', type: 'string', required: true },
          { id: 'finish', path: 'finish', type: 'enum', options: ['matte', 'gloss'], required: true }
        ]
      }
    },
    cassette_design: {
      modes: ['bakeCassetteDesignFromTemplate'],
      defaultMode: 'bakeCassetteDesignFromTemplate',
      derived: true,
      modeInputs: {
        bakeCassetteDesignFromTemplate: [
          { id: 'templateId', path: 'templateId', type: 'entity', typeId: 'cassette', required: true, prompt: true },
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
          { id: 'items', path: 'items', type: 'typeList', accepts: ['cassette_design'], required: true },
          { id: 'mode', path: 'mode', type: 'enum', options: ['A', 'B'], required: true, default: 'A' }
        ]
      }
    },
    site_photo: {
      modes: ['upload'],
      defaultMode: 'upload',
      derived: true,
      modeInputs: {
        upload: [
          { id: 'photo', type: 'payloadUpload', required: true, prompt: true, creator: { typeId: 'site_photo', attachmentKinds: 'userCreatable' } }
        ]
      }
    }
  },
  commands: {
    solve: {
      input: {
        parameters: [
          { name: 'machineId', type: 'instanceId', typeId: 'machine', required: true },
          { name: 'secret', type: 'string', required: true, display: 'hidden' }
        ]
      }
    },
    generate: {
      input: {
        abstractEntities: [{ name: 'source', label: 'Source', capability: 'attachments.generate', accepts: ['sheet_design'], required: true }],
        parameters: [{ name: 'kind', type: 'enum', options: ['dxf'], required: true }]
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
    kind: 'cts.construct',
    typeId: 'cassette_design',
    construction: {
      mode: 'bakeCassetteDesignFromTemplate',
      inputs: [
        { id: 'templateId', path: 'templateId', type: 'entity', typeId: 'cassette', required: true, prompt: true }
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
      label: 'plate',
      kind: 'cts.construct',
      typeId: 'plate',
      construction: { mode: 'fabricate', inputs: [] },
      inputDefaults: { finish: 'matte' },
      trigger: { mode: 'event' }
    };
    expect(check({ ...node, inputDefaults: { ...node.inputDefaults, label: null } })).toHaveLength(1);
    expect(check({ ...node, inputDefaults: { ...node.inputDefaults, label: '' } })).toEqual([]);
  });

  it('accepts a required entity input on a manual path via its prompt', () => {
    const errors = check(typedCreate({ trigger: { mode: 'manual' } }));
    expect(errors).toEqual([]);
  });

  it('rejects a required entity-list input with an empty fallback and accepts a non-empty one', () => {
    const node = {
      id: 'n',
      label: 'nest',
      kind: 'cts.construct',
      typeId: 'nest',
      construction: {
        mode: 'buildNest',
        inputs: [{ id: 'items', path: 'items', type: 'typeList', accepts: ['cassette_design'], required: true }]
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
      kind: 'cts.construct',
      typeId: 'nest',
      construction: { mode: 'buildNest', inputs: [] },
      inputDefaults: { items: [{ id: 'd1' }] },
      trigger: { mode: 'event' }
    };
    expect(check(node)).toEqual([]);
  });

  it('rejects an authored enum fallback outside the declared members', () => {
    const node = {
      id: 'n',
      label: 'plate',
      kind: 'cts.construct',
      typeId: 'plate',
      construction: { mode: 'fabricate', inputs: [] },
      inputDefaults: { label: 'P' },
      trigger: { mode: 'event' }
    };
    expect(check({ ...node, inputDefaults: { ...node.inputDefaults, finish: 'chrome' } })).toHaveLength(1);
    expect(check({ ...node, inputDefaults: { ...node.inputDefaults, finish: 'matte' } })).toEqual([]);
  });

  it('requires the identity name row on an automatic generic create and accepts it on a manual create', () => {
    const node = {
      id: 'n',
      label: 'project',
      kind: 'cts.construct',
      typeId: 'project',
      construction: { mode: 'genericCreate', inputs: [] }
    };
    expect(check({ ...node, trigger: { mode: 'event' } })).toHaveLength(1);
    expect(check({ ...node, trigger: { mode: 'manual' } })).toEqual([]);
  });

  it('satisfies the required identity name row with a connected edge', () => {
    const node = {
      id: 'n',
      label: 'project',
      kind: 'cts.construct',
      typeId: 'project',
      construction: { mode: 'genericCreate', inputs: [] },
      trigger: { mode: 'event' }
    };
    expect(check(node, [
      { id: 'e1', source: 'composer', target: 'gn', sourceHandle: 'data:block', targetHandle: 'data:name' }
    ])).toEqual([]);
  });

  // The composer-less construct (SPEC §20) authors identity through the
  // Name row socket; no separate identity-block requirement resurfaces as a
  // second, unsatisfiable input — the v5 surface renders no block sockets.
  it('yields the identity requirement to the composer-less name row', () => {
    const composerLess = {
      id: 'n',
      label: 'panel',
      kind: 'cts.construct',
      typeId: 'project',
      construction: {
        mode: 'genericCreate',
        inputs: [{ id: 'name', path: 'name', type: 'string', required: true, prompt: true }]
      },
      trigger: { mode: 'event' }
    };
    const unmet = check(composerLess);
    expect(unmet).toHaveLength(1);
    expect(unmet[0]).toContain('Required input name');
    expect(check(composerLess, [
      { id: 'e1', source: 'src', target: 'gn', sourceHandle: 'data:value', targetHandle: 'data:name' }
    ])).toEqual([]);
    expect(check({ ...composerLess, inputDefaults: { name: 'Panel 1' } })).toEqual([]);
  });

  it('names nodes by humanized operation and canvas id instead of the raw kind label echo', () => {
    const echoed = checkDiagnostics(typedCreate({ trigger: { mode: 'event' }, label: 'cts.construct' }));
    expect(echoed[0].message).toContain('Construct node gn');
    expect(echoed[0].message).not.toContain('cts.construct');
    const authored = checkDiagnostics(typedCreate({ trigger: { mode: 'event' } }));
    expect(authored[0].message).toContain('design (Construct node gn)');
  });

  it('rejects an attachment upload construction input whose fallback is empty or scalar', () => {
    const node = {
      id: 'n',
      label: 'site photo',
      kind: 'cts.construct',
      typeId: 'site_photo',
      construction: {
        mode: 'upload',
        inputs: [{ id: 'photo', type: 'payloadUpload', required: true, prompt: true, creator: { typeId: 'site_photo', attachmentKinds: 'userCreatable' } }]
      },
      trigger: { mode: 'event' }
    };
    expect(check({ ...node, inputDefaults: { photo: '' } })).toHaveLength(1);
    expect(check({ ...node, inputDefaults: { photo: { fileId: 'f1' } } })).toEqual([]);
  });

  it('resolves required entity and status ports from runtime context on a manual status change', () => {
    const node = {
      id: 'n',
      label: 'move',
      kind: 'cts.transition',
      typeId: 'project'
    };
    expect(check({ ...node, trigger: { mode: 'manual' } })).toEqual([]);
    expect(check({ ...node, trigger: { mode: 'event' } }).length).toBeGreaterThan(0);
  });

  it('prompts a visible command parameter but rejects a required hidden one with no source', () => {
    const node = {
      id: 'n',
      label: 'solve',
      kind: 'cts.command',
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
      kind: 'cts.command',
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
