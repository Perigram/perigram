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
  spacingClasses,
  SPACING_STEPS,
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
  HEADER_ACTIONS_INLINE,
  VARIANTS,
  analyzeInstanceShape,
  resolveListControls,
  resolveInstanceActions,
  sortControlRows,
  pageSlice,
  toolbarVisibleFor,
  instanceMatchesToolbar,
  typeLabelKey,
  fieldLabelKey,
  actionLabelKey,
  localizedLabel
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

  it('resolves prose, meters, sliders, and carousels from shape', () => {
    expect(resolveFieldControl({ base: 'string', max: 400 }, { variant: 'row' })).toMatchObject({
      component: 'ProseText', span: 'full'
    });
    expect(resolveFieldControl({ base: 'map', itemType: { base: 'quantity', unit: 'percent' } }, { variant: 'row' })).toMatchObject({
      component: 'MeterGroup'
    });
    expect(resolveFieldControl({ base: 'number', min: 0, max: 100 }, { variant: 'detail' })).toMatchObject({
      component: 'Slider'
    });
    expect(resolveFieldControl({ base: 'quantity', unit: 'mm', min: 0, max: 1000 }, { variant: 'detail' })).toMatchObject({
      component: 'Slider'
    });
    const media = { class: 'file', payload: { preview: 'image' }, fields: { title: { base: 'string' } } };
    expect(resolveListLayout(media, { size: 'large' })).toBe('carousel');
    expect(resolveListLayout(media, {})).toBe('card-grid');
  });

  it('edits maps and json as text, records as structured editors', () => {
    expect(resolveFieldControl({ base: 'map', itemType: { base: 'string' } }, { variant: 'detail' })).toMatchObject({
      component: 'JsonEditor', span: 'full'
    });
    expect(resolveFieldControl({ base: 'json' }, { variant: 'detail' })).toMatchObject({
      component: 'JsonEditor'
    });
    expect(resolveFieldControl({ base: 'record', fields: { a: { base: 'string' } } }, { variant: 'detail' })).toMatchObject({
      component: 'ObjectEditor'
    });
  });

  it('resolves ratings, charts, and order lists from shape', () => {
    expect(resolveFieldControl({ base: 'enum', values: ['p0', 'p1', 'p2', 'p3'] }, { variant: 'row' })).toMatchObject({
      component: 'Rating', span: 'full'
    });
    expect(resolveFieldControl({ base: 'enum', values: ['red', 'green'] }, { variant: 'row' })).toMatchObject({
      component: 'Tag'
    });
    expect(resolveFieldControl({ base: 'map', itemType: { base: 'quantity', unit: 'count' } }, { variant: 'row' })).toMatchObject({
      component: 'Chart'
    });
    expect(resolveFieldControl({ base: 'list', itemType: { base: 'enum', values: ['a', 'b'] } }, { variant: 'detail' })).toMatchObject({
      component: 'OrderList'
    });
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

  it('keeps the record header contract static-token plus scoped CSS', () => {
    // No Tailwind container-query variants: the build has no
    // container-queries plugin, so any @container/@[w]: class compiles to
    // nothing. The responsive switch lives in SurfaceHeader scoped CSS;
    // tokens carry only the static stacked layout and the shrink contract
    // (min-w-0 keeps long names truncating instead of overflowing).
    expect(LAYOUT.headerBar).not.toContain('@');
    expect(LAYOUT.headerRow).toBe('flex flex-col items-start gap-3');
    expect(LAYOUT.headerIdentity).toBe('min-w-0 flex-1');
    expect(HEADER_ACTIONS_INLINE).toBe(2);
  });
});

