import { describe, expect, it } from 'vitest';
import { resolveCtsDefinition } from './graph-protocol.js';
import { createTypeRegistry, projectDomainFromView, frameworkTypes } from '~/packages/cts/src/index.js';
import { composeSystemDeclarations } from '~/server/packs/declarations.js';
import { constructionInputsForContract, createDefinitionAuthoring, compileProcessDefinition, prepareAuthoredDefinition, validateProcessDefinition } from '~/packages/processes/src/index.js';
import { facadeDomain, facadePackContent } from '../../../../test-tools/facade-plugin.js';

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
  const { definition: resolved } = resolveCtsDefinition(definition, domain);
  return Object.values(resolved.processNodes || {})
    .filter(node => node.kind === 'cts.construct')
    .map(node => node.construction?.mode);
}

function realDomain() {
  const registry = createTypeRegistry({ id: 'repro' });
  for (const declaration of [...frameworkTypes, ...composeSystemDeclarations(), ...facadePackContent.types]) registry.defineType(declaration);
  return projectDomainFromView(registry, 'org-1', facadeDomain, { packServices: [] });
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
      producerOutputs: {}, actions: {}, services: {}, sockets: {}, screens: {}, stateDefinitions: {}, valueInputs: {},
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
});

// Creation-protocol construction inputs (SPEC §4 + SPEC.md §UI): the
// editor protocol is the blank create — no prompted rows — and upload
// keeps its payload row alone. A declared mode addresses exactly its
// mode inputs plus lineage/relation edges; an undeclared mode keeps the
// whole contract list (genericCreate).
describe('creation-protocol construction inputs', () => {
  it('a declared blank mode (editor) addresses the edges alone, never the rows', () => {
    const contract = realDomain().construction.cassette;
    expect(contract.modeInputs.editor).toEqual([]);
    expect(constructionInputsForContract(contract, 'editor').map(input => input.id))
      .not.toContain('fields.name');
  });

  it('an upload mode keeps its payload input and never adds the rows', () => {
    const contract = realDomain().construction['xlsx-workbook'];
    expect(constructionInputsForContract(contract, 'upload').map(input => input.id)).toEqual(['payload']);
  });

  it('a content mode prompts the content string (the wired text becomes the payload)', () => {
    const contract = realDomain().construction['text-document'];
    expect(contract.modeInputs.content).toEqual([{
      id: 'content',
      label: 'Content',
      path: 'content',
      type: 'string',
      required: true,
      prompt: true,
      control: 'Textarea'
    }]);
    expect(constructionInputsForContract(contract, 'content').map(input => input.id)).toEqual(['content']);
  });

  it('an undeclared mode keeps the whole contract input list (genericCreate)', () => {
    const contract = { modes: ['genericCreate'], inputs: [{ id: 'name', path: 'name' }] };
    expect(constructionInputsForContract(contract, 'genericCreate')).toEqual([{ id: 'name', path: 'name' }]);
  });

  it('compiles editor creates with no prompted inputs and drops stale authored ones', () => {
    const domain = realDomain();
    const authoring = createDefinitionAuthoring(domain);
    authoring.drop('construct', { id: 'n1' });
    authoring.configure('n1', {
      typeId: 'sketch',
      construction: {
        mode: 'editor',
        inputs: [{ id: 'fields.name', path: 'fields.name', type: 'string', required: true, prompt: true }]
      },
      access: { level: 'write', grants: [] }
    });
    const compiled = compileProcessDefinition(authoring.definition(), domain);
    expect(compiled.errors || []).toEqual([]);
    const action = Object.values(compiled.actions || {}).find(item => item.typeId === 'sketch');
    expect(action.construction.inputs).toEqual([]);
    expect(action.inputPolicy.fields).toEqual([]);
  });
});
