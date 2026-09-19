// Synthetic UI-mapping fixtures: a theoretical complex compiler output for
// a deliberately fictional observatory domain — no real-world hierarchy or
// construction semantics, only shapes chosen to exercise the mapping: every
// field base and qualifier, all four declarable classes, all three preview
// modes, deep multi-level lineage, single and array relations, and screens
// that force every layout (tables, media card grids, tabbed child regions,
// hierarchy trees, state strips). Pure factory data; never copied from
// production records.
//
// Consumed by pages/test/ui-mapping.vue and the specs beside it; the mapping
// contract itself lives in shared/ui-mapping (README.md there is canonical).

const ORGANIZATION_ID = 'org-fixture';

// --- CTS client bundle --------------------------------------------------------

function typeRecord(declaration) {
  return {
    id: declaration.id,
    class: declaration.class,
    scope: declaration.scope || 'system',
    version: declaration.version || 1,
    fields: declaration.fields || {},
    payload: declaration.payload || null,
    edges: declaration.edges || {},
    states: declaration.states || {},
    transitions: declaration.transitions || [],
    operators: declaration.operators || {},
    revisions: declaration.revisions || null,
    schema: null,
    render: declaration.render
  };
}

export function createUiMappingClientBundle() {
  return {
    ok: true,
    errors: [],
    organizationId: ORGANIZATION_ID,
    types: [
      typeRecord({
        id: 'constellation',
        class: 'group',
        fields: {
          name: { base: 'string', label: 'Name' },
          catalogCode: { base: 'string', label: 'Catalog code' },
          declination: { base: 'quantity', unit: 'deg', label: 'Declination' }
        },
        edges: { children: { systems: { types: ['star_system'], onRemove: 'restrict' } } },
        render: { label: 'Constellation', icon: 'pi pi-star' }
      }),
      typeRecord({
        id: 'star_system',
        class: 'group',
        fields: {
          designation: { base: 'string', label: 'Designation' },
          starCount: { base: 'quantity', unit: 'count', label: 'Stars' },
          metallicity: { base: 'quantity', unit: 'percent', label: 'Metallicity' },
          ageMyr: { base: 'quantity', unit: 'count', label: 'Age (Myr)' }
        },
        edges: { children: { probes: { types: ['probe'], onRemove: 'restrict' } } },
        render: { label: 'Star system', icon: 'pi pi-globe' }
      }),
      typeRecord({
        id: 'probe',
        class: 'item',
        fields: {
          serial: { base: 'string', label: 'Serial' },
          band: { base: 'enum', values: ['X', 'Y', 'K'], label: 'Band' },
          signal: { base: 'quantity', unit: 'percent', label: 'Signal' },
          inclination: { base: 'quantity', unit: 'deg', label: 'Inclination' },
          orbitNumber: { base: 'quantity', unit: 'count', label: 'Orbit no.' },
          insuranceValue: { base: 'quantity', unit: 'currency', label: 'Insured value' },
          uptime: { base: 'quantity', unit: 'min', label: 'Uptime' },
          active: { base: 'boolean', label: 'Active' },
          launchedAt: { base: 'instant', nullable: true, label: 'Launched' },
          specification: {
            base: 'record',
            label: 'Specification',
            fields: {
              massG: { base: 'quantity', unit: 'count', label: 'Mass (g)' },
              powerW: { base: 'quantity', unit: 'count', label: 'Power (W)' }
            }
          },
          tags: { base: 'list', itemType: { base: 'string' }, label: 'Tags' },
          homeSystem: { base: 'ref', accepts: ['star_system'], label: 'Home system' },
          manifestBlob: { base: 'blob', label: 'Manifest' }
        },
        edges: {
          relations: {
            observations: { types: ['observation'], onRemove: 'detach' },
            spectrum: { types: ['spectrum'], onRemove: 'detach' },
            logs: { types: ['log_entry'], onRemove: 'detach' }
          }
        },
        states: {
          main: { initial: 'idle', values: ['idle', 'active', 'maintenance', 'retired'], terminal: ['retired'] }
        },
        transitions: [
          { from: 'idle', to: 'active', intent: 'launchProbe' },
          { from: 'active', to: 'maintenance' },
          { from: 'maintenance', to: 'active' },
          { from: 'active', to: 'retired', intent: 'retireProbe' },
          { from: 'idle', to: 'retired' }
        ],
        render: {
          label: 'Probe',
          icon: 'pi pi-send',
          states: { active: { severity: 'info' }, maintenance: { severity: 'warning' }, retired: { severity: 'secondary' } }
        }
      }),
      typeRecord({
        id: 'observation',
        class: 'file',
        payload: {
          mime: ['image/png'],
          accept: ['.png'],
          maxSize: 25 * 1024 * 1024,
          preview: 'image'
        },
        fields: {
          exposure: { base: 'quantity', unit: 'min', label: 'Exposure' },
          frameCount: { base: 'number', label: 'Frames' },
          filter: { base: 'enum', values: ['H-alpha', 'O-III', 'IR'], label: 'Filter' },
          note: { base: 'string', max: 400, label: 'Note' }
        },
        render: { label: 'Observation', icon: 'pi pi-image' }
      }),
      typeRecord({
        id: 'spectrum',
        class: 'file',
        payload: { mime: ['application/x-spectrum'], accept: ['.spec'], preview: 'geometry' },
        fields: {
          resolution: { base: 'quantity', unit: 'count', label: 'Resolution' },
          calibrated: { base: 'boolean', label: 'Calibrated' }
        },
        render: { label: 'Spectrum', icon: 'pi pi-wave-pulse' }
      }),
      typeRecord({
        id: 'log_entry',
        class: 'file',
        payload: { mime: ['text/plain'], accept: ['.txt'], maxSize: 1024 * 1024, preview: 'attachment' },
        fields: { entry: { base: 'string', max: 600, label: 'Entry' } },
        render: { label: 'Log entry', icon: 'pi pi-file-edit' }
      }),
      typeRecord({
        id: 'survey_mission',
        class: 'process',
        fields: {
          objective: { base: 'string', max: 500, label: 'Objective' },
          priority: {
            base: 'enum',
            label: 'Priority',
            values: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']
          },
          target: { base: 'ref', accepts: ['constellation'], label: 'Target' },
          crewTags: { base: 'list', itemType: { base: 'string' }, label: 'Crew tags' },
          checklist: {
            base: 'list',
            itemType: { base: 'record', fields: { step: { base: 'string', label: 'Step' }, done: { base: 'boolean', label: 'Done' } } },
            label: 'Checklist'
          },
          telemetry: { base: 'map', itemType: { base: 'quantity', unit: 'deg' }, label: 'Telemetry' },
          config: {
            base: 'variant',
            label: 'Config',
            tags: ['fixed', 'adaptive', 'manual'],
            payloads: {
              fixed: { base: 'record', fields: { windowMin: { base: 'quantity', unit: 'min' } } },
              adaptive: { base: 'record', fields: { sensitivityPercent: { base: 'quantity', unit: 'percent' } } },
              manual: { base: 'string' }
            }
          },
          calibrationDump: { base: 'json', label: 'Calibration dump' }
        },
        edges: { relations: { probes: { types: ['probe'], onRemove: 'detach' } } },
        states: {
          main: { initial: 'planned', values: ['planned', 'running', 'analyzing', 'complete', 'failed'], terminal: ['complete', 'failed'] }
        },
        transitions: [
          { from: 'planned', to: 'running', intent: 'startMission' },
          { from: 'running', to: 'analyzing' },
          { from: 'analyzing', to: 'complete', intent: 'finishMission' },
          { from: 'running', to: 'failed' },
          { from: 'analyzing', to: 'failed' }
        ],
        render: {
          label: 'Survey mission',
          icon: 'pi pi-slack',
          states: { running: { severity: 'info' }, analyzing: { severity: 'info' }, complete: { severity: 'success' }, failed: { severity: 'danger' } }
        }
      })
    ]
  };
}