describe('identity and field groups', () => {
  it('honors the declared identity field before the heuristic', () => {
    const type = { fields: { codename: { base: 'string' }, serial: { base: 'string' } }, render: { identityField: 'codename' } };
    expect(instanceIdentity(type, { fields: { codename: 'Redshift', serial: 'S-1' } })).toBe('Redshift');
    expect(instanceIdentity({ fields: {} }, { id: 'x-9', fields: {} })).toBe('x-9');
    expect(instanceIdentity({ fields: { name: { base: 'string' } } }, { id: 'id-missing', fields: { name: 'Kepler' } })).toBe('Kepler');
    const valueOnly = { fields: { zeta: { base: 'string' } } };
    expect(instanceIdentity(valueOnly, { id: 'x-1', fields: { zeta: 'Nomad' } })).toBe('Nomad');
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

  it('scales the rhythm set from one spacing coefficient', () => {
    const tight = spacingClasses(0.5);
    const normal = spacingClasses(1);
    const loose = spacingClasses(2);
    expect(tight.specRow).toContain('py-0.5');
    expect(tight.knob).toBe(40);
    expect(tight.editorSize).toBe('small');
    expect(normal.specRow).toContain('py-2');
    expect(normal.knob).toBe(64);
    expect(normal.editorSize).toBeNull();
    expect(loose.specRow).toContain('py-6');
    expect(loose.knob).toBe(96);
    expect(spacingClasses(0.6)).toBe(spacingClasses(1));
    expect(SPACING_STEPS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  });

  it('picks screen density from total information; the driver biases the threshold', () => {
    expect(screenDensityFor(58)).toBe('compact');
    expect(screenDensityFor(12)).toBe('regular');
    expect(screenDensityFor(30, 16)).toBe('regular');
    expect(screenDensityFor(30, -12)).toBe('compact');
    expect(screenDensityFor(30, 100)).toBe('regular');
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
    expect(HEADER_ACTIONS_INLINE).toBe(2);
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

describe('authored render overrides', () => {
  it('lets an authored render.listLayout win over shape matching when it names a known layout', () => {
    const media = { class: 'file', payload: { preview: 'image' }, fields: { title: { base: 'string' } } };
    expect(resolveListLayout({ ...media, render: { listLayout: 'timeline' } })).toBe('timeline');
    expect(resolveListLayout(media)).toBe('card-grid');
  });

  it('ignores authored list layouts outside the vocabulary', () => {
    const plain = { class: 'item', states: { main: { values: ['a'] } }, fields: { name: { base: 'string' } } };
    expect(resolveListLayout({ ...plain, render: { listLayout: 'hologram' } })).toBe('table');
    expect(resolveListLayout({ ...plain, render: { listLayout: 7 } })).toBe('table');
  });

  it('pins editor controls through descriptor render.control; display variants stay derived', () => {
    const descriptor = { base: 'string', render: { control: 'Textarea' } };
    expect(resolveFieldControl(descriptor, { variant: 'detail' }).component).toBe('Textarea');
    expect(resolveFieldControl({ base: 'string' }, { variant: 'detail' }).component).toBe('InputText');
    expect(resolveFieldControl(descriptor, { variant: 'row' }).component).toBe('ValueText');
  });
});

describe('instance-aware list controls', () => {
  const type = {
    id: 'probe',
    class: 'item',
    fields: {
      name: { base: 'string' },
      note: { base: 'string', multiline: true },
      size: { base: 'quantity', unit: 'mm' },
      grade: { base: 'enum', values: ['a', 'b', 'c'] },
      alwaysNull: { base: 'number' }
    },
    render: { identityField: 'name', sortKey: 'size' }
  };

  const instances = [
    { id: '1', fields: { name: 'A', size: { value: 2, unit: 'mm' }, grade: 'a' } },
    { id: '2', fields: { name: 'B', size: { value: 1, unit: 'mm' }, grade: 'b' } },
    { id: '3', fields: { name: 'C', grade: 'b' } }
  ];

  it('reports which fields carry data and the enum values present', () => {
    const shape = analyzeInstanceShape(type, instances);
    expect(shape.filledScalarNames).toEqual(['name', 'size', 'grade']);
    expect(shape.enumValues.grade).toEqual(['a', 'b']);
    expect(shape.instanceCount).toBe(3);
  });

  it('derives search keys, filled sort keys with the declared default, facets, and budgets', () => {
    const controls = resolveListControls(type, instances);
    expect(controls.searchKeys).toEqual(['name']);
    expect(controls.sortKeys.map(key => key.name)).toEqual(['name', 'size', 'grade']);
    expect(controls.sortKeys.find(key => key.name === 'size').default).toBe(true);
    expect(controls.defaultSort).toBe('size');
    expect(controls.facets).toEqual([{ name: 'grade', label: 'Grade', values: ['a', 'b'] }]);
    expect(controls.pagination).toEqual({ paginateAt: 10, rows: 10, virtualizeAt: 50 });
  });

  it('drops the declared sort key when no instance fills it', () => {
    const empty = resolveListControls(type, []);
    expect(empty.defaultSort).toBeNull();
    expect(empty.sortKeys).toEqual([]);
    expect(empty.facets).toEqual([]);
  });

  it('counts budgeted relation refs in list weight', () => {
    const related = {
      surfaceKind: 'list',
      type: { edges: { relations: { docs: { types: ['x'] } } } },
      instances: [{ relations: { docs: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }] } }]
    };
    expect(estimateRegionWeight(related)).toBe(2 + 1 + Math.ceil(5 / 4));
  });
});

describe('generated label keys', () => {
  it('derives stable keys per type, field, and action id', () => {
    expect(typeLabelKey('cassette')).toBe('uiMapping.types.cassette');
    expect(fieldLabelKey('cassette', 'sheetCount')).toBe('uiMapping.fields.cassette.sheetCount');
    expect(actionLabelKey('cassette_create')).toBe('uiMapping.actions.cassette_create');
  });

  it('falls back to the derived label when the key is absent or the translator is missing', () => {
    const translator = { te: key => key === 'uiMapping.types.cassette', t: () => 'Кассета' };
    expect(localizedLabel(translator, 'uiMapping.types.cassette', 'Cassette')).toBe('Кассета');
    expect(localizedLabel(translator, 'uiMapping.types.other', 'Other')).toBe('Other');
    expect(localizedLabel(null, 'uiMapping.types.cassette', 'Cassette')).toBe('Cassette');
  });
});

describe('client-side row ordering and paging', () => {
  const rows = [
    { id: 'a', fields: { name: 'Pear', size: { value: 3, unit: 'mm' } } },
    { id: 'b', fields: { name: 'apple' } },
    { id: 'c', fields: { name: 'Fig', size: { value: 1, unit: 'mm' } } }
  ];

  it('sorts strings case-insensitively and keeps absent quantity values last', () => {
    expect(sortControlRows(rows, { name: 'name', base: 'string' }).map(row => row.id)).toEqual(['b', 'c', 'a']);
    expect(sortControlRows(rows, { name: 'size', base: 'quantity' }).map(row => row.id)).toEqual(['c', 'a', 'b']);
    expect(sortControlRows(rows, { name: 'size', base: 'quantity' }, -1).map(row => row.id)).toEqual(['a', 'c', 'b']);
  });

  it('never mutates the input rows and slices pages defensively', () => {
    const snapshot = JSON.parse(JSON.stringify(rows));
    sortControlRows(rows, { name: 'name', base: 'string' });
    expect(rows).toEqual(snapshot);
    expect(pageSlice(rows, 1, 1).map(row => row.id)).toEqual(['b']);
    expect(pageSlice(rows, 99, 10)).toEqual([]);
    expect(pageSlice(null, -5, 0).length).toBe(0);
  });

  it('scales the toolbar rhythm with the spacing coefficient', () => {
    expect(spacingClasses(0.5).toolbar).toContain('gap-1');
    expect(spacingClasses(1).toolbar).toContain('gap-2');
    expect(spacingClasses(2).toolbar).toContain('gap-4');
  });
});

describe('per-instance quick actions', () => {
  const actions = {
    a_create: { id: 'a_create', actionKind: 'createInstance', typeId: 'document', trigger: { mode: 'manual' } },
    a_transition: { id: 'a_transition', actionKind: 'updateInstance', typeId: 'document', trigger: { mode: 'manual' }, status: { to: 'archived' } },
    a_edit: { id: 'a_edit', actionKind: 'updateInstance', typeId: 'document', trigger: { mode: 'manual' } },
    a_auto: { id: 'a_auto', actionKind: 'updateInstance', typeId: 'document', trigger: { mode: 'event' }, status: { to: 'synced' } },
    a_delete: { id: 'a_delete', actionKind: 'deleteInstance', typeId: 'document', trigger: { mode: 'manual' } },
    a_link: { id: 'a_link', actionKind: 'link', typeId: 'document', trigger: { mode: 'manual' } },
    a_other: { id: 'a_other', actionKind: 'deleteInstance', typeId: 'sheet', trigger: { mode: 'manual' } }
  };

  it('keeps only manual per-instance transitions, deletions, and commands for the type', () => {
    expect(resolveInstanceActions(actions, 'document').map(action => action.id)).toEqual(['a_transition', 'a_delete']);
    expect(resolveInstanceActions(actions, 'sheet').map(action => action.id)).toEqual(['a_other']);
  });

  it('is empty without a type and never throws on sparse contracts', () => {
    expect(resolveInstanceActions(actions, null)).toEqual([]);
    expect(resolveInstanceActions({}, 'document')).toEqual([]);
    expect(resolveInstanceActions({ broken: null }, 'document')).toEqual([]);
  });
});

describe('toolbar visibility and matching', () => {
  const type = {
    id: 'gear', class: 'item',
    fields: { code: { base: 'string' }, size: { base: 'quantity', unit: 'mm' } },
    render: { identityField: 'code' }
  };
  const rows = count => Array.from({ length: count }, (_, i) => ({
    id: `g${i + 1}`, type: 'gear', fields: { code: `G-${i + 1}`, size: { value: i, unit: 'mm' } }
  }));

  it('shows on large collections even with no search keys or facets', () => {
    const bare = { surfaceKind: 'list', instances: rows(20), listControls: { searchKeys: [], sortKeys: [], facets: [], defaultSort: null } };
    expect(toolbarVisibleFor(bare)).toBe(true);
  });

  it('shows on small collections only through a multi-value facet', () => {
    const single = rows(3);
    const oneValue = { surfaceKind: 'list', instances: single, listControls: { searchKeys: [], sortKeys: [], facets: [{ name: 'grade', label: 'Grade', values: ['a'] }] } };
    const multi = { surfaceKind: 'list', instances: single, listControls: { searchKeys: [], sortKeys: [], facets: [{ name: 'grade', label: 'Grade', values: ['a', 'b'] }] } };
    expect(toolbarVisibleFor(oneValue)).toBe(false);
    expect(toolbarVisibleFor(multi)).toBe(true);
  });

  it('never shows off list surfaces or without a composed tree', () => {
    expect(toolbarVisibleFor({ surfaceKind: 'detail', instances: rows(20) })).toBe(false);
    expect(toolbarVisibleFor({ surfaceKind: 'list', instances: rows(20) })).toBe(true);
    expect(toolbarVisibleFor()).toBe(false);
  });

  it('matches identity fallback (id) when no field matches', () => {
    const controls = resolveListControls(type, rows(2));
    const instance = { id: 'mystery-9', type: 'gear', fields: {} };
    expect(instanceMatchesToolbar(type, controls, instance, 'mystery')).toBe(true);
    expect(instanceMatchesToolbar(type, controls, instance, 'zzz')).toBe(false);
    expect(instanceMatchesToolbar(type, controls, rows(2)[0], 'g-1')).toBe(true);
  });

  it('matches facets exactly and ignores empty selections', () => {
    const instance = { id: 'g1', type: 'gear', fields: { grade: 'a' } };
    expect(instanceMatchesToolbar(type, {}, instance, '', { grade: 'a' })).toBe(true);
    expect(instanceMatchesToolbar(type, {}, instance, '', { grade: 'b' })).toBe(false);
    expect(instanceMatchesToolbar(type, {}, instance, '', { grade: '' })).toBe(true);
    expect(instanceMatchesToolbar(type, {}, instance, '', { grade: null })).toBe(true);
  });
});
