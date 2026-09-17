import { describe, it, expect } from 'vitest';
import { projectDomainFromView } from './domain-projection.js';
import { createTypeRegistry, convertCncDomain } from '../index.js';
import { cncEntities, cncWorkflows, cncContainment, cncEntityFieldSchemas, cncDomain } from '../../../domain-cnc/src/index.js';

function registryWithOrgType() {
  const registry = createTypeRegistry({ id: 'projection' });
  for (const declaration of convertCncDomain({
    entities: cncEntities, workflows: cncWorkflows, containment: cncContainment,
    fieldSchemas: cncEntityFieldSchemas
  })) {
    registry.defineType(declaration);
  }
  registry.defineType({
    id: 'widget', class: 'process', scope: 'org', organizationId: 'org-1',
    fields: { name: { base: 'string' }, note: { base: 'string' } },
    states: { main: { initial: 'raw', values: ['raw', 'done'], terminal: ['done'] } },
    transitions: [{ from: 'raw', to: 'done', intent: 'finish' }],
    edges: { relations: { parts: { types: ['queue'], onRemove: 'restrict' } } }
  });
  return registry;
}

describe('domain projection (CTS view -> compiler domain)', () => {
  it('system types project the workflow shape with legacy access merged', () => {
    const registry = registryWithOrgType();
    const projected = projectDomainFromView(registry, 'org-1', cncDomain);
    const queue = projected.workflows.queue;
    expect(queue.regions.main.initial).toBe('DRAFT');
    expect(queue.regions.main.states.CLOSED.isTerminal).toBe(true);
    const requestNesting = queue.regions.main.transitions.find(t => t.intent === 'requestNesting');
    expect(requestNesting.access).toEqual(cncDomain.workflows.queue.regions.main.transitions
      .find(t => t.intent === 'requestNesting').access);
    // entity list unchanged for system types; org types only append
    expect(projected.entities.slice(0, cncDomain.entities.length)).toEqual(cncDomain.entities);
  });

  it('org types project entities, workflows without fabricated access, field schemas, field access on the real feature, construction, and relations', () => {
    const registry = registryWithOrgType();
    const projected = projectDomainFromView(registry, 'org-1', cncDomain);
    expect(projected.entities.find(entity => entity.type === 'widget')).toMatchObject({ collection: 'widgets' });
    const widget = projected.workflows.widget;
    expect(widget.regions.main.initial).toBe('raw');
    expect(widget.regions.main.transitions[0]).toEqual({ from: 'raw', to: 'done', intent: 'finish' });
    expect(projected.fieldAccess.widget).toMatchObject({ feature: 'cts-types' });
    expect(projected.fieldAccess.widget.read).toContain('data.name');
    expect(projected.fieldAccess.widget.write).toEqual(['data.name', 'data.note']);
    expect(projected.relations).toContainEqual({ ownerType: 'widget', key: 'parts', targetType: 'queue', cardinality: 'many' });
    // org field schemas: core slots + row fields with access flags
    const widgetSchemas = projected.fieldSchemas.widget;
    expect(widgetSchemas.find(field => field.path === 'identity.name')).toMatchObject({ writable: false, constructible: true });
    expect(widgetSchemas.find(field => field.path === 'data.name')).toMatchObject({ writable: true, readable: true });
    expect(widgetSchemas.find(field => field.path === 'origin.state.primary').type.base).toBe('status');
    // org construction: generic creation with the name prompt
    expect(projected.construction.widget).toEqual({
      modes: ['genericCreate'],
      defaultMode: 'genericCreate',
      inputs: [{ id: 'name', label: 'Name', path: 'name', type: 'string', required: true, prompt: true }]
    });
  });

  it('org item quantities land in the specs slot with lineage fields from children edges', () => {
    const registry = registryWithOrgType();
    registry.defineType({
      id: 'batch', class: 'group', scope: 'org', organizationId: 'org-1',
      edges: { children: { entries: { types: ['gadget'], onRemove: 'restrict', lineageKey: 'batchId' } } }
    });
    registry.defineType({
      id: 'gadget', class: 'item', scope: 'org', organizationId: 'org-1',
      fields: { width: { base: 'quantity', unit: 'mm' }, label: { base: 'string' } },
      states: { main: { initial: 'new', values: ['new', 'gone'], terminal: ['gone'] } }
    });
    const projected = projectDomainFromView(registry, 'org-1', cncDomain);
    const gadgetSchemas = projected.fieldSchemas.gadget;
    expect(gadgetSchemas.find(field => field.path === 'specs.width')).toMatchObject({ type: { base: 'number', unit: 'mm' } });
    expect(gadgetSchemas.find(field => field.path === 'data.label')).toMatchObject({ type: { base: 'string' } });
    expect(gadgetSchemas.find(field => field.path === 'lineage.batchId')).toMatchObject({
      type: { base: 'entityRef', entityType: 'batch' }, constructible: true
    });
    expect(projected.entities.find(entity => entity.type === 'gadget').blocks).toContain('specs');
    expect(projected.containment).toContainEqual({ parentType: 'batch', childType: 'gadget', lineageKey: 'batchId' });
  });

  it('passes unconsumed domain keys through untouched', () => {
    const registry = registryWithOrgType();
    const projected = projectDomainFromView(registry, 'org-2', cncDomain);
    expect(projected.commands).toBe(cncDomain.commands);
    expect(projected.attachmentKinds).toBe(cncDomain.attachmentKinds);
    expect(projected.construction).toBe(cncDomain.construction);
    expect(projected.fieldAccess).toBe(cncDomain.fieldAccess);
    // org-2 view has no widget: nothing projected for it
    expect(projected.workflows.widget).toBeUndefined();
    expect(projected.entities.find(entity => entity.type === 'widget')).toBeUndefined();
    expect(projected.construction.widget).toBeUndefined();
  });
});
