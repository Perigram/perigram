import { describe, expect, it } from 'vitest';
import {
  CONVERSION_FIDELITIES,
  PORT_COMPATIBILITY_OUTCOMES,
  assertValidNodeDefinition,
  compareNodePorts,
  createPortCompatibilityRegistry,
  createNodeProviderRegistry,
  normalizeNodeProvider,
  normalizeNodeDefinition,
  validateNodeDefinition
} from './node-contract.js';

const definition = overrides => ({
  provider: 'plugin.documents',
  id: 'document.compose',
  version: '2',
  label: 'Compose document',
  palette: { group: 'documents', label: 'Documents', keywords: ['files'] },
  inputs: [{ id: 'source', label: 'Source', shape: 'item', semantic: { base: 'record', schema: 'document-source' } }],
  outputs: [{ id: 'document', shape: 'item', semantic: { base: 'document', provider: 'plugin.documents' } }],
  execution: { kind: 'pure', capabilities: [], deterministic: true, idempotent: true },
  ...overrides
});

describe('node port compatibility', () => {
  it('distinguishes document representation kinds carried over JSON transport', () => {
    const block = { shape: 'item', semantic: { base: 'json', kind: 'text.document-block' } };
    const document = { shape: 'item', semantic: { base: 'json', kind: 'text.flow-document' } };
    expect(compareNodePorts(block, block).status).toBe('exact');
    expect(compareNodePorts(block, document)).toMatchObject({
      status: 'incompatible',
      compatible: false
    });
  });

  it('allows safe widening to generic JSON and marks untyped sources conditional', () => {
    const typed = { semantic: { base: 'json', kind: 'text.flow-document' } };
    const generic = { semantic: { base: 'json' } };
    expect(compareNodePorts(typed, generic)).toMatchObject({ status: 'safe-coercion', compatible: true });
    expect(compareNodePorts(generic, typed)).toMatchObject({ status: 'conditional', compatible: true });
  });

  it('checks transport shapes and reports conversions explicitly', () => {
    const item = { shape: 'item', semantic: { base: 'record' } };
    const list = { shape: 'list', semantic: { base: 'record' } };
    expect(compareNodePorts(item, list).compatible).toBe(true);
    expect(compareNodePorts(list, item)).toMatchObject({
      status: 'conversion-required',
      compatible: false
    });
  });

  it('compares nominal and structural semantic identities by value', () => {
    const source = {
      semantic: {
        base: 'record',
        nominal: { provider: 'plugin.documents', id: 'table-row' },
        schema: { fields: { sku: { base: 'string' } } }
      }
    };
    const equivalent = {
      semantic: {
        base: 'record',
        schema: { fields: { sku: { base: 'string' } } },
        nominal: { id: 'table-row', provider: 'plugin.documents' }
      }
    };
    expect(compareNodePorts(source, equivalent).status).toBe('exact');
    expect(compareNodePorts(source, {
      semantic: { ...equivalent.semantic, constraints: { minimumItems: 1 } }
    })).toMatchObject({ status: 'conditional', compatible: true });
  });

  it('compares open-world semantic qualifiers beyond the identity key subset', () => {
    const customer = { shape: 'item', semantic: { base: 'entityRef', typeId: 'customer' } };
    const invoice = { shape: 'item', semantic: { base: 'entityRef', typeId: 'invoice' } };
    expect(compareNodePorts(customer, { ...customer })).toMatchObject({ status: 'exact', compatible: true });
    expect(compareNodePorts(customer, invoice)).toMatchObject({ status: 'incompatible', compatible: false });
    expect(compareNodePorts(customer, invoice).reason).toContain('typeId');
  });

  it('compares known and unknown qualifiers by deep value equality', () => {
    expect(compareNodePorts(
      { semantic: { base: 'string', enumId: 'color' } },
      { semantic: { base: 'string', enumId: 'size' } }
    )).toMatchObject({ status: 'incompatible', compatible: false });
    expect(compareNodePorts(
      { semantic: { base: 'record', schema: { fields: { sku: { base: 'string' } } } } },
      { semantic: { base: 'record', schema: { fields: { qty: { base: 'number' } } } } }
    )).toMatchObject({ status: 'incompatible', compatible: false });
    expect(compareNodePorts(
      { semantic: { base: 'string', locale: 'en' } },
      { semantic: { base: 'string', locale: 'de' } }
    )).toMatchObject({ status: 'incompatible', compatible: false });
    expect(compareNodePorts(
      { semantic: { base: 'string', locale: 'en' } },
      { semantic: { base: 'string', locale: 'en' } }
    ).status).toBe('exact');
    expect(compareNodePorts(
      { semantic: { base: 'string', accepts: { csv: true, tsv: true } } },
      { semantic: { base: 'string', accepts: { tsv: true, csv: true } } }
    ).status).toBe('exact');
    expect(compareNodePorts(
      { semantic: { base: 'string', accepts: ['csv'] } },
      { semantic: { base: 'string', accepts: ['csv', 'tsv'] } }
    ).status).toBe('incompatible');
  });

  it('treats one-sided qualifiers by the documented rule', () => {
    expect(compareNodePorts(
      { semantic: { base: 'entityRef' } },
      { semantic: { base: 'entityRef', typeId: 'customer' } }
    )).toMatchObject({ status: 'conditional', compatible: true });
    expect(compareNodePorts(
      { semantic: { base: 'entityRef', typeId: 'customer' } },
      { semantic: { base: 'entityRef' } }
    )).toMatchObject({ status: 'incompatible', compatible: false });
  });

  it('marks optional outputs for runtime presence validation', () => {
    expect(compareNodePorts(
      { semantic: { base: 'string' }, required: false },
      { semantic: { base: 'string' }, required: true }
    )).toMatchObject({ status: 'conditional', compatible: true });
    expect(compareNodePorts(
      { semantic: { base: 'json', kind: 'text.document-block' }, required: false },
      { semantic: { base: 'json', kind: 'text.flow-document' }, required: true }
    )).toMatchObject({ status: 'incompatible', compatible: false });
  });

  it('treats nullability as a separate semantic constraint', () => {
    expect(compareNodePorts(
      { semantic: { base: 'string', nullable: true } },
      { semantic: { base: 'string' } }
    )).toMatchObject({ status: 'conditional', compatible: true });
    expect(compareNodePorts(
      { semantic: { base: 'string' } },
      { semantic: { base: 'string', nullable: true } }
    )).toMatchObject({ status: 'safe-coercion', compatible: true });
  });

  it('runtime-checks nullable sources even at a generic JSON boundary', () => {
    expect(compareNodePorts(
      { semantic: { base: 'json', nullable: true } },
      { semantic: { base: 'json' } }
    )).toMatchObject({ status: 'conditional', compatible: true });
  });

  it('requires explicit unit conversion', () => {
    expect(compareNodePorts(
      { semantic: { base: 'number', unit: 'mm' } },
      { semantic: { base: 'number', unit: 'm' } }
    )).toMatchObject({ status: 'conversion-required', compatible: false });
  });

  it('emits only frozen-vocabulary outcomes across the case matrix', () => {
    expect(PORT_COMPATIBILITY_OUTCOMES).toEqual(['exact', 'safe-coercion', 'conditional', 'conversion-required', 'incompatible']);
    expect(Object.isFrozen(PORT_COMPATIBILITY_OUTCOMES)).toBe(true);
    const block = { shape: 'item', semantic: { base: 'json', kind: 'text.document-block' } };
    const document = { shape: 'item', semantic: { base: 'json', kind: 'text.flow-document' } };
    const typed = { semantic: { base: 'json', kind: 'text.flow-document' } };
    const generic = { semantic: { base: 'json' } };
    const item = { shape: 'item', semantic: { base: 'record' } };
    const list = { shape: 'list', semantic: { base: 'record' } };
    const optional = { semantic: { base: 'string' }, required: false };
    const required = { semantic: { base: 'string' }, required: true };
    const nullable = { semantic: { base: 'string', nullable: true } };
    const pairs = [
      [block, block],
      [block, document],
      [typed, generic],
      [generic, typed],
      [item, list],
      [list, item],
      [optional, required],
      [required, nullable],
      [nullable, required],
      [{ semantic: { base: 'number', unit: 'mm' } }, { semantic: { base: 'number', unit: 'm' } }],
      [{ semantic: { base: 'entityRef', typeId: 'customer' } }, { semantic: { base: 'entityRef', typeId: 'invoice' } }],
      [{ semantic: { base: 'string', locale: 'en' } }, { semantic: { base: 'string', locale: 'en' } }],
      [{ semantic: { base: 'entityRef' } }, { semantic: { base: 'entityRef', typeId: 'customer' } }],
      [{ semantic: { base: 'string' } }, null]
    ];
    const emitted = new Set();
    for (const [source, target] of pairs) {
      const result = compareNodePorts(source, target);
      expect(PORT_COMPATIBILITY_OUTCOMES).toContain(result.status);
      expect(result.compatible).toBe(['exact', 'safe-coercion', 'conditional'].includes(result.status));
      expect(typeof result.reason).toBe('string');
      expect(Array.isArray(result.conversions)).toBe(true);
      emitted.add(result.status);
    }
    expect([...emitted].sort()).toEqual([...PORT_COMPATIBILITY_OUTCOMES].sort());
  });
});

