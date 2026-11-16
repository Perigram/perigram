import { describe, expect, it } from 'vitest';
import {
  assertValidNodeDefinition,
  createNodeProviderRegistry,
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
