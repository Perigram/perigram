import { builderFieldsForType } from './index.js';
import { describe, it, expect } from 'vitest';
import {
  createUiMapping,
  formatValue,
  LAYOUT,
  titleFor,
  iconFor,
  resolveFieldGroups,
  estimateRegionWeight,
  arrangeChildren,
  regionDataTraits,
  shapeFamilyOf,
  resolveContainerTraits,
  regionSideSpanFor,
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
  localizedLabel,
  resolveCreateDialogInputs,
  resolveRunDialogInputs,
  planActionLaunch,
  childrenOfParent,
  statePolicyByType,
  stateFieldPolicyByType,
  stateTransitionsByType,
  hasStateVocabulary,
  temporalFieldsFor,
  stateDisplayFor,
  stateSegmentsOf
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
      component: 'InstanceInlineRef', props: { density: 'inline' }
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
    const numeric = { class: 'item', fields: {
      load: { base: 'quantity', unit: 'percent' },
      speed: { base: 'quantity', unit: 'count' },
      label: { base: 'string' }
    } };
    const media = { class: 'file', payload: { preview: 'image' }, fields: { title: { base: 'string' } } };
    const plain = { class: 'item', fields: {
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
    expect(mapping.resolveListLayout({ id: 'probe', class: 'item', fields: plain.fields })).toBe('timeline');
  });

  it('boards process-class collections over a served state vocabulary', () => {
    const process = { id: 'watch_job', class: 'process', fields: {
      note: { base: 'string', max: 400 }
    } };
    const proseFields = { body: { base: 'string', max: 400 } };
    // The contract data that earns the board: the process class, a
    // vocabulary spanning at least BOARD_MIN_COLUMNS values, and no
    // containment — each missing signal falls back to the shape default.
    expect(resolveListLayout(process, { stateful: true })).toBe('board');
    expect(resolveListLayout(process, { stateful: false })).toBe('timeline');
    expect(resolveListLayout({ ...process, class: 'item' }, { stateful: true })).toBe('timeline');
    expect(hasStateVocabulary({ queued: {}, running: {} })).toBe(true);
    expect(hasStateVocabulary({ queued: {} })).toBe(false);
    expect(hasStateVocabulary(null)).toBe(false);
    // The board wins on specificity over the shape signals it overlaps
    // (a stateful process type that also reads chronological still
    // boards — the machine is the collection's structure), but an
    // authored override entry still outranks the default table.
    expect(resolveListLayout({ id: 'log', class: 'process', fields: proseFields }, { stateful: true })).toBe('board');
    const mapping = createUiMapping({
      listLayouts: [{ match: { type: 'log' }, layout: 'timeline' }]
    });
    expect(mapping.resolveListLayout({ id: 'log', class: 'process', fields: proseFields }, { stateful: true })).toBe('timeline');
  });

  it('gantts intervals, calendars schedules, and yields to stronger shapes', () => {
    const interval = { class: 'item', fields: {
      title: { base: 'string' },
      from: { base: 'instant' },
      until: { base: 'instant' }
    } };
    const scheduled = { class: 'item', fields: {
      title: { base: 'string' },
      when: { base: 'instant' },
      seats: { base: 'number' },
      place: { base: 'string' }
    } };
    // Two instants declare an interval — the gantt, even when the type
    // would also read chronological (the interval is the stronger
    // structure); a prose type with one instant stays the timeline.
    expect(resolveListLayout(interval, {})).toBe('gantt');
    expect(resolveListLayout({ class: 'item', fields: { note: { base: 'string', max: 400 }, when: { base: 'instant' } } }, {})).toBe('timeline');
    // A lone instant on an otherwise plain type schedules the calendar;
    // temporal shape beats size the way chronology already does (a
    // handful of scheduled entries still grids), and a narrow type
    // override still outranks it.
    expect(resolveListLayout(scheduled, {})).toBe('calendar');
    expect(resolveListLayout(scheduled, { size: 'small' })).toBe('calendar');
    const mapping = createUiMapping({
      listLayouts: [{ match: { type: 'visit' }, layout: 'table' }]
    });
    expect(mapping.resolveListLayout({ ...scheduled, id: 'visit' }, {})).toBe('table');
  });

  it('derives temporal fields in declaration order', () => {
    expect(temporalFieldsFor({ fields: {
      title: { base: 'string' },
      from: { base: 'instant' },
      until: { base: 'instant' }
    } })).toEqual({ start: 'from', end: 'until' });
    expect(temporalFieldsFor({ fields: { when: { base: 'instant' } } })).toEqual({ start: 'when', end: null });
    expect(temporalFieldsFor({ fields: { title: { base: 'string' } } })).toBe(null);
  });

  it('derives the machine edges as the board legal-move contract', () => {
    const producerOutputs = {
      job_a: {
        typeId: 'watch_job',
        workflow: {
          regions: {
            lifecycle: {
              states: { queued: {}, running: {}, done: { isTerminal: true } },
              transitions: [
                { from: 'queued', to: 'running', intent: 'start' },
                { from: 'running', to: 'done' },
                { from: 'running', to: 'done', intent: 'duplicate-edge-loses' },
                { from: 'running', to: 'failed', processOwned: true },
                { from: '', to: 'running' },
                { to: 'done' },
                null
              ]
            }
          }
        }
      },
      job_b: { typeId: 'watch_job' },
      bare: { typeId: 'widget' }
    };
    expect(stateTransitionsByType(producerOutputs)).toEqual({
      watch_job: [
        { from: 'queued', to: 'running', region: 'lifecycle', intent: 'start' },
        { from: 'running', to: 'done', region: 'lifecycle', intent: null }
      ]
    });
    expect(stateTransitionsByType({})).toEqual({});
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
    expect(resolvePreview({ payload: { preview: 'image' } })).toMatchObject({ component: 'ImagePreview' });
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

  it('tones status transitions from the target state display policy', () => {
    const statePolicy = { FAILED: { label: 'Failed', severity: 'danger' }, DONE: { severity: 'success', terminal: true } };
    expect(resolveActionButton({ actionKind: 'updateInstance', state: { to: 'FAILED' } }, { statePolicy }))
      .toMatchObject({ tone: 'state', severity: 'danger', label: 'Failed' });
    expect(resolveActionButton({ actionKind: 'updateInstance', state: { to: 'DONE' } }, { statePolicy }))
      .toMatchObject({ severity: 'success' });
    // Stateless updates are the field-edit form: fields edit inline on
    // detail surfaces, so the bulk form never renders as an action.
    expect(resolveActionButton({ actionKind: 'updateInstance' }, { statePolicy }).hidden).toBe(true);
  });

  it('derives a transition button label from the target value when the policy has none', () => {
    expect(resolveActionButton({ actionKind: 'updateInstance', state: { to: 'in_review' } }, { statePolicy: { in_review: {} } }))
      .toMatchObject({ tone: 'state', label: 'In Review', severity: 'info' });
  });
});

describe('state display policy (flat vocabulary)', () => {
  it('derives per-type policy maps from compiled producer workflows', () => {
    const producerOutputs = {
      job_a: {
        typeId: 'watch_job',
        workflow: {
          primaryRegion: 'main',
          regions: {
            main: {
              initial: 'queued',
              states: {
                queued: {},
                running: { label: 'Running', severity: 'info', icon: 'pi pi-spinner' },
                done: { isTerminal: true, label: 'Done', severity: 'success' }
              },
              transitions: []
            }
          }
        }
      },
      job_b: { typeId: 'watch_job' },
      empty: { workflow: { regions: { main: { states: {} } } } }
    };

    expect(statePolicyByType(producerOutputs)).toEqual({
      watch_job: {
        queued: { label: null, severity: null, icon: null, terminal: false },
        running: { label: 'Running', severity: 'info', icon: 'pi pi-spinner', terminal: false },
        done: { label: 'Done', severity: 'success', icon: null, terminal: true }
      }
    });
  });

  it('keeps the first authored entry when several producers emit one type', () => {
    const policy = statePolicyByType({
      first: { typeId: 'widget', workflow: { regions: { main: { states: { ready: { label: 'Ready' } } } } } },
      second: { typeId: 'widget', workflow: { regions: { main: { states: { ready: { label: 'Overridden' }, idle: {} } } } } }
    });
    expect(policy.widget.ready.label).toBe('Ready');
    expect(policy.widget.idle).toBeTruthy();
  });

  it('derives per-state field policies from the same workflows', () => {
    const policies = stateFieldPolicyByType({
      first: { typeId: 'widget', workflow: { regions: { main: { states: {
        ready: { fieldPolicy: { visible: ['serial'], editable: [] } },
        idle: {}
      } } } } },
      second: { typeId: 'widget', workflow: { regions: { main: { states: { ready: { fieldPolicy: { visible: ['ghost'] } } } } } } }
    });
    expect(policies).toEqual({
      widget: { ready: { visible: ['serial'], editable: [] } }
    });
  });

  it('applies SPEC defaults and resolves labels from the leaf segment', () => {
    expect(stateDisplayFor({ queued: {} }, 'queued')).toMatchObject({ label: 'Queued', severity: 'info', terminal: false });
    expect(stateDisplayFor({ archived: { terminal: true } }, 'archived')).toMatchObject({ severity: 'secondary' });
    expect(stateDisplayFor({ cutting: { label: 'Cutting' } }, 'PRODUCTION.cutting'))
      .toMatchObject({ label: 'Cutting', segments: ['PRODUCTION', 'cutting'] });
  });

  it('renders unknown values as the neutral stop-line and no vocabulary as nothing', () => {
    // A value outside the served vocabulary still displays (stale data
    // degrades to a raw chip), but a type without a vocabulary renders no
    // state surface at all.
    expect(stateDisplayFor({ queued: {} }, 'mystery')).toMatchObject({ known: false, label: 'Mystery', severity: 'secondary' });
    expect(stateDisplayFor(null, 'queued')).toBeNull();
    expect(stateDisplayFor({}, 'queued')).toBeNull();
  });

  it('splits dotted values into path segments for the segmented tag', () => {
    expect(stateSegmentsOf('PRODUCTION.queued')).toEqual(['PRODUCTION', 'queued']);
    expect(stateSegmentsOf('done')).toEqual(['done']);
    expect(stateSegmentsOf('')).toEqual([]);
  });
});

describe('action launch plan', () => {
  it('opens the create dialog whenever the action carries construction inputs', () => {
    expect(planActionLaunch({ actionKind: 'createInstance', construction: { inputs: ['name'] } })).toBe('dialog');
  });

  it('never replaces a create form with a bare confirm because of the grant level', () => {
    // The reported defect: admin-granted creates ran behind a
    // confirmation with an empty draft — grant level is an access signal,
    // not a presentation one.
    expect(planActionLaunch({
      actionKind: 'createInstance',
      access: { level: 'admin' },
      construction: { inputs: ['name'] }
    })).toBe('dialog');
  });

  it('confirms only the destructive kinds, links open their picker, others run', () => {
    expect(planActionLaunch({ actionKind: 'deleteInstance', access: { level: 'admin' } })).toBe('confirm');
    expect(planActionLaunch({ actionKind: 'link' })).toBe('link');
    expect(planActionLaunch({ actionKind: 'updateInstance' })).toBe('run');
    expect(planActionLaunch({ actionKind: 'updateInstance', access: { level: 'admin' }, state: { to: 'DONE' } })).toBe('run');
    expect(planActionLaunch({ actionKind: 'runCommand' })).toBe('run');
  });

  it('opens the run dialog for a run action carrying prompted inputs', () => {
    const action = {
      actionKind: 'runCommand',
      inputs: [
        { id: 'sheetWidth', type: 'number', unit: 'mm', default: 1220, prompt: true },
        { id: 'sheetHeight', type: 'number', unit: 'mm', default: 2440, prompt: true },
        { id: 'items', type: 'object', prompt: false }
      ]
    };
    expect(planActionLaunch(action)).toBe('dialog');
    expect(resolveRunDialogInputs(action)).toEqual([
      { id: 'sheetWidth', label: 'sheetWidth', descriptor: { base: 'quantity', unit: 'mm' }, span: 'half', required: false, default: { value: 1220, unit: 'mm' } },
      { id: 'sheetHeight', label: 'sheetHeight', descriptor: { base: 'quantity', unit: 'mm' }, span: 'half', required: false, default: { value: 2440, unit: 'mm' } }
    ]);
    expect(planActionLaunch({ actionKind: 'runCommand', inputs: [{ id: 'items', prompt: false }] })).toBe('run');
  });
});

describe('hierarchy materialization', () => {
  it('matches children through the declared lineageKey, never the edge map key', () => {
    const type = { edges: { children: { 't-part-1s': { types: ['t-part-1'], lineageKey: 'tBin1Id' } } } };
    const pool = {
      't-part-1': {
        nested: { id: 'nested', type: 't-part-1', lineage: { tBin1Id: { id: 'bin' } } },
        stray: { id: 'stray', type: 't-part-1', lineage: { 't-part-1s': { id: 'bin' } } },
        loose: { id: 'loose', type: 't-part-1', lineage: {} }
      }
    };
    const children = childrenOfParent(type, pool, 'bin');
    expect(children.map(child => child.id)).toEqual(['nested']);
  });

  it('matches lineage references in both stored shapes', () => {
    const type = { edges: { children: { parts: { types: ['t-part-1'], lineageKey: 'binId' } } } };
    const pool = {
      't-part-1': {
        ref: { id: 'ref', type: 't-part-1', lineage: { binId: { id: 'bin' } } },
        raw: { id: 'raw', type: 't-part-1', lineage: { binId: 'bin' } },
        other: { id: 'other', type: 't-part-1', lineage: { binId: 'bin-2' } }
      }
    };
    expect(childrenOfParent(type, pool, 'bin').map(child => child.id).sort()).toEqual(['raw', 'ref']);
  });

  it('contributes every declared child type of every children edge', () => {
    const type = { edges: { children: {
      parts: { types: ['t-part-1'], lineageKey: 'binId' },
      docs: { types: ['t-doc'], lineageKey: 'binId' }
    } } };
    const pool = {
      't-part-1': { p: { id: 'p', type: 't-part-1', lineage: { binId: { id: 'bin' } } } },
      't-doc': { d: { id: 'd', type: 't-doc', lineage: { binId: { id: 'bin' } } } }
    };
    expect(childrenOfParent(type, pool, 'bin').map(child => child.id)).toEqual(['p', 'd']);
    expect(childrenOfParent(type, pool, 'other')).toEqual([]);
    expect(childrenOfParent(null, pool, 'bin')).toEqual([]);
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
    for (const key of ['stack', 'stackTight', 'row', 'rowBetween', 'formGrid', 'factsGrid', 'bodyGrid', 'packRow', 'scrollX', 'dialog']) {
      expect(LAYOUT[key], key).toBeTruthy();
    }
    // Card grids render through ResponsiveGrid.
    expect(LAYOUT.cardGrid).toBeUndefined();
  });

  it('keeps the record header contract static-token plus scoped CSS', () => {
    // No Tailwind container-query variants: the build has no
    // container-queries plugin, so any @container/@[w]: class compiles to
    // nothing. The responsive switch lives in SurfaceHeader scoped CSS;
    // tokens carry only the static stacked layout and the shrink contract
    // (min-w-0 keeps long names truncating instead of overflowing). The
    // header paints no box — retired with the boxed headerBar token.
    expect(LAYOUT.headerBar).toBeUndefined();
    expect(LAYOUT.headerRow).toBe('flex flex-col items-start gap-3');
    expect(LAYOUT.headerIdentity).toBe('min-w-0 flex-1');
    expect(HEADER_ACTIONS_INLINE).toBe(2);
  });
});

describe('title, glyph, and field groups', () => {
  it('resolves titles from the identifier field only — no ids, slugs, or heuristics', () => {
    const type = { identifier: 'codename', fields: { codename: { base: 'string', identifier: true }, serial: { base: 'string' } } };
    expect(titleFor({ fields: { codename: 'Redshift', serial: 'S-1' } }, type)).toBe('Redshift');
    // Empty identifier value: the unnamed placeholder (localizable),
    // never the raw record id, never the slug, never another field.
    expect(titleFor({ id: 'x-9', fields: { codename: '', serial: 'S-1' } }, type)).toBe('Unnamed');
    expect(titleFor({ id: 'x-9', fields: {} }, type, { unnamedLabel: 'Sin nombre' })).toBe('Sin nombre');
    // No identifier flag and no type view: unnamed, even when short
    // strings, type names, or ids exist.
    expect(titleFor({ id: 'x-1', fields: { zeta: 'Nomad' } }, { fields: { zeta: { base: 'string' } } })).toBe('Unnamed');
    expect(titleFor({ id: 'x-1', fields: { zeta: 'Nomad' } }, null)).toBe('Unnamed');
    expect(titleFor({ id: 'x-1', fields: { zeta: 'Nomad' } }, { name: 'Bin', fields: {} })).toBe('Unnamed');
  });

  it('resolves glyphs from the type with per-record depiction thumbs preferred', () => {
    const type = { glyph: 'pi pi-box', depiction: { glyph: 'pi pi-box', thumb: 'snapshot' } };
    expect(iconFor(type)).toBe('pi pi-box');
    expect(iconFor(type, { fields: { snapshot: 'img://run-7' } })).toBe('img://run-7');
    // An empty thumb value falls back to the glyph.
    expect(iconFor(type, { fields: { snapshot: '' } })).toBe('pi pi-box');
    expect(iconFor(null)).toBe('pi pi-circle');
  });

  it('projects derived sections with a trailing default group for unassigned fields', () => {
    const type = {
      fields: { a: { base: 'string' }, b: { base: 'quantity', unit: 'mm' }, c: { base: 'boolean' } },
      sections: [{ id: 'summary', label: null, fields: ['a'] }, { id: 'dimensions', label: null, fields: ['b'] }]
    };
    const groups = resolveFieldGroups(type);
    expect(groups[0]).toMatchObject({ id: 'summary', label: null });
    expect(groups[0].fields.map(field => field.name)).toEqual(['a']);
    expect(groups[1].id).toBe('dimensions');
    expect(groups[1].fields.map(field => field.name)).toEqual(['b']);
    expect(groups[2].id).toBe('default');
    expect(groups[2].label).toBeNull();
    expect(groups[2].fields.map(field => field.name)).toEqual(['c']);
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

  it('tabs heavy section sets at the top level and stacks light ones', () => {
    // Screen sections arrange through the same ladder: full-breadth
    // tables within the column cap stack (the row-cheapest layout);
    // past the cap the set tabs (the page-height bound).
    const table = weight => ({ id: `t${weight}`, dataTraits: { breadth: 'full', weight } });
    expect(arrangeChildren([table(10), table(10)], 0)).toEqual({ mode: 'stack' });
    expect(arrangeChildren([table(16), table(14)], 0).mode).toBe('tabs');
    expect(arrangeChildren([table(4), table(4)], 0)).toEqual({ mode: 'stack' });
    expect(arrangeChildren([table(10), table(10)], 1).mode).toBe('stack');
    expect(arrangeChildren([{ ...detailNode(16), id: 'd' }], 0)).toEqual({ mode: 'stack' });
  });

  it('arranges siblings by weight: stack, proportional columns, dominant flow, weight-ordered tabs', () => {
    // Content-breadth lists (file-class card collections) with explicit
    // weights; table-breadth lists carry the full-row claim below.
    const card = (weight, id = 'c') => ({ id, dataTraits: { breadth: 'content', weight } });
    const fullRow = (weight, id = 't') => ({ id, dataTraits: { breadth: 'full', weight } });
    // Light sets flow in one stack.
    expect(arrangeChildren([card(4), card(4)], 0)).toEqual({ mode: 'stack' });
    // Peers over the budget, each within the column cap, share
    // proportional columns — track fr from each child's estimated rows.
    expect(arrangeChildren([card(6), card(6)], 0)).toEqual({ mode: 'columns', tracks: 'minmax(0, 6fr) minmax(0, 6fr)' });
    // A dominant sibling keeps the flow while its remainder fits the
    // surface budget; the light rest stacks after it.
    const dominant = arrangeChildren([
      { id: 'big', surfaceKind: 'detail', type: { fields: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`f${i}`, { base: 'string' }])) }, instances: [{ relations: {} }] },
      card(4, 'a'),
      card(4, 'b')
    ], 0);
    expect(dominant.mode).toBe('mixed');
    expect(dominant.primary).toBe(0);
    expect(dominant.rest).toEqual({ mode: 'stack' });
    // A dominant sibling whose remainder exceeds the surface budget tabs
    // the set — the page-height bound stays reachable for top-heavy sets.
    expect(arrangeChildren([
      { id: 'big', surfaceKind: 'detail', type: { fields: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`f${i}`, { base: 'string' }])) }, instances: [{ relations: {} }] },
      card(14, 'rest')
    ], 0).mode).toBe('tabs');
    // Peers past the column cap tab at the top level, ordered by
    // descending weight.
    const tabbed = arrangeChildren([card(12, 'light'), card(15, 'heavy')], 0);
    expect(tabbed.mode).toBe('tabs');
    expect(tabbed.order).toEqual(['heavy', 'light']);
    // Nested over-cap content stacks — tabs are a top-level arrangement.
    expect(arrangeChildren([card(14), card(14)], 1).mode).toBe('stack');
  });

  it('grants full-breadth children the whole row beside column peers', () => {
    const card = (weight, id = 'c') => ({ id, dataTraits: { breadth: 'content', weight } });
    const fullRow = (weight, id = 't') => ({ id, dataTraits: { breadth: 'full', weight } });
    // A full-row sibling renders whole-row; the columnable peers share
    // the columns beneath it.
    const arranged = arrangeChildren([fullRow(8, 'table'), card(6, 'stats'), card(6, 'cards')], 0);
    expect(arranged).toEqual({ mode: 'columns', tracks: 'minmax(0, 6fr) minmax(0, 6fr)', fullRow: ['table'] });
    // A full-row child with a light columnable remainder keeps the flow —
    // the dominant full rows render whole-row and the remainder stacks
    // after them.
    expect(arrangeChildren([fullRow(20), card(4)], 0).mode).toBe('mixed');
    // A heavy columnable remainder still tabs the set.
    expect(arrangeChildren([fullRow(20), card(14)], 0).mode).toBe('tabs');
  });

  it('derives region data traits over the type record and pool', () => {
    const detail = regionDataTraits({
      surfaceKind: 'detail',
      type: { fields: { a: { base: 'string' }, b: { base: 'string' } } },
      instances: [{ relations: {} }]
    });
    expect(detail).toEqual({ weight: 2, breadth: 'content', volume: 1, shape: 'plain', filledness: 'filled', growth: 'flowing' });
    // The default list projection is the full-breadth, bounded-growth
    // table; the handful list is chip-scale and flowing.
    const tableTraits = count => regionDataTraits({
      surfaceKind: 'list',
      type: { fields: { a: { base: 'string' } } },
      instances: Array.from({ length: count }, (_, i) => ({ id: String(i), relations: {} }))
    });
    expect(tableTraits(6)).toEqual({ weight: 8, breadth: 'full', volume: 6, shape: 'plain', filledness: 'filled', growth: 'bounded' });
    expect(tableTraits(2).breadth).toBe('chip');
    expect(tableTraits(2).growth).toBe('flowing');
    expect(regionDataTraits({ surfaceKind: 'list', type: { fields: { a: { base: 'string' } } }, instances: [] }).filledness).toBe('inert');
    const mediaTraits = count => regionDataTraits({
      surfaceKind: 'list',
      type: { id: 'o', class: 'file', payload: { mime: ['image/png'], preview: 'image' }, fields: {} },
      instances: Array.from({ length: count }, (_, i) => ({ id: String(i), relations: {} }))
    });
    expect(mediaTraits(4)).toEqual({ weight: 18, breadth: 'content', volume: 4, shape: 'media', filledness: 'filled', growth: 'flowing' });
    expect(mediaTraits(11).growth).toBe('bounded');
  });

  it('resolves container traits from the measured width over the host profile', () => {
    expect(resolveContainerTraits({ widthRem: 70, hostKind: 'page' })).toEqual({ width: 'wide', widthRem: 70, height: 'flow', scroll: 'page', density: 1 });
    expect(resolveContainerTraits({ widthRem: 45, hostKind: 'pane' }).width).toBe('medium');
    expect(resolveContainerTraits({ widthRem: 12, hostKind: 'dialog' }).width).toBe('narrow');
    expect(resolveContainerTraits({ widthRem: 70, hostKind: 'pane' }).scroll).toBe('surface');
    expect(resolveContainerTraits({ hostKind: 'popup' }).width).toBe('narrow');
    expect(resolveContainerTraits({ widthRem: 45, hostKind: 'popup' }).width).toBe('medium');
    expect(resolveContainerTraits({ widthRem: 45, hostKind: 'unknown-host' }).height).toBe('flow');
    expect(resolveContainerTraits({ widthRem: 45, density: 2 }).density).toBe(2);
  });

  it('scales the record side column span with the children weight', () => {
    expect(regionSideSpanFor(1)).toBe(4);
    expect(regionSideSpanFor(4)).toBe(4);
    expect(regionSideSpanFor(5)).toBe(5);
    expect(regionSideSpanFor(10)).toBe(5);
    expect(regionSideSpanFor(11)).toBe(6);
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

describe('authored display vocabulary', () => {
  it('pins editor controls through descriptor control; display variants stay derived', () => {
    const descriptor = { base: 'string', control: 'Textarea' };
    expect(resolveFieldControl(descriptor, { variant: 'detail' }).component).toBe('Textarea');
    expect(resolveFieldControl({ base: 'string' }, { variant: 'detail' }).component).toBe('InputText');
    expect(resolveFieldControl(descriptor, { variant: 'row' }).component).toBe('ValueText');
  });
});

describe('instance-aware list controls', () => {
  const type = {
    id: 'probe',
    class: 'item',
    identifier: 'name',
    fields: {
      name: { base: 'string' },
      note: { base: 'string', multiline: true },
      size: { base: 'quantity', unit: 'mm' },
      grade: { base: 'enum', values: ['a', 'b', 'c'] },
      alwaysNull: { base: 'number' }
    }
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

  it('derives search keys, filled sort keys, facets, and budgets', () => {
    const controls = resolveListControls(type, instances);
    expect(controls.searchKeys).toEqual(['name']);
    // The identifier ('name') is the identity column — excluded from the
    // descriptor sort keys even though it is filled.
    expect(controls.sortKeys.map(key => key.name)).toEqual(['size', 'grade']);
    expect(controls.defaultSort).toBe('size');
    expect(controls.facets).toEqual([{ name: 'grade', label: 'Grade', values: ['a', 'b'] }]);
    expect(controls.pagination).toEqual({ paginateAt: 10, rows: 10, virtualizeAt: 50 });
  });

  it('drops unfilled sort keys entirely on empty collections', () => {
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
    a_transition: { id: 'a_transition', actionKind: 'updateInstance', typeId: 'document', trigger: { mode: 'manual' }, state: { to: 'archived' } },
    a_edit: { id: 'a_edit', actionKind: 'updateInstance', typeId: 'document', trigger: { mode: 'manual' } },
    a_auto: { id: 'a_auto', actionKind: 'updateInstance', typeId: 'document', trigger: { mode: 'event' }, state: { to: 'synced' } },
    a_delete: { id: 'a_delete', actionKind: 'deleteInstance', typeId: 'document', trigger: { mode: 'manual' } },
    a_link: { id: 'a_link', actionKind: 'link', typeId: 'document', trigger: { mode: 'manual' } },
    a_other: { id: 'a_other', actionKind: 'deleteInstance', typeId: 'sheet', trigger: { mode: 'manual' } }
  };

  it('keeps only manual per-instance deletions and commands for the type', () => {
    // Status transitions are per-instance machine facts, not type-level
    // actions, so they never ride this set.
    expect(resolveInstanceActions(actions, 'document').map(action => action.id)).toEqual(['a_delete']);
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
    identifier: 'code',
    fields: { code: { base: 'string' }, size: { base: 'quantity', unit: 'mm' } }
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

  it('matches facet value sets (in within a facet) and ignores empty selections', () => {
    const instance = { id: 'g1', type: 'gear', fields: { grade: 'a' } };
    expect(instanceMatchesToolbar(type, {}, instance, '', { grade: ['a', 'b'] })).toBe(true);
    expect(instanceMatchesToolbar(type, {}, instance, '', { grade: ['b', 'c'] })).toBe(false);
    expect(instanceMatchesToolbar(type, {}, instance, '', { grade: [] })).toBe(true);
    expect(instanceMatchesToolbar(type, {}, instance, '', { grade: null })).toBe(true);
    // The facet-selection contract is value arrays; a scalar is dropped as
    // a no-op — never a silent single-value fallback.
    expect(instanceMatchesToolbar(type, {}, instance, '', { grade: 'a' })).toBe(true);
    expect(instanceMatchesToolbar(type, {}, instance, '', { grade: 'b' })).toBe(true);
  });

  it('conjoins search with facet sets', () => {
    const instance = { id: 'g1', type: 'gear', fields: { name: 'Gear 1', grade: 'a' } };
    expect(instanceMatchesToolbar(type, { searchKeys: ['name'] }, instance, 'gear', { grade: ['a'] })).toBe(true);
    expect(instanceMatchesToolbar(type, { searchKeys: ['name'] }, instance, 'gear', { grade: ['b'] })).toBe(false);
    expect(instanceMatchesToolbar(type, { searchKeys: ['name'] }, instance, 'zzz', { grade: ['a'] })).toBe(false);
  });
});

describe('create dialog input resolution', () => {
  const bundle = {
    types: [
      {
        id: 't-bin-1',
        name: 'Bin',
        edges: { children: { tPart1Id: { types: ['t-part-1'] } } }
      },
      {
        id: 't-part-1',
        class: 'item',
        identifier: 'note',
        fields: { note: { base: 'string' }, width: { base: 'quantity', unit: 'mm' } }
      }
    ]
  };
  const type = bundle.types[1];

  it('maps flat-wire construction inputs onto declared fields', () => {
    const rows = resolveCreateDialogInputs(
      { construction: { inputs: ['fields.note', 'fields.width'] } },
      type,
      bundle
    );
    expect(rows.map(row => row.id)).toEqual(['fields.note', 'fields.width']);
    expect(rows[0]).toMatchObject({ label: 'Note', descriptor: { base: 'string' } });
    expect(rows[1]).toMatchObject({ descriptor: { base: 'quantity', unit: 'mm' } });
  });

  it('requires the identifier row and carries the compiled required flag', () => {
    // The naming law: the identifier row's value is the record's title,
    // so the create dialog never submits it empty — required regardless
    // of nullability, while every other row follows the compiled flag.
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: ['fields.note', 'fields.width'] },
        inputPolicy: {
          fields: [
            { id: 'fields.note', path: 'fields.note', type: 'string', required: false },
            { id: 'fields.width', path: 'fields.width', type: 'number', required: true }
          ]
        }
      },
      type,
      bundle
    );
    expect(rows[0]).toMatchObject({ required: true });
    expect(rows[1]).toMatchObject({ required: true });
    const unflagged = resolveCreateDialogInputs(
      { construction: { inputs: ['fields.width'] } },
      type,
      bundle
    );
    // The naming law derives the identifier row even when the construction
    // contract omits it (an upload constructor's inputs carry the file and
    // relations alone).
    expect(unflagged[0]).toMatchObject({ id: 'note', required: true });
    expect(unflagged[1]).toMatchObject({ id: 'fields.width', required: false });
  });

  it('derives the identifier row for a construction contract without one', () => {
    const rows = resolveCreateDialogInputs(
      { construction: { inputs: ['payload'] }, inputPolicy: { fields: [] } },
      type,
      bundle
    );
    expect(rows[0]).toMatchObject({ id: 'note', required: true, descriptor: { base: 'string' } });
    expect(rows.some(row => row.id === 'payload')).toBe(false);
  });

  it('resolves lineage inputs to parent pickers over reverse containment', () => {
    const rows = resolveCreateDialogInputs(
      { construction: { inputs: ['lineage.tPart1Id'] } },
      type,
      bundle
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'note', required: true });
    expect(rows[1]).toMatchObject({
      id: 'lineage.tPart1Id',
      label: 'Bin',
      lineage: { key: 'tPart1Id', accepts: ['t-bin-1'] }
    });
  });

  it('prompts a string protocol input as a full-width row carrying its control pin', () => {
    // The `content` creation protocol's text body: not a row field, so it
    // resolves through the input object itself, control pin riding the
    // descriptor (Textarea).
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: [{ id: 'content', path: 'content', type: 'string', required: true, control: 'Textarea' }] },
        inputPolicy: { fields: [] }
      },
      type,
      bundle
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'note', required: true });
    expect(rows[1]).toEqual({
      id: 'content',
      label: 'Content',
      descriptor: { base: 'string', control: 'Textarea' },
      span: 'full',
      required: true
    });
  });

  it('prompts a string protocol input arriving as a bare id', () => {
    // The served contract summarizes construction inputs to ids — the
    // same content body with its policy on the input policy resolves
    // the identical row instead of disappearing (a missing row takes
    // the no-rows shortcut and posts an empty draft).
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: ['content'] },
        inputPolicy: { fields: [{ id: 'content', path: 'content', type: 'string', required: true, label: 'Content', control: 'Textarea' }] }
      },
      type,
      bundle
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'note', required: true });
    expect(rows[1]).toEqual({
      id: 'content',
      label: 'Content',
      descriptor: { base: 'string', control: 'Textarea' },
      span: 'full',
      required: true
    });
  });

  it('matches reverse containment by the declared lineageKey, not the edge map key', () => {
    // Designer-authored children edges are keyed by authoring identity
    // (`t-part-1s`) and declare their storage key (`tBin1Id`) — the
    // picker must resolve through the declaration, or the lineage row
    // silently disappears and children never get a parent.
    const authoredBundle = {
      types: [
        {
          id: 't-bin-1',
          name: 'Bin',
          edges: { children: { 't-part-1s': { types: ['t-part-1'], lineageKey: 'tBin1Id' } } }
        },
        type
      ]
    };
    const rows = resolveCreateDialogInputs(
      { construction: { inputs: ['lineage.tBin1Id'] } },
      type,
      authoredBundle
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'note', required: true });
    expect(rows[1]).toMatchObject({ lineage: { key: 'tBin1Id', accepts: ['t-bin-1'] } });
  });

  it('emits file inputs as upload rows outside the row grammar', () => {
    // SPEC §4 payload path: the upload protocol's file input is not a
    // declared row field — it rides the FileUpload control instead of
    // resolving against fields or disappearing silently.
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: ['name', 'payload'] },
        inputPolicy: {
          fields: [
            { id: 'name', label: 'Name', path: 'name', type: 'string' },
            { id: 'payload', label: 'File', path: 'payload', type: 'file', required: true }
          ]
        }
      },
      type,
      bundle
    );
    expect(rows.map(row => row.id)).toEqual(['note', 'name', 'payload']);
    expect(rows[2]).toMatchObject({ label: 'File', descriptor: { base: 'blob' }, span: 'full', required: true });
  });

  it('keeps inputs that resolve to nothing hidden', () => {
    expect(resolveCreateDialogInputs(
      { construction: { inputs: ['templateId'] } },
      type,
      bundle
    ).map(row => row.id)).toEqual(['note']);
    expect(resolveCreateDialogInputs(
      { construction: { inputs: ['lineage.unknownId'] } },
      type,
      bundle
    ).map(row => row.id)).toEqual(['note']);
  });
});

