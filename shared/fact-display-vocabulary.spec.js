// One fact vocabulary — the end-to-end contract over the bundle-resolved
// fact feed: declarations carry the naming vocabulary (name, glyph, field
// labels, identifier/depiction flags, per-state display on the states
// facet), the CTS client bundle derives the display policy (sections,
// resolved state display — no render facet anywhere),
// `utils/instance-display-contract.js` resolves fact rows by surface
// (legacy map and app extensions composing for undeclared types), display
// policies render units/dimensions, identity chrome resolves through the
// compiled policy, and fact rows gate through field access (legacy-first,
// declaration-derived for org-authored types).
import { describe, expect, it } from 'vitest';
import { createTypeRegistry, compileClientBundle, frameworkTypes, projectDomainFromView } from '../packages/cts/src/index.js';
import { cncFileTypes } from '../packages/domain-cnc/src/index.js';
import { techDrawingTypes } from '../packages/tech-drawing/src/index.js';
import {
  resolveInstanceDisplayContract,
  resolveInstanceDisplayFields,
  instanceIdentityLabel,
  instanceIdentityMeta
} from '../utils/instance-display-contract.js';
import { registerDeclarationFieldAccess, filterEntityFields } from './instance-field-access.js';
import { decorateDataValue } from '../utils/data-display.js';
import { instanceIdentity } from '../shared/ui-mapping/index.js';

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

  it('resolves record labels through the identifier flag', () => {
    const widget = typeRecordFor(bundle, 'widget');
    expect(instanceIdentity(widget, { fields: { name: 'Bracket', parts: [] } })).toBe('Bracket');
    // No identifier flag and no short-string value: the type name, never
    // the raw id.
    expect(instanceIdentity(widget, { fields: { name: '', parts: [] } })).toBe('Widget');
  });

  it('keeps legacy fallback + extension composition for undeclared types', () => {
    const legacy = resolveInstanceDisplayContract({ typeId: 'queue', surface: 'card' });
    expect(legacy.bundleResolved).toBe(false);
    expect(legacy.fields.map(field => field.path)).toContain('summary.totalArea');

    const extensions = {
      fieldGroups: { queue: { summary: [{ path: 'data.queueNumber', label: 'queue.name', display: 'text', priority: 1 }] } }
    };
    const overridden = resolveInstanceDisplayContract({ typeId: 'queue', surface: 'card', extensions });
    expect(overridden.fields[0]).toMatchObject({ path: 'data.queueNumber' });
  });

  it('renders dimensions and units through the display policies', () => {
    expect(decorateDataValue({ width: 2500, length: 1250 }, { display: 'dimensions', unit: 'mm' })).toBe('2500 × 1250 mm');
    expect(decorateDataValue(3.125, { display: 'area', unit: 'm2' })).toBe('3.125 m²');
    expect(decorateDataValue(94.2, { display: 'percent', unit: 'percent' })).toBe('94.2%');
  });

  it('resolves identity chrome through the compiled policy', () => {
    expect(instanceIdentityLabel({ identity: { name: 'Bracket' } })).toBe('Bracket');
    expect(instanceIdentityLabel({ identity: { slug: 'bracket-4' } })).toBe('bracket-4');
    expect(instanceIdentityLabel({ identity: {} }, { typeLabel: 'Cassette', unnamedLabel: 'Unnamed' })).toBe('Cassette');
    expect(instanceIdentityLabel({}, { unnamedLabel: 'Unnamed' })).toBe('Unnamed');
    expect(instanceIdentityMeta({ identity: { name: 'X', serial: 'S-1' } }, ['slug', 'serial']))
      .toEqual([{ key: 'serial', value: 'S-1' }]);
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
