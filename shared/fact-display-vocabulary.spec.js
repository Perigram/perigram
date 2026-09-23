// One fact vocabulary — the end-to-end contract over the bundle-resolved
// fact feed: declarations carry the naming vocabulary (name, glyph, field
// labels, identifier/depiction flags, per-state display on the states
// facet), the CTS client bundle derives the display policy (sections,
// resolved state display — no render facet anywhere),
// `utils/instance-display-contract.js` resolves fact rows by surface
// through `factsFor` (bundle-only; app extensions composing on top,
// per-call overrides winning), display policies render units/dimensions,
// record titles and glyphs resolve through the one resolvers
// (`titleFor`/`iconFor`), fact rows gate through field access
// (legacy-first, declaration-derived for org-authored types), and the
// legacy residual fact channel is gone (artifact family excepted).
import { describe, expect, it } from 'vitest';
import { createTypeRegistry, compileClientBundle, frameworkTypes, projectDomainFromView } from '../packages/cts/src/index.js';
import { cncFileTypes, cncInstanceFieldGroups } from '../packages/domain-cnc/src/index.js';
import { techDrawingTypes } from '../packages/tech-drawing/src/index.js';
import {
  resolveInstanceDisplayContract,
  resolveInstanceDisplayFields,
  factsFor
} from '../utils/instance-display-contract.js';
import { registerDeclarationFieldAccess, filterEntityFields } from './instance-field-access.js';
import { decorateDataValue } from '../utils/data-display.js';
import { titleFor, iconFor } from '../shared/ui-mapping/index.js';