describe('provider-neutral node contract', () => {
  it('normalizes provider contributions with matching node ownership and callable runtimes', () => {
    const definition = {
      provider: 'plugin.example', id: 'math.double', version: '1',
      palette: { group: 'math', label: 'Math' },
      inputs: [], outputs: [],
      execution: { kind: 'pure' }
    };
    const execute = () => ({});
    const provider = normalizeNodeProvider({ provider: 'plugin.example', definitions: [definition], execute });
    expect(provider.definitions[0].provider).toBe('plugin.example');
    expect(provider.execute).toBe(execute);
    expect(() => normalizeNodeProvider({ provider: 'plugin.other', definitions: [definition], execute })).toThrow(/belongs to plugin.example/);
  });

  it('requires every declared preview renderer to be provided by the same node provider', () => {
    const candidate = {
      provider: 'plugin.example', id: 'geometry.mesh', version: '1',
      palette: { group: 'geometry', label: 'Geometry' },
      inputs: [], outputs: [], execution: { kind: 'pure' },
      preview: { renderer: 'mesh' }
    };
    expect(() => normalizeNodeProvider({ provider: 'plugin.example', definitions: [candidate], execute: () => ({}) }))
      .toThrow(/missing preview renderer mesh/);
    const renderer = () => null;
    expect(normalizeNodeProvider({
      provider: 'plugin.example', definitions: [candidate], execute: () => ({}),
      previewRenderers: { mesh: renderer }
    }).previewRenderers.mesh).toBe(renderer);
    expect(normalizeNodeProvider({
      provider: 'plugin.example', definitions: [candidate], execute: () => ({}),
      previewRenderers: { mesh: 'mesh-preview' }
    }).previewRenderers.mesh).toBe('mesh-preview');
    const surface = { id: 'mesh-preview', url: '/api/plugins/example/module/mesh.mjs', surfaceContract: 1 };
    expect(normalizeNodeProvider({
      provider: 'plugin.example', definitions: [candidate], execute: () => ({}),
      previewRenderers: { mesh: surface }
    }).previewRenderers.mesh).toEqual(surface);
    expect(() => normalizeNodeProvider({
      provider: 'plugin.example', definitions: [candidate], execute: () => ({}),
      previewRenderers: { mesh: 'Mesh Preview' }
    })).toThrow(/preview surface ids/);
  });

  it('normalizes and validates provider conversion declarations', () => {
    expect(CONVERSION_FIDELITIES).toEqual(['lossless', 'semantically-lossy', 'visual-only']);
    const nodeDefinition = {
      provider: 'plugin.example', id: 'geometry.scale', version: '1',
      palette: { group: 'geometry', label: 'Geometry' },
      inputs: [], outputs: [],
      execution: { kind: 'pure' }
    };
    const conversion = {
      id: 'length.mm-to-m',
      from: { base: 'number', unit: 'mm' },
      to: { base: 'number', unit: 'm' },
      runtime: 'javascript',
      deterministic: true,
      fidelity: 'lossless'
    };
    const provider = normalizeNodeProvider({
      provider: 'plugin.example', definitions: [nodeDefinition], execute: () => ({}),
      conversions: [conversion]
    });
    expect(provider.conversions).toEqual([{
      id: 'length.mm-to-m',
      from: { base: 'number', unit: 'mm' },
      to: { base: 'number', unit: 'm' },
      runtime: 'javascript',
      deterministic: true,
      fidelity: 'lossless'
    }]);
    expect(Object.isFrozen(provider.conversions[0])).toBe(true);
    expect(() => normalizeNodeProvider({
      provider: 'plugin.example', definitions: [nodeDefinition], execute: () => ({}),
      conversions: [conversion, conversion]
    })).toThrow(/Node provider plugin\.example declares duplicate conversion length\.mm-to-m/);
    expect(() => normalizeNodeProvider({
      provider: 'plugin.example', definitions: [nodeDefinition], execute: () => ({}),
      conversions: [{ ...conversion, fidelity: 'magical' }]
    })).toThrow(/Node provider plugin\.example conversion length\.mm-to-m fidelity/);
    expect(() => normalizeNodeProvider({
      provider: 'plugin.example', definitions: [nodeDefinition], execute: () => ({}),
      conversions: [{ ...conversion, from: { unit: 'mm' } }]
    })).toThrow(/Node provider plugin\.example conversion length\.mm-to-m requires a from descriptor/);
  });

  it('normalizes and freezes a provider-qualified operation definition', () => {
    const normalized = normalizeNodeDefinition(definition());
    expect(normalized).toMatchObject({
      provider: 'plugin.documents',
      id: 'document.compose',
      version: '2',
      execution: { kind: 'pure', deterministic: true }
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.inputs[0].semantic)).toBe(true);
  });

  it('preserves and validates provider-owned compatibility profiles on normalized ports', () => {
    const candidate = definition({
      inputs: [{ id: 'source', semantic: { base: 'json', nominal: 'invoice' }, compatibility: { profile: 'perigram.cts' } }]
    });
    const normalized = normalizeNodeDefinition(candidate);
    expect(normalized.inputs[0].compatibility).toEqual({ profile: 'perigram.cts' });
    expect(validateNodeDefinition(definition({
      inputs: [{ id: 'source', semantic: { base: 'json' }, compatibility: { profile: 'not a profile' } }]
    })).map(problem => problem.code)).toContain('invalid-port-compatibility');
    const registry = createPortCompatibilityRegistry();
    registry.register('perigram.cts', (source, target) => ({
      status: source.semantic.nominal === target.semantic.nominal ? 'exact' : 'incompatible',
      compatible: source.semantic.nominal === target.semantic.nominal,
      reason: 'CTS nominal type compatibility',
      conversions: []
    }));
    expect(registry.compare(normalized.inputs[0], {
      compatibility: { profile: 'perigram.cts' }, semantic: { base: 'json', nominal: 'invoice' }
    })).toMatchObject({ status: 'exact', compatible: true });
  });

  it('requires an explicit semantic palette group and normalizes searchable keywords', () => {
    expect(validateNodeDefinition(definition({ palette: undefined })).map(problem => problem.code)).toContain('missing-palette');
    const normalized = normalizeNodeDefinition(definition({
      palette: { group: 'document-authoring', label: 'Document authoring', keywords: ['markdown', 'Report', 'markdown'] }
    }));
    expect(normalized.palette).toEqual({
      group: 'document-authoring',
      label: 'Document authoring',
      keywords: ['markdown', 'report']
    });
    expect(normalizeNodeDefinition(definition()).palette).toEqual({
      group: 'documents', label: 'Documents', keywords: ['files']
    });
    expect(validateNodeDefinition(definition({ palette: { keywords: ['files'] } }))
      .map(problem => problem.code)).toContain('invalid-palette-group');
    expect(validateNodeDefinition(definition({ palette: { group: 'Not a slug' } }))
      .map(problem => problem.code)).toContain('invalid-palette-group');
    expect(validateNodeDefinition(definition({ palette: { keywords: [''] } }))
      .map(problem => problem.code)).toContain('invalid-palette-keywords');
  });

  it('preserves runtime and target declarations for managed provider execution', () => {
    const normalized = normalizeNodeDefinition(definition({
      execution: { kind: 'pure', runtime: 'javascript', targets: ['browser', 'server'], deterministic: true }
    }));
    expect(normalized.execution).toMatchObject({ runtime: 'javascript', targets: ['browser', 'server'] });
    expect(validateNodeDefinition(definition({ execution: { kind: 'pure', runtime: 'Bad Runtime', targets: ['browser'] } }))
      .map(problem => problem.code)).toContain('invalid-runtime');
    expect(validateNodeDefinition(definition({ execution: { kind: 'pure', runtime: 'javascript' } }))
      .map(problem => problem.code)).toContain('missing-targets');
    expect(validateNodeDefinition(definition({ execution: { kind: 'effect', runtime: 'javascript', targets: ['browser', 'server'], capabilities: ['organization.instances.update'] } }))
      .map(problem => problem.code)).toContain('server-target-required');
    expect(validateNodeDefinition(definition({ execution: { kind: 'effect', runtime: 'javascript', targets: ['server'], capabilities: [] } }))
      .map(problem => problem.code)).toContain('missing-effect-capability');
  });

  it('requires qualified, unique host capability ids', () => {
    expect(validateNodeDefinition(definition({
      execution: { kind: 'read', capabilities: ['files.read', 'organization.instances.query'] }
    }))).toEqual([]);
    expect(validateNodeDefinition(definition({
      execution: { kind: 'read', capabilities: ['files'] }
    })).map(problem => problem.code)).toContain('invalid-capability');
    expect(validateNodeDefinition(definition({
      execution: { kind: 'read', capabilities: ['files.read', 'files.read'] }
    })).map(problem => problem.code)).toContain('duplicate-capability');
  });

  it('accepts existing stable camel-case operation and port ids', () => {
    const candidate = definition({
      id: 'source.literalItem',
      outputs: [{ id: 'itemValue', semantic: { base: 'json' } }]
    });
    expect(validateNodeDefinition(candidate)).toEqual([]);
  });

  it('validates semantic descriptors and transport shapes independently', () => {
    const candidate = definition({
      inputs: [{ id: 'items', shape: 'tree', semantic: { base: 'geometry', provider: 'plugin.cad' } }]
    });
    expect(validateNodeDefinition(candidate)).toEqual([]);
  });

  it('rejects duplicate ports and unknown transport shapes', () => {
    const candidate = definition({
      inputs: [
        { id: 'source', semantic: { base: 'record' } },
        { id: 'source', shape: 'matrix', semantic: { base: 'record' } }
      ]
    });
    expect(validateNodeDefinition(candidate).map(problem => problem.code)).toEqual(
      expect.arrayContaining(['duplicate-port-id', 'invalid-port-shape'])
    );
  });

  it('requires non-empty semantic descriptors for every port', () => {
    const candidate = definition({
      inputs: [{ id: 'source', semantic: {} }]
    });
    expect(validateNodeDefinition(candidate).map(problem => problem.code)).toContain('missing-semantic');
  });

  it('rejects missing provider identity, version, and execution classification', () => {
    const candidate = definition({ provider: '', version: '', execution: { kind: 'unknown' } });
    expect(validateNodeDefinition(candidate).map(problem => problem.code)).toEqual(
      expect.arrayContaining(['invalid-provider', 'missing-version', 'invalid-execution-kind'])
    );
  });

  it('registers multiple providers and resolves exact pinned versions', () => {
    const registry = createNodeProviderRegistry();
    registry.register(definition());
    registry.register(definition({
      provider: 'plugin.geometry',
      id: 'solid.extrude',
      version: '4',
      inputs: [{ id: 'profile', semantic: { base: 'curve', provider: 'plugin.geometry' } }],
      outputs: [{ id: 'solid', semantic: { base: 'solid', provider: 'plugin.geometry' } }]
    }));
    expect(registry.resolve('plugin.documents', 'document.compose', '2').label).toBe('Compose document');
    expect(registry.resolve('plugin.documents', 'document.compose', '3')).toBeNull();
    expect(registry.providers()).toEqual(['plugin.documents', 'plugin.geometry']);
    expect(registry.list()).toHaveLength(2);
  });

  it('rejects duplicate provider-qualified operation versions', () => {
    const registry = createNodeProviderRegistry();
    registry.register(definition());
    expect(() => registry.register(definition())).toThrow(/already registered/);
  });

  it('returns a diagnostic instead of accepting executable runtime values in contracts', () => {
    const candidate = definition({
      configuration: { callback() {} }
    });
    expect(validateNodeDefinition(candidate).map(problem => problem.code)).toContain('invalid-configuration');
  });

  it('returns the validated frozen definition from assert', () => {
    expect(assertValidNodeDefinition(definition()).provider).toBe('plugin.documents');
  });
});

