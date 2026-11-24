import { describe, expect, it } from 'vitest';
import { createTypeRegistry, projectDomainFromView, CLASS_COLLECTIONS } from './index.js';
import { cncTypePack } from './pack/cnc.js';
import { frameworkTypes } from './pack/framework.js';

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
    serial: { base: 'string', identifier: true },
    width: { base: 'quantity', unit: 'mm' }
  },
  edges: {
    children: {
      placed: { types: ['placed-sheet'] }
    },
    relations: {
      'placed-on': {
        types: ['sheet'],
        onRemove: 'detach',
        // Target domain (SPEC §6): only wide sheets are placement
        // candidates — the same expression the write boundary enforces.
        where: { op: 'gte', args: [{ op: 'field', path: ['value', 'width'] }, { op: 'lit', value: 500 }] }
      }
    }
  }
};

const orgBin = {
  id: 'bin',
  name: 'Bin',
  class: 'group',
  scope: 'org',
  organizationId: 'org-1',
  version: 1,
  fields: { name: { base: 'string', identifier: true } },
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
  fields: { note: { base: 'string', nullable: true, identifier: true } }
};

function orgRegistry() {
  const reg = registry();
  for (const declaration of [orgPanel, orgBin, orgDoc, orgDerivedPlan, orgPlaced]) reg.defineType(declaration);
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
  fields: { name: { base: 'string', nullable: true, identifier: true }, geometry: { base: 'json', nullable: true } }
};

