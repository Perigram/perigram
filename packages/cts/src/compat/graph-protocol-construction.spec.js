import { describe, expect, it } from 'vitest';
import { resolveCtsDefinition } from './graph-protocol.js';
import { createTypeRegistry, projectDomainFromView, frameworkTypes } from '~/packages/cts/src/index.js';
import { composeSystemDeclarations } from '~/server/packs/declarations.js';
import { prepareAuthoredDefinition, validateProcessDefinition } from '~/packages/processes/src/index.js';
import { cncDomain } from '@cutkit/domain-cnc';

// Contract migration (SPEC §20): persisted construction modes the type no
// longer declares re-bind to the type's current default mode at the
// acceptance seam — the construct-mode hygiene change must not strand
// existing graphs.
const domain = {
  entities: [{ type: 'cassette' }, { type: 'image' }, { type: 'sheet-design' }],
  construction: {
    cassette: { modes: ['editor'], defaultMode: 'editor', inputs: [] },
    image: { modes: ['upload', 'capture'], defaultMode: 'upload', inputs: [] },
    'sheet-design': undefined
  }
};

function constructNode(typeId, mode) {
  return { kind: 'cts.construct', typeId: typeId, via: mode };
}

function resolvedModes(definition) {
  const { definition: lowered } = resolveCtsDefinition(definition, domain);
  return Object.values(lowered.processNodes || {})
    .filter(node => node.kind === 'effect.createEntity')
    .map(node => node.construction?.mode);
}

function realDomain() {
  const registry = createTypeRegistry({ id: 'repro' });
  for (const declaration of [...frameworkTypes, ...composeSystemDeclarations()]) registry.defineType(declaration);
  return projectDomainFromView(registry, 'org-1', cncDomain, { packServices: [] });
}

describe('construction-mode contract migration', () => {
  it('re-binds stale genericCreate to the type default (editor types)', () => {
    const modes = resolvedModes({ graphProtocol: 5, processNodes: { n1: constructNode('cassette', 'genericCreate') } });
    expect(modes).toEqual(['editor']);
  });

  it('re-binds stale genericCreate to the first declared protocol', () => {
    const modes = resolvedModes({ graphProtocol: 5, processNodes: { n1: constructNode('image', 'genericCreate') } });
    expect(modes).toEqual(['upload']);
  });

  it('keeps still-declared modes untouched', () => {
    const modes = resolvedModes({ graphProtocol: 5, processNodes: {
      n1: constructNode('image', 'capture'),
      n2: constructNode('cassette', 'editor')
    } });
    expect(modes).toEqual(['capture', 'editor']);
  });

  it('leaves derived-type create nodes to validation (no contract to re-bind)', () => {
    const modes = resolvedModes({ graphProtocol: 5, processNodes: { n1: constructNode('sheet-design', 'genericCreate') } });
    expect(modes).toEqual(['genericCreate']);
  });
});

// End-to-end repro of the live validation errors: persisted construct
// nodes bound via genericCreate on types whose construction is now
// protocols-only must re-bind and validate cleanly through the real
// seam (prepareAuthoredDefinition) against the real projected domain.
describe('persisted genericCreate constructs validate against the real domain', () => {
  it('re-binds v5 cassette and sketch constructs and validates', () => {
    const projected = realDomain();
    const definition = {
      dataflowVersion: 4,
      graphProtocol: 5,
      graph: { nodes: [], edges: [] },
      roleGrants: { role_admin: [] },
      producerOutputs: {}, actions: {}, services: {}, sockets: {}, screens: {}, statusDefinitions: {}, valueInputs: {},
      processNodes: {
        n1: { id: 'n1', kind: 'cts.construct', typeId: 'cassette', via: 'genericCreate', label: 'Make cassette' },
        n2: { id: 'n2', kind: 'cts.construct', typeId: 'sketch', via: 'genericCreate', label: 'Make sketch' }
      }
    };
    const { definition: accepted, errors } = prepareAuthoredDefinition(definition, projected);
    expect(errors).toEqual([]);
    const modes = Object.values(accepted.processNodes || {}).map(node => `${node.typeId}:${node.construction?.mode}`);
    expect(modes).toEqual(['cassette:editor', 'sketch:editor']);
    const validation = validateProcessDefinition(accepted, projected, {});
    expect((validation.errors || []).filter(error => error.includes('construction mode'))).toEqual([]);
  });

  it('covers v4-authored effect.createEntity records (the migrateV4 path)', () => {
    const projected = realDomain();
    const definition = {
      dataflowVersion: 4,
      graph: { nodes: [], edges: [] },
      roleGrants: { role_admin: [] },
      producerOutputs: {}, actions: {}, services: {}, sockets: {}, screens: {}, statusDefinitions: {}, valueInputs: {},
      processNodes: {
        n1: { id: 'n1', kind: 'effect.createEntity', typeId: 'cassette', construction: { mode: 'genericCreate' }, label: 'Make cassette' }
      }
    };
    const { definition: accepted, errors } = prepareAuthoredDefinition(definition, projected);
    expect(errors).toEqual([]);
    const modes = Object.values(accepted.processNodes || {}).map(node => `${node.typeId}:${node.construction?.mode}`);
    expect(modes).toEqual(['cassette:editor']);
  });
});