describe('builder field derivation', () => {
  const documentType = {
    id: 'document', name: 'Document',
    fields: {
      title: { base: 'string', identifier: true },
      pages: { base: 'number' },
      grade: { base: 'enum', values: ['a', 'b'] },
      secret: { base: 'boolean' },
      madeAt: { base: 'instant' },
      graph: { base: 'json' }
    }
  };
  const folderType = {
    id: 'folder', name: 'Folder',
    fields: { label: { base: 'string' } },
    edges: { children: { docs: { types: ['document'], lineageKey: 'folderId' } } }
  };
  const sheetType = {
    id: 'sheet', name: 'Sheet',
    fields: { title: { base: 'string' } },
    edges: { relations: { pinned: { types: ['document'] } } }
  };
  const bundle = { types: [documentType, folderType, sheetType] };

  it('offers every scalar field plus the parent axis (declared by the parent)', () => {
    const fields = builderFieldsForType(documentType, { bundle });
    expect(fields.map(field => field.name)).toEqual([
      'title', 'pages', 'grade', 'secret', 'madeAt',
      'lineage.folderId.label'
    ]);
    expect(fields.find(field => field.name === 'grade')).toMatchObject({ kind: 'enum', values: ['a', 'b'] });
    expect(fields.find(field => field.name === 'pages').kind).toBe('number');
    expect(fields.find(field => field.name === 'secret').kind).toBe('boolean');
    expect(fields.find(field => field.name === 'madeAt').kind).toBe('instant');
    expect(fields.find(field => field.name === 'lineage.folderId.label')).toMatchObject({ kind: 'text', label: 'Folder → Label' });
  });

  it('offers the children axis (every child scalar) and the relation axis from own edges', () => {
    const fields = builderFieldsForType(folderType, { bundle });
    expect(fields.map(field => field.name)).toEqual([
      'label',
      'children.document.title', 'children.document.pages', 'children.document.grade', 'children.document.secret', 'children.document.madeAt'
    ]);
    expect(fields.find(field => field.name === 'children.document.title')).toMatchObject({ kind: 'text', label: 'Document → Title' });
    // relations are declared on the owner: the sheet's pinned documents
    const sheets = builderFieldsForType(sheetType, { bundle });
    expect(sheets.find(field => field.name === 'relations.pinned.title')).toMatchObject({ kind: 'text', label: 'Pinned → Title' });
  });

  it('returns direct fields alone without a bundle', () => {
    expect(builderFieldsForType(documentType).map(field => field.name)).toEqual(['title', 'pages', 'grade', 'secret', 'madeAt']);
  });
});