// The placement-operator shape (SPEC §8 construct species): single and
// list reference inputs over one accepted type.
const orgPlaced = {
  id: 'placed-sheet',
  name: 'Placed sheet',
  class: 'file',
  scope: 'org',
  organizationId: 'org-1',
  version: 1,
  fields: { name: { base: 'string', identifier: true } },
  operators: {
    fill: {
      id: 'fill',
      species: 'construct',
      input: {
        base: 'record',
        fields: {
          name: { base: 'string', nullable: true },
          template: { base: 'ref', label: 'Template', accepts: ['placed-sheet'] },
          parts: { base: 'list', itemType: { base: 'ref', accepts: ['placed-sheet'] } }
        }
      }
    }
  }
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
  it('synthesizes entities with per-class collections for every authorable type', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1', legacyBase);
    const byType = new Map(projected.entities.map(entity => [entity.type, entity]));
    expect(byType.get('panel')).toMatchObject({ type: 'panel', collection: CLASS_COLLECTIONS.item, meta: false });
    expect(byType.get('bin')).toMatchObject({ collection: CLASS_COLLECTIONS.group });
    expect(byType.get('spec-sheet')).toMatchObject({ collection: CLASS_COLLECTIONS.file });
    expect(byType.get('occs')).toMatchObject({ collection: CLASS_COLLECTIONS.file });
    expect(byType.get('sheet')).toMatchObject({ collection: CLASS_COLLECTIONS.item });
    expect(byType.get('oldqueue')).toBeUndefined();
  });

  it('projects party types as readable principals — read-only, meta, no construction', () => {    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    const byType = new Map(projected.entities.map(entity => [entity.type, entity]));
    expect(byType.get('user')).toMatchObject({ party: true, meta: true, collection: null, blocks: ['fields'] });
    expect(byType.get('organization')).toMatchObject({ party: true, meta: true, collection: null });
    const paths = projected.fieldSchemas.user.map(schema => schema.path);
    expect(paths).toEqual(['_id', 'type', 'typeVersion', 'name', 'fields.email', 'fields.name', 'fields.roles', 'fields.bot', 'fields.avatarUrl']);
    for (const schema of projected.fieldSchemas.user) {
      expect(schema.writable).toBe(false);
      expect(schema.constructible).toBe(false);
    }
    expect(projected.fieldAccess.user).toMatchObject({ read: paths, write: [], admin: [] });
    expect(projected.construction.user).toBeUndefined();
    expect(projected.construction.organization).toBeUndefined();
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

  it('construction inputs are authored rows only — a non-constructible identifier row authors nothing', () => {
    const reg = registry();
    reg.defineType({
      id: 'blank',
      name: 'Blank',
      class: 'item',
      scope: 'org',
      organizationId: 'org-1',
      version: 1,
      fields: {
        name: { base: 'string', nullable: true, identifier: true, writable: false, constructible: false },
        geometry: { base: 'json', nullable: true }
      }
    });
    const projected = projectDomainFromView(reg, 'org-1');
    const construction = projected.construction.blank;
    // The identifier row is identity vocabulary: it renders the record
    // title and constructs and mutates nothing.
    expect(construction.inputs.map(input => input.id)).toEqual(['fields.geometry']);
    expect(projected.fieldSchemas.blank.find(schema => schema.path === 'fields.name'))
      .toMatchObject({ constructible: false, writable: false });
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

  it('construction addresses immediate lineage axes; the schema pass keeps the ancestor chain', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    // placed-sheet sits two levels under bin (bin → panel →
    // placed-sheet): its construct contract addresses the immediate
    // parent axis alone — ancestor axes derive at the construct seam.
    expect(projected.construction['placed-sheet'].inputs.map(input => input.id))
      .toEqual(expect.arrayContaining(['lineage.panelId']));
    expect(projected.construction['placed-sheet'].inputs.some(input => input.id === 'lineage.binId')).toBe(false);
    // The read model keeps the whole chain: ancestor axes stay
    // addressable for filters and access facts.
    expect(projected.fieldSchemas['placed-sheet'].some(schema => schema.path === 'lineage.panelId')).toBe(true);
    expect(projected.fieldSchemas['placed-sheet'].some(schema => schema.path === 'lineage.binId')).toBe(true);
  });

  it('synthesizes generic construction plus declared construct operators', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    const construction = projected.construction.panel;
    expect(construction.modes).toEqual(['genericCreate']);
    expect(construction.defaultMode).toBe('genericCreate');
    // lineage keys and declared relation edges are construct-addressable
    // (SPEC §6): the panel's parent bin arrives as lineage.binId, its
    // declared relation as relations.placed-on. No separate Name prompt:
    // the identifier row already names the record.
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

  it('projects construct operator reference inputs as typed prompt rows', () => {
    const projected = projectDomainFromView(orgRegistry(), 'org-1');
    const placed = projected.construction['placed-sheet'];
    expect(placed.modes).toEqual(['fill']);
    const byId = new Map(placed.modeInputs.fill.map(input => [input.id, input]));
    expect(byId.get('template')).toMatchObject({ type: 'entity', typeId: 'placed-sheet', label: 'Template' });
    expect(byId.get('parts')).toMatchObject({ label: 'parts' });
    expect(byId.get('parts')).toMatchObject({ type: 'typeList', typeId: 'placed-sheet' });
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
    // Protocol modes prompt their protocol input alone — the record name
    // derives from the uploaded file's name at the construct seam.
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
    const placedOn = projected.relations.find(relation => relation.ownerType === 'panel' && relation.key === 'placed-on');
    expect(placedOn).toMatchObject({ targetType: 'sheet', cardinality: 'many' });
    expect(placedOn.where).toEqual({ op: 'gte', args: [{ op: 'field', path: ['value', 'width'] }, { op: 'lit', value: 500 }] });
  });

  it('projects ref and list-of-ref fields into the relation slot with their cardinality', () => {
    const registryWithRefs = orgRegistry();
    registryWithRefs.defineType({
      id: 'ref-holder',
      name: 'Ref holder',
      class: 'item',
      scope: 'org',
      organizationId: 'org-1',
      version: 1,
      fields: {
        name: { base: 'string', identifier: true },
        owner: { base: 'ref', accepts: ['panel'] },
        parts: { base: 'list', itemType: { base: 'ref', accepts: ['panel'] } }
      }
    });
    const projected = projectDomainFromView(registryWithRefs, 'org-1');
    const owner = projected.relations.find(relation => relation.ownerType === 'ref-holder' && relation.key === 'owner');
    const parts = projected.relations.find(relation => relation.ownerType === 'ref-holder' && relation.key === 'parts');
    expect(owner).toMatchObject({ targetType: 'panel', cardinality: 'one' });
    expect(parts).toMatchObject({ targetType: 'panel', cardinality: 'many' });
    expect(projected.fieldSchemas['ref-holder'].map(schema => schema.path)).not.toContain('fields.owner');
    expect(projected.fieldSchemas['ref-holder'].map(schema => schema.path)).not.toContain('fields.parts');
    const inputs = projected.construction['ref-holder'].inputs;
    expect(inputs.find(input => input.id === 'relations.owner')).toMatchObject({ type: 'entity', typeId: 'panel' });
    expect(inputs.find(input => input.id === 'relations.parts')).toMatchObject({ type: 'typeList', typeId: 'panel' });
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
