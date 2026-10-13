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
  name: 'Panel',
  class: 'item',
  scope: 'org',
  organizationId: 'org-1',
  version: 1,
  fields: {
    serial: { base: 'string' },
    width: { base: 'quantity', unit: 'mm' }
  },
  edges: { relations: { 'placed-on': { types: ['sheet'], onRemove: 'detach' } } }
};

const orgBin = {
  id: 'bin',
  name: 'Bin',
  class: 'group',
  scope: 'org',
  organizationId: 'org-1',
  version: 1,
  fields: { name: { base: 'string' } },
  edges: { children: { panels: { types: ['panel'], onRemove: 'restrict' } } }
};

const orgDoc = {
  id: 'spec-sheet',
  name: 'Spec sheet',
  class: 'file',
  scope: 'org',
  organizationId: 'org-1',
  version: 1,
  payload: { mime: ['text/plain'], accept: ['.txt'], maxSize: 1024, preview: 'text' },
  fields: { note: { base: 'string', nullable: true } }
};

function orgRegistry() {
  const reg = registry();
  for (const declaration of [orgPanel, orgBin, orgDoc, orgDerivedPlan]) reg.defineType(declaration);
  return reg;
}

const orgDerivedPlan = {
  id: 'derived-plan',
  name: 'Derived plan',
  class: 'file',
  scope: 'org',
  organizationId: 'org-1',
  version: 1,
  derived: true,
  fields: { geometry: { base: 'json', nullable: true } }
};

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

  it('projects no workflows — machines are graph-derived (SPEC §7)', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    expect(projected.workflows).toEqual({});
  });

  it('projects field schemas with row fields and lineage from children edges', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    const paths = projected.fieldSchemas.panel.map(schema => schema.path);
    expect(paths).toContain('name');
    expect(paths).toContain('fields.serial');
    expect(paths).toContain('fields.width');
    expect(paths).toContain('lineage.binId');
    expect(projected.fieldSchemas.panel.find(schema => schema.path === 'fields.width'))
      .toMatchObject({ type: { base: 'number', unit: 'mm' }, constructible: true });
    expect(projected.fieldAccess.panel).toMatchObject({ feature: 'cts-types' });
  });

  it('projects core field schemas as the §3 stored shape — no synthesized wire blocks', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    const paths = projected.fieldSchemas.panel.map(schema => schema.path);
    // What the wire carries, it must schema — the stored keys themselves:
    expect(paths).toEqual(expect.arrayContaining([
      '_id', 'type', 'typeVersion', 'organizationId', 'name',
      'state', 'stateChangedAt', 'createdAt', 'updatedAt', 'payload',
      'lineage.binId',
      'provenance.op', 'provenance.sources', 'provenance.effective'
    ]));
    // What nothing stores, it must not schema:
    for (const phantom of [
      'identity.uid', 'identity.name', 'identity.slug', 'identity.serial', 'identity.reference',
      'origin.state.primary', 'origin.userId', 'origin.timestamp', 'origin.metadata', 'origin.eventId', 'origin.lifecycle',
      'status.userId', 'status.timestamp', 'status.metadata', 'status.eventId', 'status.lifecycle',
      'provenance.source', 'relations.value', 'summary.value', 'attachments.primary', 'data.value'
    ]) {
      expect(paths, phantom).not.toContain(phantom);
    }
    expect(projected.fieldSchemas.panel.find(schema => schema.path === 'state'))
      .toMatchObject({ readable: true, writable: false });
    expect(projected.fieldSchemas.panel.find(schema => schema.path === 'createdAt'))
      .toMatchObject({ readable: true, writable: false });
    expect(projected.entities.find(entity => entity.type === 'panel').blocks)
      .toEqual(['fields', 'lineage', 'relations']);
  });

  it('offers the minted name row as a construction input (no hardcoded Name)', () => {
    const reg = registry();
    reg.defineType({
      id: 'blank',
      name: 'Blank',
      class: 'item',
      scope: 'org',
      organizationId: 'org-1',
      version: 1,
      fields: { geometry: { base: 'json', nullable: true } }
    });
    const projected = projectDomainFromView(reg, 'org-1');
    const construction = projected.construction.blank;
    // Identifier totality: the boundary minted the `name` row, so it is a
    // real declared row input — never a compiler-invented bare identity
    // prompt, and never absent (creates of this type name their records).
    expect(construction.inputs.map(input => input.id)).toEqual(['fields.geometry', 'fields.name']);
    expect(construction.inputs.some(input => input.id === 'name' || input.path === 'name')).toBe(false);
  });

  it('synthesizes containment from children edges with camel-case lineage keys', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    expect(projected.containment).toEqual(expect.arrayContaining([
      { parentType: 'bin', childType: 'panel', lineageKey: 'binId', declared: 'org' }
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
    // declared relation as relations.placed-on. No separate Name prompt:
    // normalization minted the identifier flag on `serial`, so the row
    // already names the record.
    expect(construction.inputs.map(input => input.id)).toEqual(
      ['lineage.binId', 'relations.placed-on', 'fields.serial', 'fields.width']
    );
    expect(construction.inputs.find(input => input.id === 'relations.placed-on')).toMatchObject({
      type: 'typeList',
      typeId: 'sheet'
    });
    // Create-dialog labels are authored vocabulary: the lineage input is
    // named by its parent type's render label, row inputs by the
    // start-cased row name — storage paths never reach a dialog.
    expect(construction.inputs.find(input => input.id === 'lineage.binId')).toMatchObject({ label: 'Bin' });
    expect(construction.inputs.find(input => input.id === 'fields.serial')).toMatchObject({ label: 'Serial' });
    expect(construction.inputs.find(input => input.id === 'fields.width')).toMatchObject({ label: 'Width' });
  });

  it('projects payload creation protocols as construct via modes', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    const occs = projected.construction.occs;
    // Default protocol: payload without an explicit creation list is
    // upload-backed — and protocols are the ONLY construct modes of a
    // payload type (the editor protocol is its blank-create).
    expect(occs.modes).toEqual(['upload']);
    expect(occs.defaultMode).toBe('upload');
    expect(occs.modeInputs.upload.find(input => input.id === 'payload')).toMatchObject({
      type: 'file',
      required: true,
      prompt: true
    });
    // The identifier row (`title`) names the record: upload carries only
    // the payload, never a second name prompt.
    expect(occs.modeInputs.upload.map(input => input.id)).toEqual(['payload']);
    // Payload-less types keep genericCreate.
    expect(projected.construction.panel.modes).toEqual(['genericCreate']);
    expect(projected.construction.panel.defaultMode).toBe('genericCreate');
    // Derived types synthesize no construction: operator outputs are
    // never constructible from a dialog.
    expect(projected.construction['derived-plan']).toBeUndefined();
    expect(projected.entities.some(entity => entity.type === 'derived-plan')).toBe(true);
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