// The served org view: framework + mounted packs (documents omitted here —
// same composition as server/packs/declarations.js for the types under test).
function servedBundle() {
  const registry = createTypeRegistry({ id: 'fact-vocab' });
  for (const declaration of [...frameworkTypes, ...techDrawingTypes, ...cncFileTypes]) {
    registry.defineType(declaration);
  }
  // An org-authored item type with the naming vocabulary on its
  // declaration: identifier flag, state display on the states facet.
  registry.defineType({
    id: 'widget', class: 'item', name: 'Widget',
    fields: {
      name: { base: 'string', identifier: true },
      parts: { base: 'list', itemType: { base: 'string' }, nullable: true }
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
    const cassette = typeRecordFor(bundle, 'cassette');
    expect('render' in cassette).toBe(false);
    // Legacy render.label/icon adopt to name/glyph at the boundary.
    expect(cassette.name).toBe('Cassette');
    expect(cassette.glyph).toBe('pi pi-box');
    expect(cassette.identifier).toBeNull();
    expect(cassette.sections).toEqual([{ id: 'summary', label: null, fields: ['name'] }]);

    const sheetDesign = typeRecordFor(bundle, 'sheet-design');
    expect(sheetDesign.name).toBe('Sheet design');
    // json -> summary; list of refs -> relations (item-base assignment).
    expect(sheetDesign.sections).toEqual([
      { id: 'summary', label: null, fields: ['geometry'] },
      { id: 'relations', label: null, fields: ['parts'] }
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
    // Per-state display resolves on the axis: authored severity, terminal
    // default, startCase label default (state values are authored
    // vocabulary).
    expect(widget.states.main.render).toEqual({
      draft: { label: 'Draft', icon: null, severity: 'info' },
      done: { label: 'Done', icon: null, severity: 'success' }
    });
  });

  it('resolves card/detail fact rows from the derived sections keyed by surface', () => {
    const card = resolveInstanceDisplayContract({
      typeId: 'sheet-design', surface: 'card',
      typeRecord: typeRecordFor(bundle, 'sheet-design')
    });
    expect(card.bundleResolved).toBe(true);
    expect(card.fields.map(field => field.path)).toEqual(['data.geometry', 'data.parts']);
    const detail = resolveInstanceDisplayContract({
      typeId: 'sheet-design', surface: 'detail',
      typeRecord: typeRecordFor(bundle, 'sheet-design')
    });
    expect([...new Set(detail.fields.map(field => field.group))]).toEqual(['summary', 'relations']);
    const compact = resolveInstanceDisplayContract({
      typeId: 'cassette', surface: 'compact',
      typeRecord: typeRecordFor(bundle, 'cassette')
    });
    expect(compact.surfaceContract.fieldLimit).toBe(3);
  });

  it('exposes factsFor as the one bundle-only fact-row resolver', () => {
    const sheetDesign = typeRecordFor(bundle, 'sheet-design');
    expect(factsFor(sheetDesign, 'card').map(field => field.path)).toEqual(['data.geometry', 'data.parts']);
    expect(factsFor(sheetDesign, 'detail').map(field => field.path)).toEqual(['data.geometry', 'data.parts']);
    // Compact surfaces bound to the leading summary facts only.
    expect(factsFor(sheetDesign, 'compact').map(field => field.path)).toEqual(['data.geometry']);
    // No type view, no rows: undeclared types resolve nothing.
    expect(factsFor(null, 'card')).toEqual([]);
  });

  it('composes app extensions and per-call overrides over the bundle rows', () => {
    const widget = typeRecordFor(bundle, 'widget');
    const extensions = {
      fieldGroups: { widget: { extra: [{ path: 'data.extra', label: 'widget.extra', display: 'text', priority: 1 }] } },
      surfaces: { widget: { surfaces: { card: { fieldGroups: ['extra'] } } } }
    };
    const extended = resolveInstanceDisplayContract({ typeId: 'widget', surface: 'card', typeRecord: widget, extensions });
    expect(extended.fields.map(field => field.path)).toEqual(['data.extra']);
    // Per-call overrides win over everything, including extensions.
    const overridden = resolveInstanceDisplayContract({
      typeId: 'widget', surface: 'card', typeRecord: widget, extensions,
      fieldGroups: { picked: [{ path: 'data.picked', label: 'widget.picked', display: 'text', priority: 1 }] },
      surfaces: { card: { fieldGroups: ['picked'] } }
    });
    expect(overridden.fields.map(field => field.path)).toEqual(['data.picked']);
    // With no authored list, synthesis runs over the merged map.
    const plain = resolveInstanceDisplayContract({ typeId: 'widget', surface: 'card', typeRecord: widget });
    expect(plain.fields.map(field => field.path)).toEqual(['data.name', 'data.parts']);
  });

  it('resolves record titles through the one title resolver (identifier or unnamed)', () => {
    const widget = typeRecordFor(bundle, 'widget');
    expect(titleFor({ fields: { name: 'Bracket', parts: [] } }, widget)).toBe('Bracket');
    // Empty identifier value: the localized unnamed placeholder — never
    // the record id, never a slug, never another field's value.
    expect(titleFor({ id: 'w-77', fields: { name: '', parts: [] } }, widget, { unnamedLabel: 'Sin nombre' })).toBe('Sin nombre');
    expect(titleFor({ id: 'w-77', fields: {} }, widget)).toBe('Unnamed');
    // No identifier flag, no type view: unnamed, even with filled strings.
    expect(titleFor({ id: 'w-77', fields: { note: 'Kepler' } }, typeRecordFor(bundle, 'entity-revision'))).toBe('Unnamed');
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

  it('keeps only the artifact family in the legacy residual map', () => {
    // Live-type audit: everything else that once lived in
    // `cncInstanceFieldGroups` rendered entity types retired from
    // `cncEntities` (project, queue, sheet, remnant, catalog, …) or
    // master data whose legacy surfaces are gone. The artifact family
    // stays until Phase 7's file-paper cut.
    expect(Object.keys(cncInstanceFieldGroups)).toEqual(['artifactTemplate']);
    // An undeclared type resolves no fact rows and no legacy fallback.
    const undeclared = resolveInstanceDisplayContract({ typeId: 'queue', surface: 'card' });
    expect(undeclared.bundleResolved).toBe(false);
    expect(undeclared.fields).toEqual([]);
  });

  it('filters bundle-derived rows through field access', () => {
    // The legacy facade access policy still owns this type's read paths
    // (feature 'facades'): its read list covered the authored group paths
    // that died with the render facet, so the derived `data.name` row is
    // denied — legacy policy gates derived fact rows exactly as it gated
    // authored ones. Declaration access covers types with no legacy
    // entry (below).
    const visible = filterEntityFields({
      fields: resolveInstanceDisplayFields({
        typeId: 'facade-design', surface: 'card',
        typeRecord: typeRecordFor(bundle, 'facade-design')
      }),
      permissions: { facades: 'read' },
      typeId: 'facade-design'
    });
    expect(visible).toEqual([]);

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
    const allowed = filterEntityFields({
      fields: resolveInstanceDisplayFields({ typeId: 'widget', surface: 'card', typeRecord: widgetRecord }),
      permissions: { items: 'read' },
      typeId: 'widget'
    });
    const denied = filterEntityFields({
      fields: resolveInstanceDisplayFields({ typeId: 'widget', surface: 'card', typeRecord: widgetRecord }),
      permissions: {},
      typeId: 'widget'
    });
    expect(allowed.map(field => field.path)).toEqual(['data.name', 'data.parts']);
    expect(denied).toEqual([]);
    registerDeclarationFieldAccess({});
  });
});