describe('provider-owned port compatibility profiles', () => {
  it('delegates domain-specific compatibility through the shared graph contract', () => {
    const registry = createPortCompatibilityRegistry();
    registry.register('perigram.cts', (source, target) => ({
      status: source.semantic?.nominal === target.semantic?.nominal ? 'exact' : 'incompatible',
      compatible: source.semantic?.nominal === target.semantic?.nominal,
      reason: 'CTS nominal type compatibility',
      conversions: []
    }));
    expect(registry.compare(
      { compatibility: { profile: 'perigram.cts' }, semantic: { nominal: 'invoice' } },
      { compatibility: { profile: 'perigram.cts' }, semantic: { nominal: 'invoice' } }
    )).toMatchObject({ status: 'exact', compatible: true });
    expect(registry.compare(
      { compatibility: { profile: 'perigram.cts' }, semantic: { nominal: 'invoice' } },
      { compatibility: { profile: 'perigram.cts' }, semantic: { nominal: 'customer' } }
    )).toMatchObject({ status: 'incompatible', compatible: false });
    expect(registry.compare(
      { compatibility: { profile: 'perigram.missing' }, semantic: { base: 'json' } },
      { semantic: { base: 'json' } }
    )).toMatchObject({ status: 'incompatible', compatible: false });
  });

  it('rejects profile collisions and invalid comparators', () => {
    const registry = createPortCompatibilityRegistry();
    registry.register('perigram.cts', () => ({ status: 'exact', compatible: true }));
    expect(() => registry.register('perigram.cts', () => ({}))).toThrow(/already registered/);
    expect(() => registry.register('bad profile', () => ({}))).toThrow(/stable id/);
    expect(() => registry.register('perigram.other', null)).toThrow(/comparator/);
  });

  it('throws when a profile comparator violates the comparison result contract', () => {
    const registry = createPortCompatibilityRegistry();
    registry.register('perigram.cts', () => ({ status: 'maybe', compatible: true, reason: 'Unknown verdict', conversions: [] }));
    expect(() => registry.compare(
      { compatibility: { profile: 'perigram.cts' }, semantic: { base: 'json' } },
      { compatibility: { profile: 'perigram.cts' }, semantic: { base: 'json' } }
    )).toThrow(/unknown compatibility status maybe/);
    registry.register('perigram.other', () => ({ status: 'exact', compatible: true, reason: 'Missing conversions key' }));
    expect(() => registry.compare(
      { compatibility: { profile: 'perigram.other' }, semantic: { base: 'json' } },
      { compatibility: { profile: 'perigram.other' }, semantic: { base: 'json' } }
    )).toThrow(/requires a conversions array/);
  });

  it('passes well-formed profile results through', () => {
    const registry = createPortCompatibilityRegistry();
    const result = { status: 'exact', compatible: true, reason: 'CTS nominal type compatibility', conversions: [] };
    registry.register('perigram.cts', () => result);
    expect(registry.compare(
      { compatibility: { profile: 'perigram.cts' }, semantic: { base: 'json' } },
      { compatibility: { profile: 'perigram.cts' }, semantic: { base: 'json' } }
    )).toBe(result);
  });

  it('enforces the status/compatible invariant map at the profile boundary', () => {
    const registry = createPortCompatibilityRegistry();
    const compareThrough = profile => registry.compare(
      { compatibility: { profile }, semantic: { base: 'json' } },
      { semantic: { base: 'json' } }
    );
    const valid = [
      ['exact', true],
      ['safe-coercion', true],
      ['conditional', true],
      ['conversion-required', false],
      ['incompatible', false]
    ];
    for (const [status, compatible] of valid) {
      registry.register(`probe.${status}`, () => ({ status, compatible, reason: 'Probe verdict', conversions: [] }));
      expect(compareThrough(`probe.${status}`).status).toBe(status);
    }
    const contradictions = [
      ['incompatible', true],
      ['conversion-required', true],
      ['exact', false],
      ['safe-coercion', false],
      ['conditional', false]
    ];
    for (const [status, compatible] of contradictions) {
      registry.register(`probe.bad-${status}`, () => ({ status, compatible, reason: 'Contradictory verdict', conversions: [] }));
      expect(() => compareThrough(`probe.bad-${status}`))
        .toThrow(new RegExp(`status ${status} with compatible ${compatible}; expected ${!compatible}`));
    }
  });

  it('attaches registered conversions to conversion-required verdicts by exact descriptor match', () => {
    const registry = createPortCompatibilityRegistry();
    registry.registerConversions([
      { id: 'length.mm-to-m', from: { base: 'number', unit: 'mm' }, to: { base: 'number', unit: 'm' }, deterministic: true, fidelity: 'lossless' },
      { id: 'length.m-to-ft', from: { base: 'number', unit: 'm' }, to: { base: 'number', unit: 'ft' }, deterministic: true, fidelity: 'lossless' }
    ]);
    const result = registry.compare(
      { shape: 'item', semantic: { base: 'number', unit: 'mm' } },
      { shape: 'item', semantic: { base: 'number', unit: 'm' } }
    );
    expect(result.status).toBe('conversion-required');
    expect(result.compatible).toBe(false);
    expect(result.conversions).toHaveLength(1);
    expect(result.conversions[0].id).toBe('length.mm-to-m');
    expect(registry.compare(
      { shape: 'item', semantic: { base: 'number', unit: 's' } },
      { shape: 'item', semantic: { base: 'number', unit: 'm' } }
    ).conversions).toEqual([]);
  });

  it('enriches profile-returned conversion-required verdicts', () => {
    const registry = createPortCompatibilityRegistry();
    registry.register('perigram.cts', () => ({ status: 'conversion-required', compatible: false, reason: 'CTS units differ', conversions: [] }));
    registry.registerConversions([
      { id: 'length.mm-to-m', from: { base: 'number', unit: 'mm' }, to: { base: 'number', unit: 'm' }, deterministic: true, fidelity: 'lossless' }
    ]);
    expect(registry.compare(
      { compatibility: { profile: 'perigram.cts' }, semantic: { base: 'number', unit: 'mm' } },
      { compatibility: { profile: 'perigram.cts' }, semantic: { base: 'number', unit: 'm' } }
    )).toMatchObject({ status: 'conversion-required', compatible: false, conversions: [{ id: 'length.mm-to-m' }] });
  });
});
