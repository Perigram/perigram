import { describe, it, expect } from 'vitest';
import {
  createUiMapping,
  formatValue,
  LAYOUT,
  instanceIdentity,
  resolveFieldGroups,
  estimateRegionWeight,
  childrenModeFor,
  screenDensityFor,
  resolveFieldControl,
  resolveSurface,
  resolvePreview,
  resolveActionButton,
  resolveListLayout,
  tableColumnCount,
  cardFactCount,
  cardVariantFor,
  resolveChrome,
  applyBudget,
  SEVERITY_MAP,
  ROW_FIELD_BUDGET,
  VARIANTS
} from './index.js';

describe('field control resolution', () => {
  it('is total across every field base and variant', () => {
    const bases = ['string', 'number', 'boolean', 'instant', 'json', 'blob', 'ref', 'quantity', 'record', 'list', 'map', 'variant', 'enum'];
    for (const base of bases) {
      const descriptor = { base };
      if (base === 'ref') descriptor.accepts = ['part'];
      if (base === 'quantity') descriptor.unit = 'mm';
      if (base === 'list' || base === 'map') descriptor.itemType = { base: 'string' };
      if (base === 'variant') descriptor.tags = ['a'];
      if (base === 'enum') descriptor.values = ['ONE', 'TWO'];
      for (const variant of VARIANTS) {
        const outcome = resolveFieldControl(descriptor, { variant });
        expect(outcome.component, `${base}/${variant}`).toBeTruthy();
        expect(['full', 'half']).toContain(outcome.span);
      }
    }
  });

  it('maps editor variants to input controls with derived props', () => {
    expect(resolveFieldControl({ base: 'quantity', unit: 'mm' }, { variant: 'detail' })).toMatchObject({
      component: 'QuantityInput', span: 'half', props: { suffix: ' mm' }
    });
    expect(resolveFieldControl({ base: 'ref', accepts: ['part'] }).props.accepts).toEqual(['part']);
    expect(resolveFieldControl({ base: 'enum', values: ['ONE'] }).props.options).toEqual(['ONE']);
  });

  it('refines by derived qualifiers', () => {
    const short = resolveFieldControl({ base: 'string', max: 40 }, { variant: 'full' });
    const long = resolveFieldControl({ base: 'string', max: 200 }, { variant: 'full' });
    expect(short.component).toBe('InputText');
    expect(long.component).toBe('Textarea');

    const few = resolveFieldControl({ base: 'enum', values: ['A', 'B'] }, { variant: 'full' });
    const many = resolveFieldControl({ base: 'enum', values: Array.from({ length: 9 }, (_, i) => `V${i}`) }, { variant: 'full' });
    expect(few.component).toBe('SelectButton');
    expect(many.component).toBe('Select');
    expect(many.props.filter).toBe(true);
  });

  it('refines list editors by the item base', () => {
    const strings = resolveFieldControl({ base: 'list', itemType: { base: 'string' } }, { variant: 'full' });
    const refs = resolveFieldControl({ base: 'list', itemType: { base: 'ref', accepts: ['part'] } }, { variant: 'full' });
    const records = resolveFieldControl({ base: 'list', itemType: { base: 'record', fields: {} } }, { variant: 'full' });
    expect(strings.component).toBe('ChipsInput');
    expect(refs.component).toBe('InstanceMultiPicker');
    expect(records.component).toBe('ListEditor');
  });

  it('maps display variants to read-only presentations with density', () => {
    expect(resolveFieldControl({ base: 'enum', values: ['A'] }, { variant: 'row' })).toMatchObject({
      component: 'Tag', props: { density: 'row' }
    });
    expect(resolveFieldControl({ base: 'ref', accepts: ['part'] }, { variant: 'inline' })).toMatchObject({
      component: 'InstanceChip', props: { density: 'inline' }
    });
  });

  it('refines display presentations by data shape', () => {
    expect(resolveFieldControl({ base: 'quantity', unit: 'percent' }, { variant: 'row' })).toMatchObject({
      component: 'Knob'
    });
    expect(resolveFieldControl({ base: 'quantity', unit: 'mm' }, { variant: 'row' })).toMatchObject({
      component: 'QuantityText'
    });
    expect(resolveFieldControl({ base: 'list', itemType: { base: 'string' } }, { variant: 'row' })).toMatchObject({
      component: 'ChipsDisplay', span: 'full'
    });
    expect(resolveFieldControl({ base: 'list', itemType: { base: 'ref', accepts: ['x'] } }, { variant: 'row' })).toMatchObject({
      component: 'ListSummary'
    });
  });

  it('resolves list layouts from type shape, size, and overrides', () => {
    const prose = { class: 'file', fields: { body: { base: 'string', max: 400 } } };
    const numeric = { class: 'item', states: { main: { values: ['a'] } }, fields: {
      load: { base: 'quantity', unit: 'percent' },
      speed: { base: 'quantity', unit: 'count' },
      label: { base: 'string' }
    } };
    const media = { class: 'file', payload: { preview: 'image' }, fields: { title: { base: 'string' } } };
    const plain = { class: 'item', states: { main: { values: ['a'] } }, fields: {
      name: { base: 'string' }, size: { base: 'number' }, mass: { base: 'quantity', unit: 'count' }, note: { base: 'string' }
    } };
    expect(resolveListLayout(prose)).toBe('timeline');
    expect(resolveListLayout(numeric)).toBe('stats');
    expect(resolveListLayout(media)).toBe('card-grid');
    expect(resolveListLayout(plain, { size: 'small' })).toBe('list');
    expect(resolveListLayout(plain)).toBe('table');
    const mapping = createUiMapping({
      listLayouts: [{ match: { type: 'probe' }, layout: 'timeline' }]
    });
    expect(mapping.resolveListLayout({ id: 'probe', class: 'item', fields: plain.fields, states: plain.states })).toBe('timeline');
  });

  it('scales presentation budgets with type richness', () => {
    const wide = { fields: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`f${i}`, { base: 'number' }])) };
    const narrow = { fields: { a: { base: 'string' }, b: { base: 'number' } } };
    expect(tableColumnCount(wide)).toBe(5);
    expect(tableColumnCount(narrow)).toBe(2);
    expect(cardFactCount(wide)).toBe(5);
    expect(cardFactCount(narrow)).toBe(2);
    expect(cardVariantFor({ class: 'file', payload: { preview: 'image' }, fields: {} })).toBe('media');
  });

  it('lets app overrides with narrow matchers win by specificity', () => {
    const mapping = createUiMapping({
      fields: [{ match: { base: 'quantity', unit: 'deg' }, component: 'AngleInput', span: 'half' }]
    });
    expect(mapping.resolveFieldControl({ base: 'quantity', unit: 'deg' }, { variant: 'detail' }).component).toBe('AngleInput');
    expect(mapping.resolveFieldControl({ base: 'quantity', unit: 'mm' }, { variant: 'detail' }).component).toBe('QuantityInput');
  });

  it('resolves deterministically', () => {
    const descriptor = { base: 'record', fields: { a: { base: 'string' } } };
    const first = resolveFieldControl(descriptor, { variant: 'full' });
    for (let i = 0; i < 5; i += 1) {
      expect(resolveFieldControl(descriptor, { variant: 'full' })).toEqual(first);
    }
  });
});

