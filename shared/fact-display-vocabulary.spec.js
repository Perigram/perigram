// One fact vocabulary — the end-to-end contract over the bundle-resolved
// fact feed: declarations carry the naming vocabulary (name, glyph, field
// labels, identifier/depiction flags), the CTS client bundle derives the
// display policy (sections, no render facet anywhere), read-only surfaces
// resolve scalar fact rows through `utils/fact-rows.js`
// (`instanceFactRows` — the generated field vocabulary with the
// field-access gate and the value display policy), surface chrome derives
// from the type record through `resolveInstanceDisplayContract`, record
// titles and glyphs resolve through the one resolvers
// (`titleFor`/`iconFor`), and the legacy residual fact channel is gone.
import { describe, expect, it } from 'vitest';
import { createTypeRegistry, compileClientBundle, frameworkTypes, projectDomainFromView } from '#packages/cts';
import { facadeFileTypes } from '../test-tools/facade-plugin.js';
import techDrawingListing from '../workers/tech-drawing/listing.json';
const techDrawingTypes = techDrawingListing.declarations.types;
import {
  resolveInstanceDisplayContract
} from '../utils/instance-display-contract.js';
import { instanceFactRows } from '../utils/fact-rows.js';
import { registerDeclarationFieldAccess, filterEntityFields } from './instance-field-access.js';
import { decorateDataValue } from '../utils/data-display.js';
import { titleFor, iconFor, fieldLabel } from '../shared/ui-mapping/index.js';
import { applyFieldDisplayRole, compileTreeDeclarations } from '@perigram/processes/designer';

// The served org view: framework + mounted packs (documents omitted here —
// same composition as server/packs/declarations.js for the types under test).
function servedBundle() {
  const registry = createTypeRegistry({ id: 'fact-vocab' });
  for (const declaration of [...frameworkTypes, ...techDrawingTypes, ...facadeFileTypes]) {
    registry.defineType(declaration);
  }
  // An org-authored item type with the naming vocabulary on its
  // declaration: identifier flag, state display on the states facet.
  registry.defineType({
    id: 'widget', class: 'item', name: 'Widget',
    fields: {
      name: { base: 'string', identifier: true },
      parts: { base: 'list', itemType: { base: 'string' }, nullable: true },
      mass: { base: 'number', label: 'Mass kg' },
      code: { base: 'string', label: 'Code' },
      serial: { base: 'string', label: 'Serial', display: 'code' },
      width: { base: 'quantity', unit: 'mm', label: 'Width' },
      due: { base: 'instant', label: 'Due' }
    },
    states: {
      main: {
        initial: 'draft', values: ['draft', 'done'], terminal: ['done'],
        render: { done: { severity: 'success' } }
      }
    }
  });
  return { registry, bundle: compileClientBundle(registry, null) };
}

function typeRecordFor(bundle, typeId) {
  return bundle.types.find(type => type.id === typeId) || null;
}

