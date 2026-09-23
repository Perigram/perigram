// One fact vocabulary (Phase 6) — the end-to-end contract over the
// bundle-resolved fact feed: declarations author `render.groups`, the CTS
// client bundle compiles them, `utils/instance-display-contract.js` resolves
// descriptors by surface (legacy map and app extensions composing for
// undeclared types), display policies render units/dimensions, identity
// chrome resolves through the compiled policy, and fact rows gate through
// field access (legacy-first, declaration-derived for org-authored types).
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

// The served org view: framework + mounted packs (documents omitted here —
// same composition as server/packs/declarations.js for the types under test).
function servedBundle() {
  const registry = createTypeRegistry({ id: 'phase6-smoke' });
  for (const declaration of [...frameworkTypes, ...techDrawingTypes, ...cncFileTypes]) {
    registry.defineType(declaration);
  }
  // An org-authored item type declaring its fact groups.
  registry.defineType({
    id: 'widget', class: 'item',
    fields: { name: { base: 'string' }, parts: { base: 'list', itemType: { base: 'string' }, nullable: true } },
    render: { label: 'Widget', groups: [
      { id: 'summary', fields: [
        { path: 'summary.builtCount', label: 'widget.built', display: 'count', priority: 10 },
        { path: 'data.parts.length', label: 'widget.parts', display: 'count', priority: 20 }
      ] }
    ] }
  });
  return { registry, bundle: compileClientBundle(registry, null) };
}

function typeRecordFor(bundle, typeId) {
  return bundle.types.find(type => type.id === typeId) || null;
}

describe('one fact vocabulary — bundle-resolved fact rows', () => {
  const { registry, bundle } = servedBundle();

  it('compiles declared fact groups into the served render facet', () => {
    const cassette = typeRecordFor(bundle, 'cassette').render;
    expect(cassette.groups.map(group => group.id)).toEqual(['geometry', 'provenance']);
    const sheetDesign = typeRecordFor(bundle, 'sheet-design').render;
    const specs = sheetDesign.groups.find(group => group.id === 'specs');
    expect(specs.fields.find(field => field.path === 'specs')).toMatchObject({ display: 'dimensions', unit: 'mm' });
    expect(specs.fields.find(field => field.path === 'specs.area')).toMatchObject({ unit: 'm2' });
  });

  it('resolves card/detail fact rows from the bundle keyed by surface', () => {
    const card = resolveInstanceDisplayContract({
      typeId: 'sheet-design', surface: 'card',
      typeRecord: typeRecordFor(bundle, 'sheet-design')
    });
    expect(card.bundleResolved).toBe(true);
    expect(card.fields.map(field => field.path)).toEqual([
      'specs', 'specs.area', 'specs.sheetThickness', 'specs.foilThickness',
      'summary.efficiency', 'data.geometry.preview', 'summary.placedCount',
      'specs.cuttingLength', 'specs.estimatedTime'
    ]);
    const detail = resolveInstanceDisplayContract({
      typeId: 'sheet-design', surface: 'detail',
      typeRecord: typeRecordFor(bundle, 'sheet-design')
    });
    expect([...new Set(detail.fields.map(field => field.group))]).toEqual(['specs', 'geometry']);
    const compact = resolveInstanceDisplayContract({
      typeId: 'cassette', surface: 'compact',
      typeRecord: typeRecordFor(bundle, 'cassette')
    });
    expect(compact.surfaceContract.fieldLimit).toBe(3);
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

  it('filters bundle-declared rows through field access', () => {
    // The legacy facade access policy still owns this type's read paths
    // (feature 'facades'); declaration access covers types with no legacy
    // entry. Both orders verified.
    const visible = filterEntityFields({
      fields: resolveInstanceDisplayFields({
        typeId: 'facade-design', surface: 'card',
        typeRecord: typeRecordFor(bundle, 'facade-design')
      }),
      permissions: { facades: 'read' },
      typeId: 'facade-design'
    });
    expect(visible.map(field => field.path)).toEqual([
      'data.parts.length', 'data.partAssignments.length', 'relations.sourceModel', 'relations.patterns'
    ]);

    // An org-authored type (no legacy policy anywhere) declares its fact
    // groups; declaration-derived access gates them by the class
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
    expect(allowed.map(field => field.path)).toEqual(['summary.builtCount', 'data.parts.length']);
    expect(denied).toEqual([]);
    registerDeclarationFieldAccess({});
  });
});
