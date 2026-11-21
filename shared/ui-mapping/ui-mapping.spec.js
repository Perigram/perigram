import { builderFieldsForType } from './index.js';
import { describe, it, expect } from 'vitest';
import {
  createUiMapping,
  formatValue,
  LAYOUT,
  LAYOUT_ATOMS,
  LAYOUT_AMBIENT,
  TYPE_BY_LEVEL,
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
  spacingCoefficientFor,
  SPACING_STEPS,
  SPACING_WEIGHT_AT,
  resolveFieldControl,
  resolveSurface,
  resolvePreview,
  RENDERABLE_PREVIEW_MODES,
  ASPECT_PREVIEW_MODES,
  resolveActionButton,
  resolveListLayout,
  listLayoutOf,
  tableColumnCount,
  cardFactCount,
  cardVariantFor,
  cardAnatomyFor,
  applyBudget,
  SEVERITY_MAP,
  ROW_FIELD_BUDGET,
  HEADER_ACTIONS_INLINE,
  VARIANTS,
  analyzeInstanceShape,
  resolveListControls,
  resolveInstanceActions,
  constructRerunAction,
  createActionControls,
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
  createDialogPayload,
  numericControlWrite,
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
    // SPEC §22.8: dashboard presentations match quantitative types
    // alone; plain types render values.
    expect(resolveFieldControl({ base: 'quantity', unit: 'percent' }, { variant: 'row' })).toMatchObject({
      component: 'QuantityText'
    });
    expect(resolveFieldControl({ base: 'quantity', unit: 'percent' }, { variant: 'row', quantitative: true })).toMatchObject({
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

  it('resolves list layouts from type shape and overrides', () => {
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
    expect(resolveListLayout(plain)).toBe('table');
    const mapping = createUiMapping({
      listLayouts: [{ match: { type: 'probe' }, layout: 'timeline' }]
    });
    expect(mapping.resolveListLayout({ id: 'probe', class: 'item', fields: plain.fields })).toBe('timeline');
  });

  it('keeps the table for identifier-only collections', () => {
    // SPEC §22.15: a collection with no data column beside identity keeps
    // the table — no projection degrades on unfilled data.
    const namesOnly = { class: 'item', identifier: 'name', fields: { name: { base: 'string' } } };
    expect(resolveListLayout(namesOnly)).toBe('table');
    expect(resolveListLayout(namesOnly, { stateful: true })).toBe('table');
  });

  it('derives relation columns display-aware: unfilled relations render no column', () => {
    const relational = { class: 'item', identifier: 'name', fields: { name: { base: 'string' } }, edges: { relations: { docs: { types: ['x'] } } } };
    const bare = Array.from({ length: 4 }, (_, i) => ({ id: String(i), fields: { name: `A${i}` }, relations: {} }));
    const filled = bare.map((instance, i) => (i === 0
      ? { ...instance, relations: { docs: [{ type: 'x', id: '9' }] } }
      : instance));
    expect(resolveListControls(relational, bare).relationColumn).toBe(null);
    expect(resolveListControls(relational, filled).relationColumn).toEqual({ key: 'docs' });
    expect(listLayoutOf({ surfaceKind: 'list', type: relational, instances: bare })).toBe('table');
    expect(listLayoutOf({ surfaceKind: 'list', type: relational, instances: filled })).toBe('table');
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
    expect(resolveListLayout(scheduled)).toBe('calendar');
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

  it('resolves prose, meters, sliders, and preview collections from shape', () => {
    expect(resolveFieldControl({ base: 'string', max: 400 }, { variant: 'row' })).toMatchObject({
      component: 'ProseText', span: 'full'
    });
    expect(resolveFieldControl({ base: 'map', itemType: { base: 'quantity', unit: 'percent' } }, { variant: 'row', quantitative: true })).toMatchObject({
      component: 'MeterGroup'
    });
    expect(resolveFieldControl({ base: 'map', itemType: { base: 'quantity', unit: 'percent' } }, { variant: 'row' })).toMatchObject({
      component: 'ObjectSummary'
    });
    expect(resolveFieldControl({ base: 'number', min: 0, max: 100 }, { variant: 'detail' })).toMatchObject({
      component: 'Slider'
    });
    expect(resolveFieldControl({ base: 'quantity', unit: 'mm', min: 0, max: 1000 }, { variant: 'detail' })).toMatchObject({
      component: 'Slider'
    });
    // Preview-dominant collections render the card grid (SPEC §22.8):
    // the carousel projection is retired, whatever the payload preview.
    const gallery = { class: 'file', payload: { preview: 'image' }, fields: { title: { base: 'string' } } };
    expect(resolveListLayout(gallery)).toBe('card-grid');
    expect(resolveListLayout(gallery, {})).toBe('card-grid');
    const attachments = { class: 'file', payload: { preview: 'attachment' }, fields: { title: { base: 'string' } } };
    expect(resolveListLayout(attachments)).toBe('card-grid');
  });

  it('edits maps as key-value rows and renders schemaless json read-only', () => {
    expect(resolveFieldControl({ base: 'map', itemType: { base: 'string' } }, { variant: 'detail' })).toMatchObject({
      component: 'MapEditor', span: 'full'
    });
    expect(resolveFieldControl({ base: 'json' }, { variant: 'detail' })).toMatchObject({
      component: 'ObjectSummary'
    });
    expect(resolveFieldControl({ base: 'record', fields: { a: { base: 'string' } } }, { variant: 'detail' })).toMatchObject({
      component: 'ObjectEditor'
    });
  });

  it('resolves ratings, charts, and order lists from shape', () => {
    expect(resolveFieldControl({ base: 'enum', values: ['p0', 'p1', 'p2', 'p3'] }, { variant: 'row', quantitative: true })).toMatchObject({
      component: 'Rating', span: 'full'
    });
    expect(resolveFieldControl({ base: 'enum', values: ['p0', 'p1', 'p2', 'p3'] }, { variant: 'row' })).toMatchObject({
      component: 'Tag'
    });
    expect(resolveFieldControl({ base: 'enum', values: ['red', 'green'] }, { variant: 'row' })).toMatchObject({
      component: 'Tag'
    });
    expect(resolveFieldControl({ base: 'map', itemType: { base: 'quantity', unit: 'count' } }, { variant: 'row', quantitative: true })).toMatchObject({
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

  it('derives the card anatomy from the type data shape', () => {
    const identifierOnly = { id: 'shot', identifier: 'name', fields: { name: { base: 'string', identifier: true } }, payload: { preview: 'image' } };
    expect(cardAnatomyFor(identifierOnly)).toBe('tile');
    const factful = {
      ...identifierOnly,
      fields: { name: { base: 'string', identifier: true }, pages: { base: 'number' } }
    };
    expect(cardAnatomyFor(factful)).toBe('side');
    expect(cardAnatomyFor({ ...identifierOnly, payload: { preview: 'download' } })).toBe('plain');
    expect(cardAnatomyFor({
      id: 'graph-document',
      identifier: 'name',
      fields: { name: { base: 'string', identifier: true }, graphId: { base: 'string', display: 'hidden' } },
      payload: { preview: 'graph' }
    })).toBe('tile');
    expect(cardAnatomyFor({ id: 'part', identifier: 'name', fields: { name: { base: 'string', identifier: true }, width: { base: 'number' } } })).toBe('plain');
    const declared = { id: 'design', identifier: 'name', fields: { name: { base: 'string', identifier: true } }, previewSource: { display: 'geometry' } };
    expect(cardAnatomyFor(declared)).toBe('tile');
    // Long text is prose, never a card fact: a preview type whose only
    // other field is long text stays the overlay tile.
    const prose = { ...identifierOnly, fields: { name: { base: 'string', identifier: true }, body: { base: 'string', multiline: true } } };
    expect(cardAnatomyFor(prose)).toBe('tile');
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

  it('keeps page-scale modes inside the renderable set', () => {
    for (const mode of ASPECT_PREVIEW_MODES) {
      expect(RENDERABLE_PREVIEW_MODES).toContain(mode);
    }
    expect(ASPECT_PREVIEW_MODES).toEqual(['pdf']);
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

  it('launches by the compiled input policy: fully graph-supplied creates run without a dialog', () => {
    expect(planActionLaunch({
      actionKind: 'createInstance',
      construction: { inputs: [{ id: 'fields.name' }, { id: 'fields.kind' }] },
      inputPolicy: { fields: [{ id: 'fields.kind', prompt: false }] }
    })).toBe('run');
    expect(planActionLaunch({
      actionKind: 'createInstance',
      construction: { inputs: [{ id: 'fields.name' }, { id: 'fields.kind' }] },
      inputPolicy: { fields: [{ id: 'fields.name', prompt: true }] }
    })).toBe('dialog');
  });

  it('counts graph-wired lineage axes as dialog rows; an authored default keeps one supplied', () => {
    // The wire source of a context-wired lineage socket is the launch
    // context, so the dialog collects the parent on every launch; an
    // authored socket default is a pinned parent and stays supplied.
    const wired = {
      actionKind: 'createInstance',
      construction: { inputs: [{ id: 'lineage.binId' }] },
      inputPolicy: { fields: [{ id: 'field:lineage.binId', path: 'lineage.binId', type: 'entity', typeId: 't-bin-1', prompt: false }] }
    };
    expect(planActionLaunch(wired)).toBe('dialog');
    const pinned = {
      actionKind: 'createInstance',
      construction: { inputs: [{ id: 'lineage.binId' }] },
      inputPolicy: { fields: [{ id: 'lineage.binId', path: 'lineage.binId', type: 'entity', typeId: 't-bin-1', prompt: false, default: 'b-1' }] }
    };
    expect(planActionLaunch(pinned)).toBe('run');
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

  it('derives the construct re-run from a derived record\'s provenance (SPEC §24)', () => {
    const actions = {
      fill: { id: 'fill', actionKind: 'createInstance', typeId: 'pdf-document', label: 'New Report from Fill', access: { level: 'write' } },
      other: { id: 'other', actionKind: 'deleteInstance', typeId: 'pdf-document' }
    };
    const rerun = constructRerunAction(actions, {
      type: 'pdf-document',
      provenance: { op: 'cts.construct:fill:fill', sources: [{ type: 'pdf-document', id: 't-1' }] }
    });
    expect(rerun).toMatchObject({
      id: 'fill:rerun',
      actionKind: 'rerunInstance',
      rerunOf: 'fill',
      rerun: true,
      typeId: 'pdf-document',
      labelKey: 'uiMapping.rederive'
    });
    // The stored inputs are the run's inputs: the re-run prompts nothing.
    expect(planActionLaunch(rerun)).toBe('run');
    expect(resolveActionButton(rerun)).toMatchObject({ component: 'Button', icon: 'pi pi-refresh', iconOnly: true, confirm: false });

    expect(constructRerunAction(actions, { type: 'pdf-document', provenance: { op: 'cts.mutate:n1' } })).toBeNull();
    expect(constructRerunAction(actions, null)).toBeNull();
    // The named construct must be a create of the record's own type.
    expect(constructRerunAction(actions, {
      type: 'text-document',
      provenance: { op: 'cts.construct:fill:fill', sources: [{ type: 'text-document', id: 't-1' }] }
    })).toBeNull();
    // Authored-content constructs (upload) carry no sources: replace owns
    // those records and the re-run row stays away.
    expect(constructRerunAction(actions, {
      type: 'pdf-document',
      provenance: { op: 'cts.construct:up:upload', sources: [] }
    })).toBeNull();
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

describe('create action controls', () => {
  const bake = { id: 'create_bake', actionKind: 'createInstance', typeId: 'cassette-design', construction: { mode: 'bake' } };
  const upload = { id: 'create_upload', actionKind: 'createInstance', typeId: 'cassette-design', construction: { mode: 'upload' } };
  const child = { id: 'create_child', actionKind: 'createInstance', typeId: 'panel' };
  const remove = { id: 'remove', actionKind: 'deleteInstance', typeId: 'cassette-design' };

  it('collapses same-type creates to one control carrying the sibling group', () => {
    const [control] = createActionControls([bake, upload, remove]);
    expect(control.action).toBe(bake);
    expect(control.group).toEqual([bake, upload]);
  });

  it('keeps one control per type in contract order', () => {
    const controls = createActionControls([child, bake, upload]);
    expect(controls.map(control => control.action.typeId)).toEqual(['panel', 'cassette-design']);
    expect(controls[0].group).toEqual([child]);
  });

  it('keeps a sole create as its own single-entry group', () => {
    const [control] = createActionControls([bake]);
    expect(control.group).toEqual([bake]);
  });

  it('drops actions that are not creates', () => {
    expect(createActionControls([remove])).toEqual([]);
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

  it('falls back to the edge map key when the edge authors no lineageKey', () => {
    const type = { edges: { children: { holds: { types: ['t-part-1'] } } } };
    const pool = {
      't-part-1': {
        nested: { id: 'nested', type: 't-part-1', lineage: { holds: { id: 'bin' } } },
        loose: { id: 'loose', type: 't-part-1', lineage: {} }
      }
    };
    expect(childrenOfParent(type, pool, 'bin').map(child => child.id)).toEqual(['nested']);
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
    expect(formatValue({ base: 'boolean' }, true)).toBe('true');
    expect(formatValue({ base: 'enum' }, 'h-alpha')).toBe('H Alpha');
    expect(formatValue({ base: 'list' }, [1, 2, 3])).toBe('3');
    expect(formatValue({ base: 'string' }, null)).toBe('—');
    expect(formatValue({}, '2026-11-12T17:00:00.000Z')).toBe(new Date('2026-11-12T17:00:00.000Z').toLocaleDateString());
    expect(formatValue({}, { fileId: 'gridfs-1' })).toBe('gridfs-1');
  });

  it('exposes the layout vocabulary as the single styling home', () => {
    for (const key of ['stack', 'stackTight', 'row', 'rowBetween', 'formGrid', 'factsGrid', 'bodyGrid', 'measure', 'packRow', 'scrollX', 'dialog']) {
      expect(LAYOUT[key], key).toBeTruthy();
    }
    // The record document's measure rides the design token, never a raw
    // width literal (SPEC §22.17): the recipe centers the column and caps
    // it at the token width.
    expect(LAYOUT.measure).toBe('mx-auto w-full max-w-[var(--ck-record-measure)]');
    // Card grids render through ResponsiveGrid.
    expect(LAYOUT.cardGrid).toBeUndefined();
  });

  it('keeps the record header on the named container recipe', () => {
    // No Tailwind container-query variants: the build has no
    // container-queries plugin, so any @container/@[w]: class compiles to
    // nothing. The responsive switch lives in the global stylesheet's
    // .ck-record-header recipe (main.css, beside the form/body grids);
    // the tokens name it and the header paints no box — the boxed
    // headerBar token stays retired. The level-0 title is the
    // container-stepped record-title role (1.5rem, stepped to 1.75rem
    // by the recipe's 34rem width step); the viewport-clamped
    // page-title belongs to real pages.
    expect(LAYOUT.headerBar).toBeUndefined();
    expect(LAYOUT.header).toBe('ck-record-header');
    expect(LAYOUT.headerRow).toBe('ck-record-header-row');
    expect(LAYOUT.headerIdentity).toBe('ck-record-header-identity');
    expect(TYPE_BY_LEVEL[0]).toBe('text-record-title');
    expect(LAYOUT.reloadBarUnder).toBeUndefined();
    expect(LAYOUT.reloadLane).toBe('h-1 shrink-0');
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
    expect(resolveFieldGroups({ fields: {
      a: { base: 'string' },
      stored: { base: 'string', display: 'hidden' }
    } })[0].fields.map(field => field.name)).toEqual(['a']);
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

  it('carries one arrangement outcome per width step', () => {
    // The composed tree is host-blind: every step resolves its own
    // outcome, and the materialization engages the one its host grants.
    const INSIDE_TABS = { narrow: true, medium: true, wide: true };
    const table = weight => ({ id: `t${weight}`, dataTraits: { breadth: 'full', weight } });
    const lightTables = arrangeChildren([table(10), table(10)]);
    // Full-breadth tables within the column cap stack at every step (the
    // row-cheapest layout); past the cap the set tabs (the page-height
    // bound) — at every step, whatever host carries it.
    expect(lightTables.narrow).toEqual({ mode: 'stack' });
    expect(lightTables.medium).toEqual({ mode: 'stack' });
    expect(lightTables.wide).toEqual({ mode: 'stack' });
    const heavyTables = arrangeChildren([table(16), table(14)]);
    expect(heavyTables.narrow.mode).toBe('tabs');
    expect(heavyTables.wide.mode).toBe('tabs');
    expect(heavyTables.wide.order).toEqual(['t16', 't14']);
    // A set inside a tab arrangement stacks — tabs sit one tab deep
    // (SPEC §22.1).
    expect(arrangeChildren([table(16), table(14)], INSIDE_TABS).wide.mode).toBe('stack');
    expect(arrangeChildren([{ ...detailNode(16), id: 'd' }]).wide).toEqual({ mode: 'stack' });
  });

  it('arranges siblings by weight: stack, proportional columns, dominant flow, weight-ordered tabs', () => {
    // Content-breadth lists (file-class card collections) with explicit
    // weights; table-breadth lists carry the full-row claim below.
    const card = (weight, id = 'c') => ({ id, dataTraits: { breadth: 'content', weight } });
    const detailOf = fields => ({
      id: 'big', surfaceKind: 'detail',
      type: { fields: Object.fromEntries(Array.from({ length: fields }, (_, i) => [`f${i}`, { base: 'string' }])) },
      instances: [{ relations: {} }]
    });
    // Light peers stack at narrow and share proportional columns at
    // medium/wide — track fr from each child's estimated rows, any peer
    // count (the measured engagement sheds tracks the host cannot grant).
    const light = arrangeChildren([card(4, 'a'), card(4, 'b')]);
    expect(light.narrow).toEqual({ mode: 'stack' });
    expect(light.medium).toEqual({ mode: 'columns', tracks: 'minmax(0, 4fr) minmax(0, 4fr)' });
    expect(light.wide).toEqual(light.medium);
    const four = arrangeChildren([card(3, 'a'), card(3, 'b'), card(3, 'c'), card(3, 'd')]);
    expect(four.medium.tracks.match(/minmax/g)).toHaveLength(4);
    expect(four.narrow.mode).toBe('stack');
    // A dominant sibling keeps the flow at every step; its remainder
    // carries its own stepped arrangement (light peers column beneath it).
    const dominant = arrangeChildren([detailOf(14), card(4, 'a'), card(4, 'b')]);
    expect(dominant.wide.mode).toBe('mixed');
    expect(dominant.wide.primary).toBe(0);
    expect(dominant.wide.rest.medium.mode).toBe('columns');
    expect(dominant.wide.rest.narrow).toEqual({ mode: 'stack' });
    // A dominant sibling whose remainder exceeds the surface budget tabs
    // the set — the page-height bound stays reachable for top-heavy sets.
    expect(arrangeChildren([detailOf(24), card(14, 'rest')]).wide.mode).toBe('tabs');
    // A peer past the column cap is unreadable in flow: the set tabs at
    // any tree level, ordered by descending weight; a set inside a tab
    // arrangement stacks (SPEC §22.1).
    const tabbed = arrangeChildren([card(12, 'light'), card(15, 'heavy')]);
    expect(tabbed.wide.mode).toBe('tabs');
    expect(tabbed.wide.order).toEqual(['heavy', 'light']);
    expect(arrangeChildren([card(14), card(14)]).wide.mode).toBe('tabs');
    expect(arrangeChildren([card(14), card(14)], { narrow: true, medium: true, wide: true }).wide.mode).toBe('stack');
  });

  it('grants full-breadth children the whole row beside column peers', () => {
    const card = (weight, id = 'c') => ({ id, dataTraits: { breadth: 'content', weight } });
    const fullRow = (weight, id = 't') => ({ id, dataTraits: { breadth: 'full', weight } });
    // A full-row sibling renders whole-row; the columnable peers share
    // the columns beneath it — at every step past narrow.
    const arranged = arrangeChildren([fullRow(8, 'table'), card(6, 'stats'), card(6, 'cards')]);
    expect(arranged.medium).toEqual({ mode: 'columns', tracks: 'minmax(0, 6fr) minmax(0, 6fr)', fullRow: ['table'] });
    expect(arranged.wide).toEqual(arranged.medium);
    expect(arranged.narrow).toEqual({ mode: 'stack' });
    // A full-row child with a light columnable remainder keeps the flow —
    // the dominant full rows render whole-row and the remainder stacks
    // after them.
    expect(arrangeChildren([fullRow(20), card(4)]).wide.mode).toBe('mixed');
    // A heavy columnable remainder still tabs the set.
    expect(arrangeChildren([fullRow(20), card(14)]).wide.mode).toBe('tabs');
  });

  it('derives region data traits over the type record and pool', () => {
    const detail = regionDataTraits({
      surfaceKind: 'detail',
      type: { fields: { a: { base: 'string' }, b: { base: 'string' } } },
      instances: [{ relations: {} }]
    });
    expect(detail).toEqual({ weight: 2, breadth: 'content', volume: 1, shape: 'plain', filledness: 'filled', growth: 'flowing' });
    // The default list projection is the full-breadth, bounded-growth
    // table. The instances fill the scalar field — a table derives over a
    // shown data column.
    const tableTraits = count => regionDataTraits({
      surfaceKind: 'list',
      type: { fields: { a: { base: 'string' } } },
      instances: Array.from({ length: count }, (_, i) => ({ id: String(i), fields: { a: `v${i}` }, relations: {} }))
    });
    expect(tableTraits(6)).toEqual({ weight: 8, breadth: 'full', volume: 6, shape: 'plain', filledness: 'filled', growth: 'bounded' });
    // A small filled collection keeps the table projection.
    expect(tableTraits(2).breadth).toBe('full');
    expect(tableTraits(2).growth).toBe('bounded');
    // No filled non-identifier scalar: the table stays the table (SPEC
    // §22.15) — no projection degrades on unfilled data.
    expect(regionDataTraits({
      surfaceKind: 'list',
      type: { fields: { a: { base: 'string' } } },
      instances: Array.from({ length: 6 }, (_, i) => ({ id: String(i), relations: {} }))
    })).toMatchObject({ breadth: 'full', growth: 'bounded' });
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
    expect(resolveContainerTraits({ widthRem: 70, hostKind: 'page' })).toEqual({ hostKind: 'page', width: 'wide', widthRem: 70, height: 'flow', scroll: 'page', density: 1 });
    expect(resolveContainerTraits({ widthRem: 45, hostKind: 'pane' }).width).toBe('medium');
    expect(resolveContainerTraits({ widthRem: 12, hostKind: 'dialog' }).width).toBe('narrow');
    expect(resolveContainerTraits({ widthRem: 70, hostKind: 'pane' }).scroll).toBe('surface');
    expect(resolveContainerTraits({ hostKind: 'popup' }).width).toBe('narrow');
    expect(resolveContainerTraits({ widthRem: 45, hostKind: 'popup' }).width).toBe('medium');
    expect(resolveContainerTraits({ widthRem: 45, hostKind: 'unknown-host' }).height).toBe('flow');
    expect(resolveContainerTraits({ widthRem: 45, density: 2 }).density).toBe(2);
    // Density derives from the host profile alone: bounded hosts — panes,
    // popups — ride the compact tier; reading hosts keep the page rhythm
    // at any width.
    expect(resolveContainerTraits({ hostKind: 'popup' }).density).toBe(0.75);
    expect(resolveContainerTraits({ hostKind: 'dialog' }).density).toBe(1);
    expect(resolveContainerTraits({ hostKind: 'pane' }).density).toBe(0.75);
    expect(resolveContainerTraits({ widthRem: 24, hostKind: 'page' }).density).toBe(1);
    expect(resolveContainerTraits({ widthRem: 70, hostKind: 'page' }).density).toBe(1);
    // A placement box measures its own width and inherits the host's
    // height/scroll and density unchanged.
    expect(resolveContainerTraits({ widthRem: 24, height: 'bounded', scroll: 'surface', density: 0.75 }))
      .toEqual({ hostKind: 'page', width: 'narrow', widthRem: 24, height: 'bounded', scroll: 'surface', density: 0.75 });
    expect(resolveContainerTraits({ widthRem: 45, height: 'bounded', scroll: 'surface', density: 1 }).density).toBe(1);
    // The resolved record names its host: popup-hosted surfaces read it
    // to keep their bounded presentations.
    expect(resolveContainerTraits({ hostKind: 'popup' }).hostKind).toBe('popup');
  });

  it('derives the rhythm coefficient from host context and screen weight', () => {
    const page = { density: 1 };
    const pane = { density: 0.75 };
    expect(spacingCoefficientFor(page, 4)).toBe(1);
    expect(spacingCoefficientFor(pane, 4)).toBe(0.75);
    // SPEC §22.8: page hosts keep their rhythm at any weight; heavy
    // bounded hosts tighten one step, floored at the tightest.
    expect(spacingCoefficientFor(page, SPACING_WEIGHT_AT + 1)).toBe(1);
    expect(spacingCoefficientFor(pane, SPACING_WEIGHT_AT + 1)).toBe(0.5);
    expect(spacingCoefficientFor({}, 0)).toBe(1);
  });

  it('scales the record side column span with the children weight', () => {
    expect(regionSideSpanFor(1)).toBe(3);
    expect(regionSideSpanFor(8)).toBe(3);
    expect(regionSideSpanFor(9)).toBe(4);
    expect(regionSideSpanFor(10)).toBe(4);
  });

  it('pins the layout-language vocabulary closed over LAYOUT', () => {
    // SPEC → Layout language: every LAYOUT recipe registers under
    // exactly one atom or ambient set, and the atom set is the
    // nine-atom vocabulary.
    const registered = [...Object.values(LAYOUT_ATOMS), ...Object.values(LAYOUT_AMBIENT)].flat();
    expect(new Set(registered).size).toBe(registered.length);
    expect(Object.keys(LAYOUT).sort()).toEqual([...new Set(registered)].sort());
    expect(Object.keys(LAYOUT_ATOMS).sort())
      .toEqual(['band', 'grid', 'pack', 'placement', 'row', 'stack', 'stub', 'tabs', 'well']);
  });
});

describe('shared vocabulary', () => {
  it('exposes the shared severity vocabulary and row field budget', () => {
    expect(SEVERITY_MAP.danger).toBe('danger');
    expect(ROW_FIELD_BUDGET).toEqual({ max: 1, overflow: 'count' });
    expect(HEADER_ACTIONS_INLINE).toBe(2);
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
    expect(controls.pagination).toEqual({ paginateAt: 10, rows: 10 });
    // No declared relation: no relation column.
    expect(controls.relationColumn).toBeNull();
  });

  it('carries the relation column only when a loaded instance fills it', () => {
    const relational = { ...type, edges: { relations: { docs: { types: ['x'] } } } };
    expect(resolveListControls(relational, instances).relationColumn).toBeNull();
    expect(resolveListControls(relational, [
      ...instances,
      { id: '4', fields: { name: 'D' }, relations: { docs: [{ type: 'x', id: '9' }] } }
    ]).relationColumn).toEqual({ key: 'docs' });
  });

  it('counts a declared ref field as the relation column — either stored block fills it', () => {
    // SPEC §6 relation grammar: a declared ref field is a relation entry;
    // its value stores scalarized under `fields` or as ref objects under
    // `relations`.
    const refField = { class: 'item', identifier: 'name', fields: {
      name: { base: 'string' },
      table: { base: 'ref', accepts: ['workbook'] }
    } };
    const bare = [
      { id: '1', fields: { name: 'A', table: 'wb-9' }, relations: {} },
      { id: '2', fields: { name: 'B', table: null }, relations: {} }
    ];
    const asRefs = [
      { id: '1', fields: { name: 'A' }, relations: { table: [{ type: 'workbook', id: '9' }] } },
      { id: '2', fields: { name: 'B' }, relations: {} }
    ];
    expect(resolveListControls(refField, asRefs).relationColumn).toEqual({ key: 'table' });
    expect(resolveListControls(refField, bare).relationColumn).toEqual({ key: 'table' });
    expect(resolveListControls(refField, asRefs.map(row => ({ ...row, relations: {} }))).relationColumn).toBeNull();
    expect(listLayoutOf({ surfaceKind: 'list', type: refField, instances: asRefs })).toBe('table');
    expect(listLayoutOf({ surfaceKind: 'list', type: refField, instances: bare })).toBe('table');
    // SPEC §22.15: an unfilled pool keeps the table — no projection
    // degrades on empty data.
    expect(listLayoutOf({ surfaceKind: 'list', type: refField, instances: asRefs.map(row => ({ ...row, relations: {} })) })).toBe('table');
  });

  it('carries the structural summary column for a filled json/record/map field', () => {
    const structural = { class: 'item', identifier: 'label', fields: {
      label: { base: 'string' },
      result: { base: 'json' }
    } };
    const rows = instance => [{ id: '1', fields: { label: 'A', ...(instance ? { result: { layouts: [1] } } : { result: null }) }, relations: {} }];
    expect(resolveListControls(structural, rows(true)).summaryColumn).toEqual({ key: 'result' });
    expect(resolveListControls(structural, rows(false)).summaryColumn).toBeNull();
    expect(resolveListControls(structural, [{ id: '1', fields: { label: 'A', result: {} }, relations: {} }]).summaryColumn).toBeNull();
    expect(listLayoutOf({ surfaceKind: 'list', type: structural, instances: rows(true) })).toBe('table');
    expect(listLayoutOf({ surfaceKind: 'list', type: structural, instances: rows(false) })).toBe('table');
  });

  it('carries one children column per declared edge, filled edges only', () => {
    const parentType = { class: 'group', identifier: 'name', fields: { name: { base: 'string', identifier: true } }, edges: {
      children: {
        kids: { types: ['kid'], onRemove: 'restrict', lineageKey: 'parentId' },
        juniors: { types: ['junior'], onRemove: 'restrict', lineageKey: 'parentId' }
      }
    } };
    const rows = [
      { id: 'p1', fields: { name: 'A' }, relations: {} },
      { id: 'p2', fields: { name: 'B' }, relations: {} }
    ];
    const poolWithKids = {
      kid: { k1: { id: 'k1', type: 'kid', fields: { label: 'One' }, lineage: { parentId: { type: 'parent', id: 'p1' } }, relations: {} } },
      junior: { j1: { id: 'j1', type: 'junior', fields: { label: 'Jun' }, lineage: { parentId: 'p2' }, relations: {} } }
    };
    const controls = resolveListControls(parentType, rows, { pool: poolWithKids });
    expect(controls.childrenColumns).toEqual([
      { key: 'kids', types: ['kid'] },
      { key: 'juniors', types: ['junior'] }
    ]);
    // An edge whose children nothing fills renders no column.
    const kidOnly = resolveListControls(parentType, rows, { pool: { kid: poolWithKids.kid } });
    expect(kidOnly.childrenColumns).toEqual([{ key: 'kids', types: ['kid'] }]);
    expect(resolveListControls(parentType, rows, { pool: {} }).childrenColumns).toEqual([]);
    // Children are data: a loaded child earns the table.
    expect(listLayoutOf({ surfaceKind: 'list', type: parentType, instances: rows, listControls: controls })).toBe('table');
  });

  it('treats a null-valued quantity as unfilled — it renders the dash', () => {
    const withNull = analyzeInstanceShape(
      { fields: { size: { base: 'quantity', unit: 'mm' }, grade: { base: 'enum', values: ['a'] } } },
      [{ fields: { size: { value: null, unit: 'mm' }, grade: 'a' } }]
    );
    expect(withNull.filledScalarNames).toEqual(['grade']);
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

  it('maps the block-composed field: id shape onto declared fields', () => {
    // The block-composed policy carries `field:`-prefixed ids with the
    // wire path on `path`; the row id and draft key are the wire path.
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: ['fields.note'] },
        inputPolicy: { fields: [{ id: 'field:fields.note', path: 'fields.note', type: 'string', prompt: true, required: false }] }
      },
      type,
      bundle
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'fields.note', label: 'Note', descriptor: { base: 'string' } });
  });

  it('scalarizes the draft at the boundary: quantity drafts by value, picker refs by id, files as the payload object', () => {
    expect(createDialogPayload({
      'fields.width': { value: 12, unit: 'mm' },
      'fields.count': { value: 3 },
      'fields.table': { type: 'workbook', id: 'wb-1' },
      'fields.parts': { type: 'workbook', id: 'wb-2', spot: 'a1' },
      payload: { fileId: 'f-1', mime: 'text/csv' }
    })).toEqual({
      'fields.width': 12,
      'fields.count': 3,
      'fields.table': 'wb-1',
      'fields.parts': { id: 'wb-2', spot: 'a1' },
      payload: { fileId: 'f-1', mime: 'text/csv' }
    });
  });

  it('keeps numeric drafts lawful: quantity wraps, number stays scalar', () => {
    const quantity = { base: 'quantity', unit: 'mm' };
    const number = { base: 'number' };
    expect(numericControlWrite(quantity, null, 12)).toEqual({ value: 12, unit: 'mm' });
    expect(numericControlWrite(number, null, 12)).toBe(12);
    expect(numericControlWrite(number, 3, 7)).toBe(7);
    expect(numericControlWrite(quantity, { value: 3, unit: 'mm' }, 7)).toEqual({ value: 7, unit: 'mm' });
  });

  it('renders operator reference prompts as instance pickers', () => {
    const rows = resolveCreateDialogInputs(
      {
        construction: { mode: 'place', inputs: ['name', 'template', 'parts'] },
        inputPolicy: {
          fields: [
            { id: 'name', path: 'name', type: 'string', prompt: true, required: false },
            { id: 'template', path: 'template', type: 'entity', prompt: true, required: true, typeId: 't-part-1' },
            { id: 'parts', path: 'parts', type: 'typeList', prompt: true, required: true, typeId: 't-part-1' }
          ]
        }
      },
      type,
      bundle
    );
    const byId = new Map(rows.map(row => [row.id, row]));
    expect(byId.get('template')).toMatchObject({
      descriptor: { base: 'ref', accepts: ['t-part-1'] },
      required: true
    });
    expect(byId.get('parts')).toMatchObject({
      descriptor: { base: 'list', itemType: { base: 'ref' }, accepts: ['t-part-1'] },
      required: true
    });
  });

  it('carries a ref input\'s control pin onto its row (the spot-parts assignment)', () => {
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: ['template', 'parts'] },
        inputPolicy: {
          fields: [
            { id: 'template', path: 'template', type: 'entity', prompt: true, typeId: 't-part-1' },
            { id: 'parts', path: 'parts', type: 'typeList', prompt: true, typeId: 't-part-1', control: 'spot-parts' }
          ]
        }
      },
      type,
      bundle
    );
    const byId = new Map(rows.map(row => [row.id, row]));
    expect(byId.get('parts').control).toBe('spot-parts');
    expect(byId.get('template').control).toBeUndefined();
  });

  it('keeps graph-supplied fields out of the dialog: the policy owns the rows', () => {
    // The compiled shape: fields.width is wired upstream and drops out of
    // the policy while construction.inputs restates the whole contract.
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: [{ id: 'fields.note' }, { id: 'fields.width' }] },
        inputPolicy: {
          fields: [{ id: 'fields.note', path: 'fields.note', type: 'string', prompt: true }]
        }
      },
      type,
      bundle
    );
    expect(rows.map(row => row.id)).toEqual(['fields.note']);
  });

  it('keeps graph-wired lineage axes as rows the launch context owns', () => {
    // A lineage socket wired to the launch context is unsupplied on a
    // contextless launch: the row stays and the compiled required flag
    // rides, so the created record always lands under a parent. The
    // block-composed id shape (`field:`-prefixed) maps onto its wire
    // path — the row id and draft key.
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: [{ id: 'lineage.tPart1Id' }] },
        inputPolicy: {
          fields: [{ id: 'field:lineage.tPart1Id', path: 'lineage.tPart1Id', type: 'entity', typeId: 't-bin-1', required: true, prompt: false }]
        }
      },
      type,
      bundle
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'lineage.tPart1Id', lineage: { key: 'tPart1Id', accepts: ['t-bin-1'] }, required: true });
  });

  it('keeps an authored-default lineage axis supplied and out of the dialog', () => {
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: [{ id: 'lineage.tPart1Id' }] },
        inputPolicy: {
          fields: [{ id: 'lineage.tPart1Id', path: 'lineage.tPart1Id', type: 'entity', typeId: 't-bin-1', prompt: false, default: 'bin-1' }]
        }
      },
      type,
      bundle
    );
    expect(rows).toEqual([]);
  });

  it('falls back to the declared input type when no bundle edge carries the lineage key', () => {
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: [{ id: 'lineage.binId' }] },
        inputPolicy: {
          fields: [{ id: 'lineage.binId', path: 'lineage.binId', type: 'entity', typeId: 't-bin-1', prompt: true }]
        }
      },
      type,
      bundle
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lineage: { key: 'binId', accepts: ['t-bin-1'] } });
  });

  it('binds the parent through the served exposure inputs when the bundle declares no children edge', () => {
    // Graph-wired containment: the policy field carries no per-input
    // typeId and the bundle's children edges never name the pair — the
    // exposure inputs (and a parent-bound create's parentTypeId) carry
    // the parent type, keeping the row a context-seedable lineage picker
    // instead of a context-free entity picker.
    const graphWiredBundle = {
      types: [
        { id: 'queue', name: 'Queue' },
        { id: 'queue-entry', class: 'item', fields: { name: { base: 'string' } } }
      ]
    };
    const action = {
      actionKind: 'createInstance',
      typeId: 'queue-entry',
      parentTypeId: 'queue',
      inputs: [{ id: 'parent', label: 'queue', typeId: 'queue', required: false }],
      construction: { inputs: ['lineage.queueId'] },
      inputPolicy: { fields: [{ id: 'lineage.queueId', path: 'lineage.queueId', type: 'entity', prompt: true }] }
    };
    const rows = resolveCreateDialogInputs(action, graphWiredBundle.types[1], graphWiredBundle);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'lineage.queueId',
      label: 'Queue',
      lineage: { key: 'queueId', accepts: ['queue'] }
    });
  });

  it('resolves each lineage axis through its own exposure input alone', () => {
    const twoAxisBundle = {
      types: [
        { id: 'queue', name: 'Queue' },
        { id: 'project', name: 'Project' },
        { id: 'queue-entry', class: 'item', fields: { name: { base: 'string' } } }
      ]
    };
    const action = {
      actionKind: 'createInstance',
      typeId: 'queue-entry',
      inputs: [
        { id: 'lineage.queueId', path: 'lineage.queueId', type: 'entity', typeId: 'queue' },
        { id: 'lineage.projectId', path: 'lineage.projectId', type: 'entity', typeId: 'project' }
      ],
      construction: { inputs: ['lineage.queueId', 'lineage.projectId'] },
      inputPolicy: { fields: [
        { id: 'lineage.queueId', path: 'lineage.queueId', type: 'entity', prompt: true },
        { id: 'lineage.projectId', path: 'lineage.projectId', type: 'entity', prompt: true }
      ] }
    };
    const rows = resolveCreateDialogInputs(action, twoAxisBundle.types[2], twoAxisBundle);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ lineage: { key: 'queueId', accepts: ['queue'] } });
    expect(rows[1]).toMatchObject({ lineage: { key: 'projectId', accepts: ['project'] } });
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
    // Rows come from the contract alone: an identifier row the contract
    // omits stays out of the dialog.
    expect(unflagged).toHaveLength(1);
    expect(unflagged[0]).toMatchObject({ id: 'fields.width', required: false });
  });

  it('prompts only the contract rows: no row derives beyond the contract', () => {
    const rows = resolveCreateDialogInputs(
      { construction: { inputs: ['payload'] }, inputPolicy: { fields: [] } },
      type,
      bundle
    );
    expect(rows).toEqual([]);
  });

  it('resolves lineage inputs to parent pickers over reverse containment', () => {
    const rows = resolveCreateDialogInputs(
      { construction: { inputs: ['lineage.tPart1Id'] } },
      type,
      bundle
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'lineage.tPart1Id',
      label: 'Bin',
      lineage: { key: 'tPart1Id', accepts: ['t-bin-1'] }
    });
  });

  it('keeps the lineage binding on entity-typed policy fields (the served compiled shape)', () => {
    // The compiler types lineage inputs `entity` on the served policy:
    // the containment binding must survive, or the launch context can
    // seed and hide the row inside the parent's surface.
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: ['lineage.tPart1Id'] },
        inputPolicy: {
          fields: [{ id: 'lineage.tPart1Id', path: 'lineage.tPart1Id', type: 'entity', typeId: 't-bin-1', required: false, prompt: true }]
        }
      },
      type,
      bundle
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'lineage.tPart1Id', lineage: { key: 'tPart1Id', accepts: ['t-bin-1'] } });
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
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
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
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
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
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lineage: { key: 'tBin1Id', accepts: ['t-bin-1'] } });
  });

  it('emits file inputs as upload rows outside the row grammar', () => {
    // SPEC §4 payload path: the upload protocol's file input is not a
    // declared row field — it rides the FileUpload control instead of
    // resolving against fields or disappearing silently.
    const rows = resolveCreateDialogInputs(
      {
        construction: { inputs: ['payload'] },
        inputPolicy: {
          fields: [
            { id: 'payload', label: 'File', path: 'payload', type: 'file', required: true }
          ]
        }
      },
      type,
      bundle
    );
    expect(rows.map(row => row.id)).toEqual(['payload']);
    expect(rows[0]).toMatchObject({ label: 'File', descriptor: { base: 'blob' }, span: 'full', required: true });
  });

  it('keeps inputs that resolve to nothing hidden', () => {
    expect(resolveCreateDialogInputs(
      { construction: { inputs: ['templateId'] } },
      type,
      bundle
    ).map(row => row.id)).toEqual([]);
    expect(resolveCreateDialogInputs(
      { construction: { inputs: ['lineage.unknownId'] } },
      type,
      bundle
    ).map(row => row.id)).toEqual([]);
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
