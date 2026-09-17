import { describe, it, expect } from 'vitest';
import { projectDomainFromView } from './domain-projection.js';
import { createTypeRegistry, convertCncDomain } from '../index.js';
import { cncEntities, cncWorkflows, cncContainment, cncDomain } from '../../../domain-cnc/src/index.js';

function registryWithOrgType() {
  const registry = createTypeRegistry({ id: 'projection' });
  for (const declaration of convertCncDomain({ entities: cncEntities, workflows: cncWorkflows, containment: cncContainment })) {
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

  it('org types project entities, workflows without fabricated access, field access on the real feature, and relations', () => {
    const registry = registryWithOrgType();
    const projected = projectDomainFromView(registry, 'org-1', cncDomain);
    expect(projected.entities.find(entity => entity.type === 'widget')).toMatchObject({ collection: 'widgets' });
    const widget = projected.workflows.widget;
    expect(widget.regions.main.initial).toBe('raw');
    expect(widget.regions.main.transitions[0]).toEqual({ from: 'raw', to: 'done', intent: 'finish' });
    expect(projected.fieldAccess.widget).toMatchObject({ feature: 'cts-types' });
    expect(projected.fieldAccess.widget.read).toContain('data.name');
    expect(projected.relations).toContainEqual({ ownerType: 'widget', key: 'parts', targetType: 'queue', cardinality: 'many' });
  });

  it('passes unconsumed domain keys through untouched', () => {
    const registry = registryWithOrgType();
    const projected = projectDomainFromView(registry, 'org-2', cncDomain);
    expect(projected.commands).toBe(cncDomain.commands);
    expect(projected.attachmentKinds).toBe(cncDomain.attachmentKinds);
    expect(projected.construction).toBe(cncDomain.construction);
    // org-2 view has no widget: nothing projected for it
    expect(projected.workflows.widget).toBeUndefined();
    expect(projected.entities.find(entity => entity.type === 'widget')).toBeUndefined();
  });
});
