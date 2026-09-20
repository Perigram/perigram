import { describe, expect, it } from 'vitest';
import { createTypeRegistry, projectDomainFromView, CLASS_COLLECTIONS } from '../index.js';
import { cncTypePack } from '../pack/cnc.js';
import { frameworkTypes } from '../pack/framework.js';

// The view fixture: framework party types, the CNC starter pack, and one
// org-authored type exercising children edges, states, and a payload.
function registry() {
  const reg = createTypeRegistry({ id: 'spec' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) {
    reg.defineType(declaration);
  }
  return reg;
}

const orgPanel = {
  id: 'panel',
  class: 'item',
  scope: 'org',
  organizationId: 'org-1',
  version: 1,
  fields: {
    serial: { base: 'string' },
    width: { base: 'quantity', unit: 'mm' }
  },
  edges: { relations: { 'placed-on': { types: ['sheet'], onRemove: 'detach' } } },
  states: { main: { initial: 'available', values: ['available', 'installed'], terminal: ['installed'] } },
  transitions: [{ from: 'available', to: 'installed', intent: 'installPanel' }]
};

const orgBin = {
  id: 'bin',
  class: 'group',
  scope: 'org',
  organizationId: 'org-1',
  version: 1,
  fields: { name: { base: 'string' } },
  edges: { children: { panels: { types: ['panel'], onRemove: 'restrict' } } }
};

const orgDoc = {
  id: 'spec-sheet',
  class: 'file',
  scope: 'org',
  organizationId: 'org-1',
  version: 1,
  payload: { mime: ['text/plain'], accept: ['.txt'], maxSize: 1024, preview: 'text' },
  fields: { note: { base: 'string', nullable: true } }
};

function orgRegistry() {
  const reg = registry();
  for (const declaration of [orgPanel, orgBin, orgDoc]) reg.defineType(declaration);
  return reg;
}

const legacyBase = {
  entities: [{ type: 'oldqueue', collection: 'oldqueues', meta: false }],
  workflows: { oldqueue: { schemaVersion: 2, regions: { main: { states: { DRAFT: {} }, transitions: [] } } } },
  fieldSchemas: { oldqueue: [{ path: 'data.old', block: 'data' }] },
  fieldAccess: { oldqueue: { feature: 'queues', read: ['data.*'], write: ['data.*'] } },
  containment: [{ parentType: 'oldproject', childType: 'oldqueue', lineageKey: 'oldprojectId' }],
  construction: { oldqueue: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] } },
  relations: [{ ownerType: 'oldqueue', key: 'old', targetType: 'oldproject', cardinality: 'many' }],
  attachmentKinds: { OLD_KIND: { kind: 'OLD_KIND' } },
  commands: { doThing: { id: 'doThing' } }
};