// --- Compiled process contract -------------------------------------------------

export function createUiMappingCompiledContract() {
  const actions = {
    probe_create: {
      id: 'probe_create',
      label: 'Create probe',
      actionKind: 'createEntity',
      entityType: 'probe',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      construction: { mode: 'generic', inputs: ['serial', 'band', 'signal'] }
    },
    probe_update: {
      id: 'probe_update',
      label: 'Edit probe',
      actionKind: 'updateEntity',
      entityType: 'probe',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    probe_launch: {
      id: 'probe_launch',
      label: 'Launch',
      actionKind: 'updateEntity',
      entityType: 'probe',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      status: { to: 'active' }
    },
    probe_retire: {
      id: 'probe_retire',
      label: 'Retire',
      actionKind: 'updateEntity',
      entityType: 'probe',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      status: { to: 'retired' }
    },
    probe_delete: {
      id: 'probe_delete',
      label: 'Delete probe',
      actionKind: 'deleteEntity',
      entityType: 'probe',
      trigger: { mode: 'manual' },
      access: { level: 'admin', grants: [] }
    },
    observation_link: {
      id: 'observation_link',
      label: 'Observation',
      actionKind: 'link',
      entityType: 'probe',
      relation: { key: 'observations', targetType: 'observation', cardinality: 'array' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    observation_unlink: {
      id: 'observation_unlink',
      label: 'Unlink observation',
      actionKind: 'unlink',
      entityType: 'probe',
      relation: { key: 'observations', targetType: 'observation', cardinality: 'array' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    mission_analyze: {
      id: 'mission_analyze',
      label: 'Run analysis',
      actionKind: 'runCommand',
      commandId: 'mission.analyze',
      entityType: 'survey_mission',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    probe_auto_index: {
      id: 'probe_auto_index',
      label: 'Index probe',
      actionKind: 'updateEntity',
      entityType: 'probe',
      trigger: { mode: 'event' },
      access: { level: 'write', grants: [] }
    }
  };

  return {
    processId: 'proc_fixture_v1',
    dataflowVersion: 4,
    roles: {
      operator: { id: 'operator', label: 'Operator', grants: [{ feature: 'probes', level: 'write' }] }
    },
    screens: {
      home_operator: {
        id: 'home_operator',
        screenKey: 'home_operator',
        label: 'Operator home',
        kind: 'route',
        template: 'home',
        route: '/screens/home_operator',
        sourceRoute: '/screens/home_operator',
        placement: 'hub',
        entityType: null,
        required: null,
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [
          { id: 'probes', entityType: 'probe', mode: 'list', required: null },
          { id: 'missions', entityType: 'survey_mission', mode: 'list', required: null },
          { id: 'observations', entityType: 'observation', mode: 'list', required: null }
        ],
        regions: [
          { id: 'probes', slot: 'main', sourceId: 'probes', surface: 'list', actions: ['probe_create'] },
          { id: 'missions', slot: 'main', sourceId: 'missions', surface: 'list', actions: [] },
          { id: 'observations', slot: 'main', sourceId: 'observations', surface: 'list', actions: [] }
        ],
        actions: ['probe_create']
      },
      auto_operator_probe: {
        id: 'auto_operator_probe',
        screenKey: 'auto_operator_probe',
        label: 'Operator probes',
        kind: 'entityList',
        template: 'entityList',
        route: '/screens/auto_operator_probe',
        sourceRoute: '/screens/auto_operator_probe',
        placement: 'hub',
        entityType: 'probe',
        required: { feature: 'probes', level: 'read' },
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [{ id: 'probe', entityType: 'probe', mode: 'list', required: { feature: 'probes', level: 'read' } }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'probe', surface: 'list', actions: ['probe_create', 'observation_link'] }],
        actions: ['probe_create', 'observation_link']
      },
      auto_operator_observation: {
        id: 'auto_operator_observation',
        screenKey: 'auto_operator_observation',
        label: 'Operator observations',
        kind: 'entityList',
        template: 'entityList',
        route: '/screens/auto_operator_observation',
        sourceRoute: '/screens/auto_operator_observation',
        placement: 'hub',
        entityType: 'observation',
        required: null,
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [{ id: 'observation', entityType: 'observation', mode: 'list', required: null }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'observation', surface: 'list', actions: [] }],
        actions: []
      },
      auto_operator_constellation_detail: {
        id: 'auto_operator_constellation_detail',
        screenKey: 'auto_operator_constellation_detail',
        label: 'Constellation detail',
        kind: 'entityDetail',
        template: 'entityDetail',
        route: '/screens/auto_operator_constellation_detail',
        sourceRoute: '/screens/auto_operator_constellation_detail',
        placement: 'detail',
        entityType: 'constellation',
        required: null,
        roleIds: ['operator'],
        scope: { entityId: 'constellation-1' },
        bindings: {},
        sources: [
          { id: 'constellation', entityType: 'constellation', mode: 'single', required: null, identifier: '$screen.scope.entityId' },
          { id: 'systems', entityType: 'star_system', mode: 'list', required: null, lineage: { sourceId: 'constellation', key: 'systems' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'constellation', surface: 'detail', actions: [] },
          { id: 'systems', slot: 'children', sourceId: 'systems', surface: 'list', actions: [] }
        ],
        actions: []
      },
      auto_operator_probe_detail: {
        id: 'auto_operator_probe_detail',
        screenKey: 'auto_operator_probe_detail',
        label: 'Probe detail',
        kind: 'entityDetail',
        template: 'entityDetail',
        route: '/screens/auto_operator_probe_detail',
        sourceRoute: '/screens/auto_operator_probe_detail',
        placement: 'detail',
        entityType: 'probe',
        required: { feature: 'probes', level: 'read' },
        roleIds: ['operator'],
        scope: { entityId: 'probe-4' },
        bindings: {},
        sources: [
          { id: 'probe', entityType: 'probe', mode: 'single', required: { feature: 'probes', level: 'read' }, identifier: '$screen.scope.entityId' },
          { id: 'observations', entityType: 'observation', mode: 'list', required: null, relation: { sourceId: 'probe', key: 'observations' } },
          { id: 'spectra', entityType: 'spectrum', mode: 'list', required: null, relation: { sourceId: 'probe', key: 'spectrum' } },
          { id: 'logs', entityType: 'log_entry', mode: 'list', required: null, relation: { sourceId: 'probe', key: 'logs' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'probe', surface: 'detail', actions: ['probe_update', 'probe_launch', 'probe_retire', 'probe_delete', 'observation_link'] },
          { id: 'observations', slot: 'children', sourceId: 'observations', surface: 'list', actions: ['observation_link'] },
          { id: 'spectra', slot: 'children', sourceId: 'spectra', surface: 'list', actions: [] },
          { id: 'logs', slot: 'children', sourceId: 'logs', surface: 'list', actions: [] }
        ],
        actions: ['probe_update', 'probe_launch', 'probe_retire', 'probe_delete', 'observation_link', 'observation_unlink']
      },
      auto_operator_mission_detail: {
        id: 'auto_operator_mission_detail',
        screenKey: 'auto_operator_mission_detail',
        label: 'Mission detail',
        kind: 'entityDetail',
        template: 'entityDetail',
        route: '/screens/auto_operator_mission_detail',
        sourceRoute: '/screens/auto_operator_mission_detail',
        placement: 'detail',
        entityType: 'survey_mission',
        required: null,
        roleIds: ['operator'],
        scope: { entityId: 'mission-2' },
        bindings: {},
        sources: [
          { id: 'mission', entityType: 'survey_mission', mode: 'single', required: null, identifier: '$screen.scope.entityId' },
          { id: 'probes', entityType: 'probe', mode: 'list', required: null, relation: { sourceId: 'mission', key: 'probes' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'mission', surface: 'detail', actions: ['mission_analyze'] },
          { id: 'probes', slot: 'children', sourceId: 'probes', surface: 'list', actions: [] }
        ],
        actions: ['mission_analyze']
      }
    },
    actions,
    navigation: [{ label: 'Probes', screenKey: 'auto_operator_probe', icon: 'pi pi-send' }]
  };
}

// --- Instances (CTS stored shape, SPEC §3) --------------------------------------

export function createConstellationInstance(overrides = {}) {
  return {
    id: 'constellation-1',
    type: 'constellation',
    typeVersion: 1,
    fields: { name: 'Lynx Hollow', catalogCode: 'LYH-114', declination: { value: 47.2, unit: 'deg' } },
    lineage: {},
    relations: {},
    states: {},
    payload: null,
    ...overrides
  };
}

export function createStarSystemInstance(overrides = {}) {
  return {
    id: 'system-1',
    type: 'star_system',
    typeVersion: 1,
    fields: { designation: 'LYH-114 A', starCount: { value: 2, unit: 'count' }, metallicity: { value: 64, unit: 'percent' }, ageMyr: { value: 6100, unit: 'count' } },
    lineage: { systems: { type: 'constellation', id: 'constellation-1' } },
    relations: {},
    states: {},
    payload: null,
    ...overrides
  };
}

export function createProbeInstance(overrides = {}) {
  return {
    id: 'probe-1',
    type: 'probe',
    typeVersion: 1,
    fields: {
      serial: 'PRB-0001',
      band: 'X',
      signal: { value: 62, unit: 'percent' },
      inclination: { value: 12.5, unit: 'deg' },
      orbitNumber: { value: 41, unit: 'count' },
      insuranceValue: { value: 12500, unit: 'currency' },
      uptime: { value: 43200, unit: 'min' },
      active: true,
      launchedAt: '2026-03-14T08:30:00.000Z',
      specification: { massG: { value: 850, unit: 'count' }, powerW: { value: 120, unit: 'count' } },
      tags: ['deep-field', 'repeat-visit'],
      homeSystem: { type: 'star_system', id: 'system-1' },
      manifestBlob: { fileId: 'gridfs-manifest-1', mime: 'application/json', size: 12_400 }
    },
    lineage: { probes: { type: 'star_system', id: 'system-1' } },
    relations: { observations: [], spectrum: null, logs: [] },
    states: { main: 'idle' },
    payload: null,
    ...overrides
  };
}

export function createObservationInstance(overrides = {}) {
  return {
    id: 'observation-1',
    type: 'observation',
    typeVersion: 1,
    fields: {
      exposure: { value: 12, unit: 'min' },
      frameCount: 9,
      filter: 'H-alpha',
      note: 'Long integration with guide corrections applied every 30 seconds across the primary target window.'
    },
    lineage: {},
    relations: {},
    states: {},
    payload: { fileId: 'gridfs-observation-1', mime: 'image/png', size: 3_400_000 },
    ...overrides
  };
}

export function createSpectrumInstance(overrides = {}) {
  return {
    id: 'spectrum-1',
    type: 'spectrum',
    typeVersion: 1,
    fields: { resolution: { value: 2400, unit: 'count' }, calibrated: true },
    lineage: {},
    relations: {},
    states: {},
    payload: { fileId: 'gridfs-spectrum-1', mime: 'application/x-spectrum', size: 220_000 },
    ...overrides
  };
}

export function createLogEntryInstance(overrides = {}) {
  return {
    id: 'log-1',
    type: 'log_entry',
    typeVersion: 1,
    fields: { entry: 'Reaction wheel 3 rebalanced after torque spike; nominal spin resumed within the expected damping window.' },
    lineage: {},
    relations: {},
    states: {},
    payload: { fileId: 'gridfs-log-1', mime: 'text/plain', size: 4_200 },
    ...overrides
  };
}

export function createMissionInstance(overrides = {}) {
  return {
    id: 'mission-1',
    type: 'survey_mission',
    typeVersion: 1,
    fields: {
      objective: 'Wide-field survey of the hollow sector with repeated visits to variable targets and adaptive windows.',
      priority: 'p2',
      target: { type: 'constellation', id: 'constellation-1' },
      crewTags: ['alpha-shift', 'optics'],
      checklist: [
        { step: 'Calibrate guide optics', done: true },
        { step: 'Verify downlink window', done: true },
        { step: 'Lock adaptive config', done: false }
      ],
      telemetry: { pitch: { value: 4.5, unit: 'deg' }, yaw: { value: -1.25, unit: 'deg' } },
      config: { tag: 'adaptive', value: { sensitivityPercent: { value: 78, unit: 'percent' } } },
      calibrationDump: { biasFrame: '2026-04-01', darkFrames: 12 }
    },
    lineage: {},
    relations: { probes: [] },
    states: { main: 'planned' },
    payload: null,
    ...overrides
  };
}

// The instance graph: one constellation, three systems, nine probes (the
// probe-4 branch carries the heavy file cardinality), observations with
// varied filters, single-ref spectra, log entries, and three missions in
// different lifecycle states.
export function createUiMappingInstances() {
  const observations = Array.from({ length: 10 }, (_, index) => createObservationInstance({
    id: `observation-${index + 1}`,
    fields: {
      exposure: { value: 4 + index * 2, unit: 'min' },
      frameCount: 6 + index * 3,
      filter: ['H-alpha', 'O-III', 'IR'][index % 3],
      note: `Survey pass ${index + 1} over the primary target; seeing improved mid-integration and the guiding loop held.`
    },
    payload: { fileId: `gridfs-observation-${index + 1}`, mime: 'image/png', size: 1_800_000 + index * 210_000 }
  }));

  const spectra = Array.from({ length: 4 }, (_, index) => createSpectrumInstance({
    id: `spectrum-${index + 1}`,
    fields: { resolution: { value: 1200 + index * 600, unit: 'count' }, calibrated: index % 2 === 0 },
    payload: { fileId: `gridfs-spectrum-${index + 1}`, mime: 'application/x-spectrum', size: 180_000 + index * 30_000 }
  }));

  const logs = Array.from({ length: 5 }, (_, index) => createLogEntryInstance({
    id: `log-${index + 1}`,
    fields: { entry: `Cycle ${index + 1}: attitude control nominal, downlink margin ${(18 - index).toFixed(1)} dB, thermal band within limits.` },
    payload: { fileId: `gridfs-log-${index + 1}`, mime: 'text/plain', size: 3_000 + index * 900 }
  }));

  const observationCounts = [1, 0, 2, 10, 3, 1, 0, 4, 2];
  const systemByIndex = ['system-1', 'system-1', 'system-1', 'system-2', 'system-2', 'system-2', 'system-3', 'system-3', 'system-3'];
  const probeStates = ['idle', 'active', 'maintenance', 'active', 'retired', 'idle', 'active', 'idle', 'maintenance'];
  const bands = ['X', 'Y', 'K', 'X', 'Y', 'K', 'X', 'Y', 'K'];
  const probes = observationCounts.map((observationCount, index) => createProbeInstance({
    id: `probe-${index + 1}`,
    fields: {
      ...createProbeInstance().fields,
      serial: `PRB-${String(index + 1).padStart(4, '0')}`,
      band: bands[index],
      signal: { value: [92, 44, 67, 18, 78, 55, 96, 33, 61][index], unit: 'percent' },
      inclination: { value: 3 + index * 7.5, unit: 'deg' },
      orbitNumber: { value: 12 + index * 9, unit: 'count' },
      active: probeStates[index] === 'active',
      launchedAt: index % 3 === 2 ? null : `2026-0${(index % 8) + 1}-1${index % 9}T10:00:00.000Z`,
      specification: { massG: { value: 620 + index * 55, unit: 'count' }, powerW: { value: 95 + index * 8, unit: 'count' } },
      tags: ['deep-field', 'repeat-visit', 'calibration', 'low-orbit'].slice(0, 1 + (index % 3)),
      homeSystem: { type: 'star_system', id: systemByIndex[index] }
    },
    lineage: { probes: { type: 'star_system', id: systemByIndex[index] } },
    relations: {
      observations: observations.slice(0, observationCount).map(observation => ({ type: 'observation', id: observation.id })),
      spectrum: index % 3 === 0 ? { type: 'spectrum', id: `spectrum-${(index % 4) + 1}` } : null,
      logs: logs.slice(0, index % 4).map(log => ({ type: 'log_entry', id: log.id }))
    },
    states: { main: probeStates[index] }
  }));

  return {
    constellations: [createConstellationInstance()],
    starSystems: [
      createStarSystemInstance(),
      createStarSystemInstance({
        id: 'system-2',
        fields: { designation: 'LYH-114 B', starCount: { value: 1, unit: 'count' }, metallicity: { value: 88, unit: 'percent' }, ageMyr: { value: 420, unit: 'count' } }
      }),
      createStarSystemInstance({
        id: 'system-3',
        fields: { designation: 'LYH-114 C', starCount: { value: 4, unit: 'count' }, metallicity: { value: 31, unit: 'percent' }, ageMyr: { value: 9800, unit: 'count' } }
      })
    ],
    probes,
    observations,
    spectra,
    logEntries: logs,
    missions: [
      createMissionInstance(),
      createMissionInstance({
        id: 'mission-2',
        states: { main: 'running' },
        relations: { probes: [probes[1], probes[3], probes[6]].map(probe => ({ type: 'probe', id: probe.id })) },
        fields: { ...createMissionInstance().fields, priority: 'p0', config: { tag: 'fixed', value: { windowMin: { value: 45, unit: 'min' } } } }
      }),
      createMissionInstance({
        id: 'mission-3',
        states: { main: 'failed' },
        relations: { probes: [{ type: 'probe', id: 'probe-5' }] },
        fields: { ...createMissionInstance().fields, priority: 'p7', config: { tag: 'manual', value: 'operator override: split window across two shifts' } }
      })
    ]
  };
}
