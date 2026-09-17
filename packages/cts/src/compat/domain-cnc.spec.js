import { describe, it, expect } from 'vitest';
import {
  convertCncDomain, convertCncWorkflows, convertAttachmentKinds, classForEntityType, toTypeId
} from './domain-cnc.js';
import { createTypeRegistry, compileClientBundle, renderPolicyFor } from '../index.js';
import { cncEntities, cncWorkflows, cncContainment, cncAttachmentKinds } from '../../../domain-cnc/src/index.js';

function convertedRegistry() {
  const registry = createTypeRegistry({ id: 'cnc-strangler' });
  for (const declaration of convertCncDomain({
    entities: cncEntities, workflows: cncWorkflows, containment: cncContainment
  })) {
    registry.defineType(declaration);
  }
  return registry;
}

describe('strangler conversion of the live CNC domain', () => {
  it('maps every entity to a class', () => {
    expect(classForEntityType('queue')).toBe('process');
    expect(classForEntityType('sheet')).toBe('item');
    expect(classForEntityType('project')).toBe('group');
    expect(classForEntityType('cassette')).toBe('file');
    for (const entity of cncEntities) expect(classForEntityType(entity.type)).toBeTruthy();
    expect(cncEntities).toHaveLength(30);
  });

  it('compiles the whole converted domain clean (R1-R6 hold after conversion)', () => {
    const compiled = convertedRegistry().compile();
    expect(compiled.errors).toEqual([]);
    expect(compiled.types.size).toBe(30);
  });

  it('workflows become single-axis states with intents preserved', () => {
    const queue = convertedRegistry().getType('queue');
    expect(queue.states.main.initial).toBe('DRAFT');
    expect(queue.states.main.values).toEqual(expect.arrayContaining(['DRAFT', 'NESTING', 'READY', 'ERROR', 'CLOSED', 'ARCHIVED']));
    expect(queue.states.main.terminal).toEqual(expect.arrayContaining(['CLOSED', 'ARCHIVED']));
    const requestNesting = queue.transitions.find(transition => transition.intent === 'requestNesting');
    expect(requestNesting).toEqual({ axis: 'main', from: 'DRAFT', to: 'NESTING', intent: 'requestNesting' });

    const byType = convertCncWorkflows(cncWorkflows);
    expect(Object.keys(byType)).toHaveLength(Object.keys(cncWorkflows).length);
  });

  it('containment edges split: true grouping becomes children, derivation becomes child relations', () => {
    const registry = convertedRegistry();
    const project = registry.getType('project');
    expect(Object.keys(project.edges.children)).toEqual(expect.arrayContaining(['facade', 'queue']));
    const design = registry.getType('cassette-design');
    expect(design.edges.children).toBeUndefined();
    expect(design.edges.relations.cassette).toEqual({ types: ['cassette'], onRemove: 'restrict' });
    // file-class parents carry no children (R6): cassette is a file with derived designs
    expect(registry.getType('cassette').edges.children).toBeUndefined();
  });

  it('attachment kinds become payload trait data', () => {
    const traits = convertAttachmentKinds(cncAttachmentKinds);
    expect(traits.LAYOUT_DXF).toMatchObject({ preview: 'dxf', creation: 'command', editor: 'layout' });
    expect(traits.DXF_SOURCE.mime).toBe('application/dxf');
  });

  it('legacy payloads are quarantined Json, not typed rows', () => {
    const material = convertedRegistry().getType('material');
    expect(material.fields.legacy).toMatchObject({ base: 'json' });
    const sheet = convertedRegistry().getType('sheet');
    expect(sheet.fields.specs).toMatchObject({ base: 'json' });
  });
});

describe('render policy and client bundle', () => {
  it('derives labels/icons/severity from declarations — no status table', () => {
    const queue = convertedRegistry().getType('queue');
    const policy = renderPolicyFor(queue);
    expect(policy.label).toBe('queue');
    expect(policy.icon).toBe('pi pi-cog');
    expect(policy.states.DRAFT.severity).toBe('info');
    expect(policy.states.CLOSED.severity).toBe('secondary');
    expect(policy.states.DRAFT.label).toBe('DRAFT');
  });

  it('compiles a frontend/designer bundle with schemas attached', () => {
    const bundle = compileClientBundle(convertedRegistry());
    expect(bundle.ok).toBe(true);
    expect(bundle.types).toHaveLength(30);
    const queue = bundle.types.find(type => type.id === 'queue');
    expect(queue.schema.$schema).toContain('2020-12');
    expect(queue.schema.additionalProperties).toBe(false);
    expect(queue.render.states.NESTING.label).toBe('NESTING');
  });
});