describe('one fact vocabulary — bundle-resolved fact rows', () => {
  const { registry, bundle } = servedBundle();

  it('derives the served display policy (no render facet, sections by base)', () => {
    const cassette = typeRecordFor(bundle, 'cassette-template');
    expect('render' in cassette).toBe(false);
    // Authored name/glyph on the declaration (the facade types carry the
    // hand-drawn ck-entity-icons font classes as their glyphs).
    expect(cassette.name).toBe('Cassette template');
    expect(cassette.glyph).toBe('ck-entity-icon ck-entity-icon-cassette-template');
    // The declared identifier flag wins at the boundary.
    expect(cassette.identifier).toBe('name');
    expect(cassette.sections).toEqual([
      { id: 'summary', label: null, fields: ['name', 'polygonParts', 'layerData'] }
    ]);

    const sheetDesign = typeRecordFor(bundle, 'sheet-design');
    expect(sheetDesign.name).toBe('Sheet design');
    // json -> summary; list of refs -> relations (item-base assignment).
    expect(sheetDesign.sections).toEqual([
      { id: 'summary', label: null, fields: ['name', 'compositionKey', 'geometry'] }
    ]);

    const penTemplate = typeRecordFor(bundle, 'pen-template');
    // name -> summary; stroke record -> summary (no itemType to recurse).
    expect(penTemplate.sections).toEqual([
      { id: 'summary', label: null, fields: ['name', 'stroke'] }
    ]);
    expect(penTemplate.identifier).toBe('name');

    const widget = typeRecordFor(bundle, 'widget');
    expect(widget.identifier).toBe('name');
    expect(widget.depiction).toEqual({ glyph: widget.glyph, thumb: null });
    // State display is not type-derived (SPEC §7): the bundle carries no
    // state vocabulary — compiled process contracts own per-state display
    // from the draft's state records.
    expect(widget.states).toBeUndefined();
  });

  it('resolves surface chrome from the type record', () => {
    const compact = resolveInstanceDisplayContract({
      typeId: 'cassette-template', surface: 'compact',
      typeRecord: typeRecordFor(bundle, 'cassette-template')
    });
    expect(compact.surfaceContract.fieldLimit).toBe(3);
    expect(compact.surfaceContract.preview).toBe('attachment');
    const patched = resolveInstanceDisplayContract({
      typeId: 'widget', surface: 'card', typeRecord: typeRecordFor(bundle, 'widget'),
      surfaces: { card: { preview: 'canvas' } }
    });
    expect(patched.surfaceContract.preview).toBe('canvas');
  });

  it('exposes instanceFactRows as the one read-only fact-row derivation', () => {
    const widget = typeRecordFor(bundle, 'widget');
    const entity = { fields: { name: 'W', mass: 12, code: 'PC-9' } };
    // The identifier is the title; geometry blobs and prose stay with
    // their own surfaces — scalar rows carry the record's facts.
    const rows = instanceFactRows({ typeId: 'widget', typeRecord: widget, entity });
    expect(rows.map(row => [row.label, row.display])).toEqual([['Mass kg', '12'], ['Code', 'PC-9']]);
    expect(instanceFactRows({ typeId: 'widget', typeRecord: widget, entity, cap: 1 }).length).toBe(1);
    expect(instanceFactRows({ typeId: 'widget', typeRecord: widget, entity, skip: ['mass'] }).map(row => row.label)).toEqual(['Code']);
    // Empty values and absent type views resolve no rows.
    expect(instanceFactRows({ typeId: 'widget', typeRecord: widget, entity: { fields: {} } })).toEqual([]);
    expect(instanceFactRows({ typeId: 'widget', typeRecord: null, entity })).toEqual([]);
  });

  it('resolves each fact value typography role from the field/display contract', () => {
    const widget = typeRecordFor(bundle, 'widget');
    const entity = { fields: { name: 'W', mass: 12, code: 'PC-9', serial: 'SN-77', width: { value: 42, unit: 'mm' }, due: '2026-11-01T09:30:00.000Z' } };
    const rows = instanceFactRows({ typeId: 'widget', typeRecord: widget, entity });
    const roleByLabel = Object.fromEntries(rows.map(row => [row.label, row.role]));
    // Measured values wear the technical face; ordinary text the body face.
    expect(roleByLabel['Mass kg']).toBe('technical');
    expect(roleByLabel.Width).toBe('technical');
    expect(roleByLabel.Due).toBe('technical');
    expect(roleByLabel['Serial']).toBe('technical');
    expect(roleByLabel.Code).toBe('body');
    // Instants render locale dates: the runtime default without a
    // translator, the translator's locale when it carries one.
    const due = rows.find(row => row.label === 'Due');
    expect(due.display).toBe(new Date('2026-11-01T09:30:00.000Z').toLocaleDateString());
    expect(
      instanceFactRows({
        typeId: 'widget', typeRecord: widget, entity,
        translator: { t: (key, fallback) => fallback ?? key, te: () => false, locale: 'ru-RU' }
      }).find(row => row.label === 'Due').display
    ).toBe(new Date('2026-11-01T09:30:00.000Z').toLocaleDateString('ru-RU'));
  });

  it('resolves record titles through the one title resolver (identifier or unnamed)', () => {
    const widget = typeRecordFor(bundle, 'widget');
    expect(titleFor({ fields: { name: 'Bracket', parts: [] } }, widget)).toBe('Bracket');
    // Empty identifier value: the localized unnamed placeholder — never
    // the record id, never a slug, never another field's value.
    expect(titleFor({ id: 'w-77', fields: { name: '', parts: [] } }, widget, { unnamedLabel: 'Sin nombre' })).toBe('Sin nombre');
    expect(titleFor({ id: 'w-77', fields: {} }, widget)).toBe('Unnamed');
    // Every declared type carries an identifier (compile law): the note
    // field names an entity-revision record. Only the null VALUE renders
    // the placeholder — and no type view at all is unnamed regardless.
    expect(titleFor({ id: 'w-77', fields: { note: 'Kepler' } }, typeRecordFor(bundle, 'entity-revision'))).toBe('Kepler');
    expect(titleFor({ id: 'w-77', fields: { note: 'Kepler' } }, null)).toBe('Unnamed');
  });

  it('resolves glyphs through the one glyph resolver (record thumbs preferred)', () => {
    const widget = typeRecordFor(bundle, 'widget');
    expect(iconFor(widget)).toBe(widget.glyph);
    // A record with a declared depiction.thumb value wins over the glyph.
    const withThumb = { ...widget, depiction: { glyph: widget.glyph, thumb: 'snap' } };
    expect(iconFor(withThumb, { fields: { snap: 'thumb://w-77' } })).toBe('thumb://w-77');
    expect(iconFor(withThumb, { fields: { snap: '' } })).toBe(widget.glyph);
    expect(iconFor(null)).toBe('pi pi-circle');
  });

  it('renders dimensions and units through the display policies', () => {
    expect(decorateDataValue({ width: 2500, length: 1250 }, { display: 'dimensions', unit: 'mm' })).toBe('2500 × 1250 mm');
    expect(decorateDataValue(3.125, { display: 'area', unit: 'm2' })).toBe('3.125 m²');
    expect(decorateDataValue(94.2, { display: 'percent', unit: 'percent' })).toBe('94.2%');
  });


  it('resolves no legacy fallback for an undeclared type', () => {
    const undeclared = resolveInstanceDisplayContract({ typeId: 'queue', surface: 'card' });
    expect(undeclared.surfaceContract.preview).toBe('none');
    expect(instanceFactRows({ typeId: 'queue', typeRecord: null, entity: {} })).toEqual([]);
  });

  it('gates derived fact rows through field access', () => {
    // The legacy facade access policy still owns this type's read paths
    // (feature 'facades'): the path is denied under a read grant.
    expect(filterEntityFields({
      fields: [{ path: 'fields.name' }],
      permissions: { facades: 'read' },
      typeId: 'facade-design'
    })).toEqual([]);

    // An org-authored type (no legacy policy anywhere) derives its fact
    // rows; declaration-derived access gates them by the class
    // collection grant, exactly like the server's instance reads.
    const projected = projectDomainFromView(registry, null, {});
    const classByType = new Map(bundle.types.map(type => [type.id, type.class]));
    const entries = {};
    for (const [typeId, policy] of Object.entries(projected.fieldAccess || {})) {
      const typeClass = classByType.get(typeId);
      if (!typeClass) continue;
      entries[typeId] = {
        feature: ({ file: 'files', item: 'items', group: 'groups', process: 'processes' })[typeClass] || typeId,
        read: policy.read || [], write: policy.write || [], admin: policy.admin || []
      };
    }
    registerDeclarationFieldAccess(entries);
    const widgetRecord = typeRecordFor(bundle, 'widget');
    const entity = { fields: { name: 'W', mass: 12 } };
    const allowed = instanceFactRows({
      typeId: 'widget', typeRecord: widgetRecord, entity,
      auth: { permissions: { items: 'read' } }
    });
    const denied = instanceFactRows({
      typeId: 'widget', typeRecord: widgetRecord, entity,
      auth: { permissions: {} }
    });
    expect(allowed.map(row => row.display)).toEqual(['12']);
    expect(denied).toEqual([]);
    registerDeclarationFieldAccess({});
  });

  it('designer-authored display tokens reach the preview bundle and drive the one resolvers', () => {
    // The process designer's live path: tree nodes compile through
    // compileTreeDeclarations, overlay the registry (same seam the
    // Screens tab's compiled preview reads), and the authored tokens —
    // not defaults — drive titleFor/fieldLabel/iconFor.
    const classNode = {
      id: 'c', type: 'ctsClass',
      data: { typeId: 'bracket', class: 'file', name: 'Bracket', glyph: 'pi pi-star' }
    };
    const fieldNodes = [
      { id: 'f1', type: 'ctsField', data: { typeId: 'bracket', name: 'Title', descriptor: { base: 'string', identifier: true } } },
      { id: 'f2', type: 'ctsField', data: { typeId: 'bracket', name: 'Part code', descriptor: { base: 'string', label: 'Code', display: 'code' } } },
      { id: 'f3', type: 'ctsField', data: { typeId: 'bracket', name: 'Photo', descriptor: { base: 'string', depiction: true } } }
    ];
    const declares = (source) => ({ id: `d:${source.id}`, source: source.id, target: 'c', role: 'type', label: 'field' });
    const { declarations } = compileTreeDeclarations([classNode, ...fieldNodes], fieldNodes.map(declares));

    const registry = createTypeRegistry({ id: 'designer-preview' });
    registry.defineType({ ...declarations[0], scope: 'org', organizationId: 'org-1' });
    const preview = compileClientBundle(registry, 'org-1');
    const bracket = preview.types.find(type => type.id === 'bracket');

    // Authored tokens land in the served bundle shape.
    expect(bracket.name).toBe('Bracket');
    expect(bracket.glyph).toBe('pi pi-star');
    expect(bracket.fields.partCode).toMatchObject({ label: 'Code', display: 'code' });
    // The identifier toggle decides which field titles rows; the label
    // decides the shown header — the same resolvers the preview screens
    // render through.
    expect(titleFor({ fields: { title: 'B-1', partCode: 'PC-9' } }, bracket)).toBe('B-1');
    expect(fieldLabel('partCode', bracket.fields.partCode)).toBe('Code');
    expect(fieldLabel('title', bracket.fields.title)).toBe('Title');
    expect(iconFor(bracket)).toBe('pi pi-star');
    expect(iconFor(bracket, { fields: { photo: 'thumb://b-1' } })).toBe('thumb://b-1');

    // Moving the flag moves the title source: the page's toggle gesture
    // is applyFieldDisplayRole — enabling it on one field clears the
    // previous holder, so the compile law (exactly one) still holds and
    // the boundary mint never fires while one is authored.
    const toggled = [classNode, ...fieldNodes.map(node => structuredClone(node))];
    applyFieldDisplayRole(toggled, 'f2', 'identifier', true);
    const retried = compileTreeDeclarations(toggled, toggled.slice(1).map(declares));
    const nextRegistry = createTypeRegistry({ id: 'designer-preview-2' });
    nextRegistry.defineType({ ...retried.declarations[0], scope: 'org', organizationId: 'org-1' });
    const nextBracket = compileClientBundle(nextRegistry, 'org-1').types.find(type => type.id === 'bracket');
    expect(nextRegistry.compile('org-1').ok).toBe(true);
    expect(titleFor({ fields: { title: 'B-1', partCode: 'PC-9' } }, nextBracket)).toBe('PC-9');
  });
});
