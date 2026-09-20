import { describe, expect, it } from 'vitest';
import { resolveCtsDefinition } from './graph-protocol.js';

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

function constructNode(entityType, mode) {
  return { kind: 'cts.construct', typeId: entityType, via: mode };
}

function resolvedModes(definition) {
  const { definition: lowered } = resolveCtsDefinition(definition, domain);
  return Object.values(lowered.processNodes || {})
    .filter(node => node.kind === 'effect.createEntity')
    .map(node => node.construction?.mode);
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