describe('domain projection (synthesis only, after the legacy cut)', () => {
  it('synthesizes entities with per-class collections for every non-party type', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1', legacyBase);
    const byType = new Map(projected.entities.map(entity => [entity.type, entity]));
    expect(byType.get('panel')).toMatchObject({ type: 'panel', collection: CLASS_COLLECTIONS.item, meta: false });
    expect(byType.get('bin')).toMatchObject({ collection: CLASS_COLLECTIONS.group });
    expect(byType.get('spec-sheet')).toMatchObject({ collection: CLASS_COLLECTIONS.file });
    expect(byType.get('occs')).toMatchObject({ collection: CLASS_COLLECTIONS.file });
    expect(byType.get('sheet')).toMatchObject({ collection: CLASS_COLLECTIONS.item });
    expect(byType.get('oldqueue')).toBeUndefined();
    expect(projected.entities.some(entity => entity.type === 'organization')).toBe(false);
  });

  it('ignores legacy domain content on the base while keeping operator contracts', () => {
    const projected = projectDomainFromView(registry(), null, legacyBase);
    expect(projected.entities.map(entity => entity.type)).not.toContain('oldqueue');
    expect(projected.workflows.oldqueue).toBeUndefined();
    expect(projected.fieldSchemas.oldqueue).toBeUndefined();
    expect(projected.fieldAccess.oldqueue).toBeUndefined();
    expect(projected.containment).not.toContainEqual(
      { parentType: 'oldproject', childType: 'oldqueue', lineageKey: 'oldprojectId' });
    expect(projected.construction.oldqueue).toBeUndefined();
    expect(projected.relations).not.toContainEqual(
      { ownerType: 'oldqueue', key: 'old', targetType: 'oldproject', cardinality: 'many' });
    expect(projected.attachmentKinds.OLD_KIND).toBeUndefined();
    expect(projected.commands).toEqual({ doThing: { id: 'doThing' } });
  });

  it('derives workflows from declared states with render policy', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    const workflow = projected.workflows.panel;
    expect(workflow.schemaVersion).toBe(2);
    expect(workflow.regions.main.initial).toBe('available');
    expect(Object.keys(workflow.regions.main.states)).toEqual(['available', 'installed']);
    expect(workflow.regions.main.states.installed.isTerminal).toBe(true);
    expect(workflow.regions.main.transitions).toEqual([
      { from: 'available', to: 'installed', intent: 'installPanel' }
    ]);
    expect(projected.workflows.cassette).toBeUndefined();
  });

  it('synthesizes field schemas with row fields and lineage from children edges', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    const paths = projected.fieldSchemas.panel.map(schema => schema.path);
    expect(paths).toContain('identity.name');
    expect(paths).toContain('data.serial');
    expect(paths).toContain('specs.width');
    expect(paths).toContain('lineage.binId');
    expect(projected.fieldSchemas.panel.find(schema => schema.path === 'specs.width'))
      .toMatchObject({ type: { base: 'number', unit: 'mm' }, constructible: true });
    expect(projected.fieldAccess.panel).toMatchObject({ feature: 'cts-types' });
  });

  it('synthesizes containment from children edges with camel-case lineage keys', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    expect(projected.containment).toEqual(expect.arrayContaining([
      { parentType: 'bin', childType: 'panel', lineageKey: 'binId' }
    ]));
    expect(projected.containment).toEqual(expect.arrayContaining([
      { parentType: 'project', childType: 'queue', lineageKey: 'projectId' }
    ]));
  });

  it('synthesizes generic construction plus declared construct operators', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    const construction = projected.construction.panel;
    expect(construction.modes).toEqual(['genericCreate']);
    expect(construction.defaultMode).toBe('genericCreate');
    // lineage keys and declared relation edges are construct-addressable
    // (SPEC §6): the panel's parent bin arrives as lineage.binId, its
    // declared relation as relations.placed-on
    expect(construction.inputs.map(input => input.id)).toEqual(
      ['name', 'lineage.binId', 'relations.placed-on', 'data.serial', 'specs.width']
    );
    expect(construction.inputs.find(input => input.id === 'relations.placed-on')).toMatchObject({
      type: 'entityList',
      entityType: 'sheet'
    });
    // Create-dialog labels are authored vocabulary: the lineage input is
    // named by its parent type's render label, row inputs by the
    // start-cased row name — storage paths never reach a dialog.
    expect(construction.inputs.find(input => input.id === 'lineage.binId')).toMatchObject({ label: 'Bin' });
    expect(construction.inputs.find(input => input.id === 'data.serial')).toMatchObject({ label: 'Serial' });
    expect(construction.inputs.find(input => input.id === 'specs.width')).toMatchObject({ label: 'Width' });
    const occs = projected.construction.occs;
    expect(occs.modes).toEqual(['genericCreate']);
  });

  it('projects declared relation edges from view types', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    expect(projected.relations).toEqual(expect.arrayContaining([
      { ownerType: 'panel', key: 'placed-on', targetType: 'sheet', cardinality: 'many' }
    ]));
  });

  it('synthesizes attachment kinds from payload traits', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    expect(projected.attachmentKinds['spec-sheet']).toMatchObject({
      kind: 'spec-sheet',
      mimeType: 'text/plain',
      creation: { mode: 'upload', accept: '.txt' },
      preview: { mode: 'text' },
      file: { maxBytes: 1024 }
    });
    expect(projected.attachmentKinds.occs).toMatchObject({ kind: 'occs', mimeType: 'application/perigram+occs' });
  });

  it('resolves the organization view: system types plus this org only', () => {
    const other = { ...orgPanel, id: 'secret', organizationId: 'org-2' };
    const reg = orgRegistry();
    reg.defineType(other);
    const forOrg1 = projectDomainFromView(reg, 'org-1');
    expect(forOrg1.entities.map(entity => entity.type)).not.toContain('secret');
    const forOrg2 = projectDomainFromView(reg, 'org-2');
    expect(forOrg2.entities.map(entity => entity.type)).toContain('secret');
  });
});
