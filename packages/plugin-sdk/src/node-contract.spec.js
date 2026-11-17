import { describe, expect, it } from 'vitest';
import {
  assertValidNodeDefinition,
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
  inputs: [{ id: 'source', label: 'Source', shape: 'item', semantic: { base: 'record', schema: 'document-source' } }],
  outputs: [{ id: 'document', shape: 'item', semantic: { base: 'document', provider: 'plugin.documents' } }],
  execution: { kind: 'pure', capabilities: [], deterministic: true, idempotent: true },
  ...overrides
});

describe('provider-neutral node contract', () => {
  it('normalizes provider contributions with matching node ownership and callable runtimes', () => {
    const definition = {
      provider: 'plugin.example', id: 'math.double', version: '1',
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

  it('normalizes semantic palette groups and searchable keywords', () => {
    const normalized = normalizeNodeDefinition(definition({
      palette: { group: 'document-authoring', label: 'Document authoring', keywords: ['markdown', 'Report', 'markdown'] }
    }));
    expect(normalized.palette).toEqual({
      group: 'document-authoring',
      label: 'Document authoring',
      keywords: ['markdown', 'report']
    });
    expect(normalizeNodeDefinition(definition()).palette).toEqual({
      group: 'document',
      keywords: []
    });
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