describe('surface resolution', () => {
  it('picks the archetype family from the class and the component from the container variant', () => {
    const drawing = { id: 'drawing', class: 'file', payload: { preview: 'image' } };
    expect(resolveSurface(drawing, { variant: 'full' })).toMatchObject({ archetype: 'viewer', component: 'FileViewerSurface' });
    expect(resolveSurface(drawing, { variant: 'detail' })).toMatchObject({ archetype: 'payload-card', component: 'FileCard' });
    expect(resolveSurface(drawing, { variant: 'row' })).toMatchObject({ archetype: 'file-row', component: 'FileRow' });
    expect(resolveSurface(drawing, { variant: 'inline' })).toMatchObject({ archetype: 'chip', component: 'FileChip' });
  });

  it('gives collection surfaces child-slot budgets per variant', () => {
    const bin = { id: 'bin', class: 'group' };
    expect(resolveSurface(bin, { variant: 'row' }).budgets.children).toEqual({ max: 2, overflow: 'count' });
    expect(resolveSurface(bin, { variant: 'detail' }).budgets.children).toEqual({ max: 6, overflow: 'more' });
    expect(resolveSurface(bin, { variant: 'full' }).budgets.children).toEqual({ overflow: 'scroll' });
  });

  it('falls back to the generic record surface for unknown classes', () => {
    expect(resolveSurface({ id: 'x', class: 'mystery' }, { variant: 'detail' })).toMatchObject({
      archetype: 'record', component: 'RecordSurface'
    });
  });

  it('lets a type-specific override replace the archetype', () => {
    const mapping = createUiMapping({
      surfaces: [{ match: { type: 'dxf_model', variant: 'full' }, archetype: 'cad-viewer', component: 'CadViewer', slots: ['preview'] }]
    });
    expect(mapping.resolveSurface({ id: 'dxf_model', class: 'file' }, { variant: 'full' }).component).toBe('CadViewer');
  });
});

describe('preview resolution', () => {
  it('keys on the declared preview mode, not on MIME', () => {
    expect(resolvePreview({ payload: { preview: 'geometry', mime: ['application/dxf'] } })).toMatchObject({
      component: 'GeometryPreview', mode: 'geometry'
    });
    expect(resolvePreview({ render: { preview: 'image' } })).toMatchObject({ component: 'ImagePreview' });
    expect(resolvePreview({ payload: { mime: ['application/pdf'] } }).component).toBe('AttachmentPreview');
    expect(resolvePreview({}).component).toBeNull();
  });
});

describe('action button resolution', () => {
  it('maps action kinds to presentations', () => {
    expect(resolveActionButton({ actionKind: 'createInstance' })).toMatchObject({ component: 'Button', tone: 'primary' });
    expect(resolveActionButton({ actionKind: 'deleteInstance' })).toMatchObject({ tone: 'danger', confirm: true });
    expect(resolveActionButton({ actionKind: 'runCommand' })).toMatchObject({ tone: 'secondary', icon: 'pi pi-bolt' });
  });

  it('hides event-triggered actions regardless of kind', () => {
    expect(resolveActionButton({ actionKind: 'createInstance', trigger: { mode: 'event' } }).hidden).toBe(true);
  });

  it('tones status transitions from the target state render policy', () => {
    const render = { states: { FAILED: { label: 'Failed', severity: 'danger' }, DONE: { severity: 'success' } } };
    expect(resolveActionButton({ actionKind: 'updateInstance', status: { to: 'FAILED' } }, { render }))
      .toMatchObject({ tone: 'state', severity: 'danger' });
    expect(resolveActionButton({ actionKind: 'updateInstance', status: { to: 'DONE' } }, { render }))
      .toMatchObject({ severity: 'success' });
    expect(resolveActionButton({ actionKind: 'updateInstance' }, { render }).tone).toBe('secondary');
  });
});

describe('value formatting and layout vocabulary', () => {
  it('formats display values per descriptor base', () => {
    expect(formatValue({ base: 'quantity', unit: 'deg' }, { value: 25.5, unit: 'deg' })).toBe('25.5 °');
    expect(formatValue({ base: 'quantity', unit: 'count' }, { value: 42000, unit: 'count' })).toBe('42,000');
    expect(formatValue({ base: 'instant' }, '2026-03-14T08:30:00.000Z')).toBeTruthy();
    expect(formatValue({ base: 'boolean' }, true)).toBe('✓');
    expect(formatValue({ base: 'enum' }, 'h-alpha')).toBe('H Alpha');
    expect(formatValue({ base: 'list' }, [1, 2, 3])).toBe('3');
    expect(formatValue({ base: 'string' }, null)).toBe('—');
    expect(formatValue({}, '2026-11-12T17:00:00.000Z')).toBe(new Date('2026-11-12T17:00:00.000Z').toLocaleDateString());
    expect(formatValue({}, { fileId: 'gridfs-1' })).toBe('gridfs-1');
  });

  it('exposes the layout vocabulary as the single styling home', () => {
    for (const key of ['stack', 'stackTight', 'row', 'rowBetween', 'factsGrid', 'formGrid', 'cardGrid', 'scrollX', 'dialog']) {
      expect(LAYOUT[key], key).toBeTruthy();
    }
  });
});

describe('identity and field groups', () => {
  it('honors the declared identity field before the heuristic', () => {
    const type = { fields: { codename: { base: 'string' }, serial: { base: 'string' } }, render: { identityField: 'codename' } };
    expect(instanceIdentity(type, { fields: { codename: 'Redshift', serial: 'S-1' } })).toBe('Redshift');
    expect(instanceIdentity({ fields: {} }, { id: 'x-9', fields: {} })).toBe('x-9');
    expect(instanceIdentity({ fields: { name: { base: 'string' } } }, { id: 'id-missing', fields: { name: 'Kepler' } })).toBe('Kepler');
  });

  it('resolves authored field groups with a trailing default group', () => {
    const type = {
      fields: { a: { base: 'string' }, b: { base: 'quantity', unit: 'mm' }, c: { base: 'boolean' } },
      render: { groups: [{ id: 'core', fields: ['a', 'b'] }] }
    };
    const groups = resolveFieldGroups(type);
    expect(groups[0]).toMatchObject({ id: 'core', label: 'Core' });
    expect(groups[0].fields.map(field => field.name)).toEqual(['a', 'b']);
    expect(groups[1].id).toBe('default');
    expect(groups[1].label).toBeNull();
    expect(groups[1].fields.map(field => field.name)).toEqual(['c']);
    expect(resolveFieldGroups({ fields: { a: { base: 'string' } } }).map(group => group.id)).toEqual(['default']);
  });
});

describe('weight-driven arrangement', () => {
  const listNode = items => ({ surfaceKind: 'list', instances: Array.from({ length: items }) });
  const detailNode = rows => ({
    surfaceKind: 'detail',
    type: { fields: Object.fromEntries(Array.from({ length: rows }, (_, i) => [`f${i}`, { base: 'string' }])) },
    instances: [{ relations: {} }]
  });

  it('estimates the full rendered height, not a sample', () => {
    expect(estimateRegionWeight(listNode(20))).toBe(22);
    expect(estimateRegionWeight(listNode(3))).toBe(5);
    expect(estimateRegionWeight(detailNode(12))).toBe(12);
    const cardList = { surfaceKind: 'list', type: { id: 'o', class: 'file' }, instances: Array.from({ length: 10 }) };
    expect(estimateRegionWeight(cardList)).toBe(42);
  });

  it('picks screen density from total information', () => {
    expect(screenDensityFor(58)).toBe('compact');
    expect(screenDensityFor(12)).toBe('regular');
  });

  it('tabs only when siblings are many and heavy at the top level', () => {
    expect(childrenModeFor([listNode(8), listNode(8)], 0)).toBe('tabs');
    expect(childrenModeFor([listNode(2), listNode(3)], 0)).toBe('stack');
    expect(childrenModeFor([detailNode(16)], 0)).toBe('stack');
    expect(childrenModeFor([listNode(8), listNode(8)], 1)).toBe('stack');
  });
});

describe('chrome', () => {
  it('maps roles to token names', () => {
    expect(resolveChrome('canvas')).toEqual({ role: 'canvas', flattened: false, surface: 'page', padding: 'none', border: 'none' });
    expect(resolveChrome('card')).toEqual({ role: 'card', flattened: false, surface: 'content', padding: 'md', border: 'hairline' });
  });

  it('flattens same-role nesting instead of repeating the surface', () => {
    expect(resolveChrome('card', 'card')).toEqual({ role: 'card', flattened: true, surface: 'none', padding: 'md', border: 'divider' });
    expect(resolveChrome('card', 'section').flattened).toBe(false);
    expect(resolveChrome('section', 'section').flattened).toBe(false);
  });

  it('exposes the shared severity vocabulary and row field budget', () => {
    expect(SEVERITY_MAP.danger).toBe('danger');
    expect(ROW_FIELD_BUDGET).toEqual({ max: 3, overflow: 'count' });
  });

  it('degrades unknown roles to section chrome', () => {
    expect(resolveChrome('mystery').surface).toBe('none');
  });
});

describe('budgets', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('shows everything under the max', () => {
    expect(applyBudget(items, { max: 6, overflow: 'count' })).toEqual({ mode: 'all', visible: items, hidden: 0 });
  });

  it('collapses over the max and reports the hidden count', () => {
    const outcome = applyBudget(items, { max: 2, overflow: 'count' });
    expect(outcome).toMatchObject({ mode: 'collapsed', hidden: 3 });
    expect(outcome.visible).toEqual(['a', 'b']);
  });

  it('scrolls when no max is declared', () => {
    expect(applyBudget(items, { overflow: 'scroll' })).toMatchObject({ mode: 'scroll', hidden: 0 });
  });

  it('shows everything when there is no budget', () => {
    expect(applyBudget(items, null)).toEqual({ mode: 'all', visible: items, hidden: 0 });
  });
});
