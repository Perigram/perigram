// Synthetic UI-mapping fixtures: a second, completely different hydration
// domain — a facilities grid (zones → sectors → stations → units, crews,
// readings/schematics/logs, audit runs) — written to stress the mapping
// layer's structural coverage, not to model anything real: four lineage
// levels, cross-type refs (single and array), all field bases and units,
// all preview modes, variable relation cardinality. The UI generation
// layer (shared/ui-mapping, components/ui-mapping) consumes this without
// any domain knowledge; only the timeline layout matcher's `log_entry`
// type id is reused by name.

const ORGANIZATION_ID = 'org-fixture-2';

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
        id: 'zone',
        class: 'group',
        fields: {
          name: { base: 'string', label: 'Name' },
          code: { base: 'string', label: 'Code' },
          area: { base: 'quantity', unit: 'm2', label: 'Area' }
        },
        edges: { children: { sectors: { types: ['sector'], onRemove: 'restrict' } } },
        render: { label: 'Zone', icon: 'pi pi-th-large', identityField: 'name' }
      }),
      typeRecord({
        id: 'sector',
        class: 'group',
        fields: {
          designation: { base: 'string', label: 'Designation' },
          index: { base: 'quantity', unit: 'count', label: 'Index' },
          coverage: { base: 'quantity', unit: 'percent', label: 'Coverage' }
        },
        edges: { children: { stations: { types: ['station'], onRemove: 'restrict' } } },
        render: { label: 'Sector', icon: 'pi pi-objects-column', identityField: 'designation' }
      }),
      typeRecord({
        id: 'station',
        class: 'group',
        fields: {
          label: { base: 'string', label: 'Label' },
          capacity: { base: 'quantity', unit: 'count', label: 'Capacity' }
        },
        edges: { children: { units: { types: ['unit'], onRemove: 'restrict' } } },
        render: { label: 'Station', icon: 'pi pi-building', identityField: 'label' }
      }),
      typeRecord({
        id: 'unit',
        class: 'item',
        fields: {
          serial: { base: 'string', label: 'Serial' },
          band: { base: 'enum', values: ['A', 'B', 'C'], label: 'Band' },
          load: { base: 'quantity', unit: 'percent', label: 'Load' },
          tolerance: { base: 'quantity', unit: 'mm', label: 'Tolerance' },
          temperature: { base: 'quantity', unit: 'deg', label: 'Temperature' },
          cycles: { base: 'quantity', unit: 'count', label: 'Cycles' },
          cost: { base: 'quantity', unit: 'currency', label: 'Cost' },
          uptime: { base: 'quantity', unit: 'min', label: 'Uptime' },
          active: { base: 'boolean', label: 'Active' },
          commissionedAt: { base: 'instant', nullable: true, label: 'Commissioned' },
          specification: {
            base: 'record',
            label: 'Specification',
            fields: {
              massG: { base: 'quantity', unit: 'count', label: 'Mass (g)' },
              powerW: { base: 'quantity', unit: 'count', label: 'Power (W)' }
            }
          },
          tags: { base: 'list', itemType: { base: 'string' }, label: 'Tags' },
          station: { base: 'ref', accepts: ['station'], label: 'Station' },
          maintainer: { base: 'ref', accepts: ['crew'], label: 'Maintainer' },
          manifest: { base: 'blob', label: 'Manifest' }
        },
        edges: {
          relations: {
            readings: { types: ['reading'], onRemove: 'detach' },
            schematic: { types: ['schematic'], onRemove: 'detach' },
            logs: { types: ['log_entry'], onRemove: 'detach' }
          }
        },
        states: {
          main: { initial: 'standby', values: ['standby', 'running', 'service', 'decommissioned'], terminal: ['decommissioned'] }
        },
        transitions: [
          { from: 'standby', to: 'running', intent: 'startUnit' },
          { from: 'running', to: 'service' },
          { from: 'service', to: 'running' },
          { from: 'running', to: 'decommissioned', intent: 'retireUnit' },
          { from: 'standby', to: 'decommissioned' }
        ],
        render: {
          label: 'Unit',
          icon: 'pi pi-microchip',
          identityField: 'serial',
          groups: [
            { id: 'overview', label: 'Overview', fields: ['serial', 'band', 'load'] },
            { id: 'telemetry', label: 'Telemetry', fields: ['temperature', 'cycles', 'uptime', 'commissionedAt'] },
            { id: 'admin', label: 'Admin', fields: ['cost', 'active', 'maintainer'] }
          ],
          states: { running: { severity: 'info' }, service: { severity: 'warning' }, decommissioned: { severity: 'secondary' } }
        }
      }),
      typeRecord({
        id: 'crew',
        class: 'item',
        fields: {
          name: { base: 'string', label: 'Name' },
          role: { base: 'enum', values: ['technician', 'engineer', 'lead'], label: 'Role' },
          certifiedAt: { base: 'instant', label: 'Certified' },
          onDuty: { base: 'boolean', label: 'On duty' }
        },
        states: {
          main: { initial: 'available', values: ['available', 'assigned', 'leave'], terminal: [] }
        },
        transitions: [
          { from: 'available', to: 'assigned' },
          { from: 'assigned', to: 'available' },
          { from: 'assigned', to: 'leave' }
        ],
        render: { label: 'Crew', icon: 'pi pi-users', identityField: 'name', states: { assigned: { severity: 'info' } } }
      }),
      typeRecord({
        id: 'reading',
        class: 'file',
        payload: { mime: ['image/png'], accept: ['.png'], maxSize: 20 * 1024 * 1024, preview: 'image' },
        fields: {
          title: { base: 'string', label: 'Title' },
          exposure: { base: 'quantity', unit: 'min', label: 'Exposure' },
          frames: { base: 'number', label: 'Frames' },
          filter: { base: 'enum', values: ['wide', 'narrow', 'thermal'], label: 'Filter' },
          note: { base: 'string', max: 400, label: 'Note' }
        },
        render: { label: 'Reading', icon: 'pi pi-chart-line', identityField: 'title' }
      }),
      typeRecord({
        id: 'schematic',
        class: 'file',
        payload: { mime: ['application/x-schematic'], accept: ['.sch'], preview: 'geometry' },
        fields: {
          revision: { base: 'string', label: 'Revision' },
          layers: { base: 'quantity', unit: 'count', label: 'Layers' },
          updatedAt: { base: 'instant', label: 'Updated' }
        },
        render: { label: 'Schematic', icon: 'pi pi-objects-column', identityField: 'revision' }
      }),
      typeRecord({
        id: 'log_entry',
        class: 'file',
        payload: { mime: ['text/plain'], accept: ['.txt'], maxSize: 1024 * 1024, preview: 'attachment' },
        fields: { entry: { base: 'string', max: 600, label: 'Entry' } },
        render: { label: 'Log entry', icon: 'pi pi-file-edit' }
      }),
      typeRecord({
        id: 'audit_run',
        class: 'process',
        fields: {
          objective: { base: 'string', max: 500, label: 'Objective' },
          priority: {
            base: 'enum',
            label: 'Priority',
            values: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11']
          },
          lead: { base: 'ref', accepts: ['crew'], label: 'Lead' },
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
          dump: { base: 'json', label: 'Dump' }
        },
        edges: { relations: { units: { types: ['unit'], onRemove: 'detach' } } },
        states: {
          main: { initial: 'planned', values: ['planned', 'running', 'analyzing', 'complete', 'failed'], terminal: ['complete', 'failed'] }
        },
        transitions: [
          { from: 'planned', to: 'running', intent: 'startAudit' },
          { from: 'running', to: 'analyzing' },
          { from: 'analyzing', to: 'complete', intent: 'finishAudit' },
          { from: 'running', to: 'failed' },
          { from: 'analyzing', to: 'failed' }
        ],
        render: {
          label: 'Audit run',
          icon: 'pi pi-verified',
          groups: [
            { id: 'mission', label: 'Mission', fields: ['objective', 'priority', 'lead'] },
            { id: 'execution', label: 'Execution', fields: ['config', 'checklist', 'telemetry'] }
          ],
          states: { running: { severity: 'info' }, analyzing: { severity: 'info' }, complete: { severity: 'success' }, failed: { severity: 'danger' } }
        }
      })
    ]
  };
}

// --- Compiled process contract (CTS vocabulary: typeList / instanceDetail) -----

export function createUiMappingCompiledContract() {
  const actions = {
    unit_create: {
      id: 'unit_create',
      label: 'Create unit',
      actionKind: 'createInstance',
      typeId: 'unit',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      construction: { mode: 'generic', inputs: ['serial', 'band', 'load'] }
    },
    unit_update: {
      id: 'unit_update',
      label: 'Edit unit',
      actionKind: 'updateInstance',
      typeId: 'unit',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    unit_start: {
      id: 'unit_start',
      label: 'Start',
      actionKind: 'updateInstance',
      typeId: 'unit',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      status: { to: 'running' }
    },
    unit_retire: {
      id: 'unit_retire',
      label: 'Retire',
      actionKind: 'updateInstance',
      typeId: 'unit',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      status: { to: 'decommissioned' }
    },
    unit_delete: {
      id: 'unit_delete',
      label: 'Delete unit',
      actionKind: 'deleteInstance',
      typeId: 'unit',
      trigger: { mode: 'manual' },
      access: { level: 'admin', grants: [] }
    },
    reading_link: {
      id: 'reading_link',
      label: 'Reading',
      actionKind: 'link',
      typeId: 'unit',
      relation: { key: 'readings', targetType: 'reading', cardinality: 'array' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    reading_unlink: {
      id: 'reading_unlink',
      label: 'Unlink reading',
      actionKind: 'unlink',
      typeId: 'unit',
      relation: { key: 'readings', targetType: 'reading', cardinality: 'array' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    audit_analyze: {
      id: 'audit_analyze',
      label: 'Run analysis',
      actionKind: 'runCommand',
      commandId: 'audit.analyze',
      typeId: 'audit_run',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    unit_auto_index: {
      id: 'unit_auto_index',
      label: 'Index unit',
      actionKind: 'updateInstance',
      typeId: 'unit',
      trigger: { mode: 'event' },
      access: { level: 'write', grants: [] }
    }
  };

  return {
    processId: 'proc_fixture_v2',
    dataflowVersion: 4,
    roles: {
      operator: { id: 'operator', label: 'Operator', grants: [{ feature: 'units', level: 'write' }] }
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
        typeId: null,
        required: null,
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [
          { id: 'units', typeId: 'unit', mode: 'list', required: null },
          { id: 'audits', typeId: 'audit_run', mode: 'list', required: null },
          { id: 'readings', typeId: 'reading', mode: 'list', required: null }
        ],
        regions: [
          { id: 'units', slot: 'main', sourceId: 'units', surface: 'list', actions: ['unit_create'] },
          { id: 'audits', slot: 'main', sourceId: 'audits', surface: 'list', actions: [] },
          { id: 'readings', slot: 'main', sourceId: 'readings', surface: 'list', actions: [] }
        ],
        actions: ['unit_create']
      },
      auto_operator_unit: {
        id: 'auto_operator_unit',
        screenKey: 'auto_operator_unit',
        label: 'Operator units',
        kind: 'typeList',
        template: 'typeList',
        route: '/screens/auto_operator_unit',
        sourceRoute: '/screens/auto_operator_unit',
        placement: 'hub',
        typeId: 'unit',
        required: { feature: 'units', level: 'read' },
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [{ id: 'unit', typeId: 'unit', mode: 'list', required: { feature: 'units', level: 'read' } }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'unit', surface: 'list', actions: ['unit_create', 'reading_link'] }],
        actions: ['unit_create', 'reading_link']
      },
      auto_operator_reading: {
        id: 'auto_operator_reading',
        screenKey: 'auto_operator_reading',
        label: 'Operator readings',
        kind: 'typeList',
        template: 'typeList',
        route: '/screens/auto_operator_reading',
        sourceRoute: '/screens/auto_operator_reading',
        placement: 'hub',
        typeId: 'reading',
        required: null,
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [{ id: 'reading', typeId: 'reading', mode: 'list', required: null }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'reading', surface: 'list', actions: [] }],
        actions: []
      },
      auto_operator_zone_detail: {
        id: 'auto_operator_zone_detail',
        screenKey: 'auto_operator_zone_detail',
        label: 'Zone detail',
        kind: 'instanceDetail',
        template: 'instanceDetail',
        route: '/screens/auto_operator_zone_detail',
        sourceRoute: '/screens/auto_operator_zone_detail',
        placement: 'detail',
        typeId: 'zone',
        required: null,
        roleIds: ['operator'],
        scope: { instanceId: 'zone-1' },
        bindings: {},
        sources: [
          { id: 'zone', typeId: 'zone', mode: 'single', required: null, identifier: '$screen.scope.instanceId' },
          { id: 'sectors', typeId: 'sector', mode: 'list', required: null, lineage: { sourceId: 'zone', key: 'sectors' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'zone', surface: 'detail', actions: [] },
          { id: 'sectors', slot: 'children', sourceId: 'sectors', surface: 'list', actions: [] }
        ],
        actions: []
      },
      auto_operator_unit_detail: {
        id: 'auto_operator_unit_detail',
        screenKey: 'auto_operator_unit_detail',
        label: 'Unit detail',
        kind: 'instanceDetail',
        template: 'instanceDetail',
        route: '/screens/auto_operator_unit_detail',
        sourceRoute: '/screens/auto_operator_unit_detail',
        placement: 'detail',
        typeId: 'unit',
        required: { feature: 'units', level: 'read' },
        roleIds: ['operator'],
        scope: { instanceId: 'unit-4' },
        bindings: {},
        sources: [
          { id: 'unit', typeId: 'unit', mode: 'single', required: { feature: 'units', level: 'read' }, identifier: '$screen.scope.instanceId' },
          { id: 'readings', typeId: 'reading', mode: 'list', required: null, relation: { sourceId: 'unit', key: 'readings' } },
          { id: 'schematic', typeId: 'schematic', mode: 'list', required: null, relation: { sourceId: 'unit', key: 'schematic' } },
          { id: 'logs', typeId: 'log_entry', mode: 'list', required: null, relation: { sourceId: 'unit', key: 'logs' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'unit', surface: 'detail', actions: ['unit_update', 'unit_start', 'unit_retire', 'unit_delete', 'reading_link'] },
          { id: 'readings', slot: 'children', sourceId: 'readings', surface: 'list', actions: ['reading_link'] },
          { id: 'schematic', slot: 'children', sourceId: 'schematic', surface: 'list', actions: [] },
          { id: 'logs', slot: 'children', sourceId: 'logs', surface: 'list', actions: [] }
        ],
        actions: ['unit_update', 'unit_start', 'unit_retire', 'unit_delete', 'reading_link', 'reading_unlink']
      },
      auto_operator_audit_detail: {
        id: 'auto_operator_audit_detail',
        screenKey: 'auto_operator_audit_detail',
        label: 'Audit detail',
        kind: 'instanceDetail',
        template: 'instanceDetail',
        route: '/screens/auto_operator_audit_detail',
        sourceRoute: '/screens/auto_operator_audit_detail',
        placement: 'detail',
        typeId: 'audit_run',
        required: null,
        roleIds: ['operator'],
        scope: { instanceId: 'audit-2' },
        bindings: {},
        sources: [
          { id: 'audit', typeId: 'audit_run', mode: 'single', required: null, identifier: '$screen.scope.instanceId' },
          { id: 'units', typeId: 'unit', mode: 'list', required: null, relation: { sourceId: 'audit', key: 'units' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'audit', surface: 'detail', actions: ['audit_analyze'] },
          { id: 'units', slot: 'children', sourceId: 'units', surface: 'list', actions: [] }
        ],
        actions: ['audit_analyze']
      }
    },
    actions,
    navigation: [{ label: 'Units', screenKey: 'auto_operator_unit', icon: 'pi pi-microchip' }]
  };
}

// --- Instances (CTS stored shape, SPEC §3) --------------------------------------

export function createZoneInstance(overrides = {}) {
  return {
    id: 'zone-1',
    type: 'zone',
    typeVersion: 1,
    fields: { name: 'North Ridge', code: 'NR-07', area: { value: 4200, unit: 'm2' } },
    lineage: {},
    relations: {},
    states: {},
    payload: null,
    ...overrides
  };
}

export function createSectorInstance(overrides = {}) {
  return {
    id: 'sector-1',
    type: 'sector',
    typeVersion: 1,
    fields: { designation: 'NR-07/Alpha', index: { value: 1, unit: 'count' }, coverage: { value: 72, unit: 'percent' } },
    lineage: { sectors: { type: 'zone', id: 'zone-1' } },
    relations: {},
    states: {},
    payload: null,
    ...overrides
  };
}

export function createStationInstance(overrides = {}) {
  return {
    id: 'station-1',
    type: 'station',
    typeVersion: 1,
    fields: { label: 'Bay 12', capacity: { value: 8, unit: 'count' } },
    lineage: { stations: { type: 'sector', id: 'sector-1' } },
    relations: {},
    states: {},
    payload: null,
    ...overrides
  };
}

export function createUnitInstance(overrides = {}) {
  return {
    id: 'unit-1',
    type: 'unit',
    typeVersion: 1,
    fields: {
      serial: 'UNT-0001',
      band: 'A',
      load: { value: 41, unit: 'percent' },
      tolerance: { value: 0.2, unit: 'mm' },
      temperature: { value: 63.5, unit: 'deg' },
      cycles: { value: 1200, unit: 'count' },
      cost: { value: 9800, unit: 'currency' },
      uptime: { value: 26000, unit: 'min' },
      active: true,
      commissionedAt: '2026-02-11T09:00:00.000Z',
      specification: { massG: { value: 1400, unit: 'count' }, powerW: { value: 210, unit: 'count' } },
      tags: ['rotating', 'primary'],
      station: { type: 'station', id: 'station-1' },
      maintainer: { type: 'crew', id: 'crew-1' },
      manifest: { fileId: 'gridfs-manifest-1', mime: 'application/json', size: 9_800 }
    },
    lineage: { units: { type: 'station', id: 'station-1' } },
    relations: { readings: [], schematic: null, logs: [] },
    states: { main: 'standby' },
    payload: null,
    ...overrides
  };
}

export function createCrewInstance(overrides = {}) {
  return {
    id: 'crew-1',
    type: 'crew',
    typeVersion: 1,
    fields: { name: 'A. Ferro', role: 'engineer', certifiedAt: '2025-11-03T00:00:00.000Z', onDuty: true },
    lineage: {},
    relations: {},
    states: { main: 'assigned' },
    payload: null,
    ...overrides
  };
}

export function createReadingInstance(overrides = {}) {
  return {
    id: 'reading-1',
    type: 'reading',
    typeVersion: 1,
    fields: {
      title: 'Pass 1 · main bus',
      exposure: { value: 6, unit: 'min' },
      frames: 12,
      filter: 'wide',
      note: 'Baseline capture across the main bus with the thermal overlay disabled for reference comparison.'
    },
    lineage: {},
    relations: {},
    states: {},
    payload: { fileId: 'gridfs-reading-1', mime: 'image/png', size: 2_100_000 },
    ...overrides
  };
}

export function createSchematicInstance(overrides = {}) {
  return {
    id: 'schematic-1',
    type: 'schematic',
    typeVersion: 1,
    fields: { revision: 'rev C', layers: { value: 7, unit: 'count' }, updatedAt: '2026-05-19T14:00:00.000Z' },
    lineage: {},
    relations: {},
    states: {},
    payload: { fileId: 'gridfs-schematic-1', mime: 'application/x-schematic', size: 340_000 },
    ...overrides
  };
}

export function createLogEntryInstance(overrides = {}) {
  return {
    id: 'log-1',
    type: 'log_entry',
    typeVersion: 1,
    fields: { entry: 'Bearing noise resolved after lubrication cycle; vibration back within the green band on both probes.' },
    lineage: {},
    relations: {},
    states: {},
    payload: { fileId: 'gridfs-log-1', mime: 'text/plain', size: 3_600 },
    ...overrides
  };
}

export function createAuditRunInstance(overrides = {}) {
  return {
    id: 'audit-1',
    type: 'audit_run',
    typeVersion: 1,
    fields: {
      objective: 'Full-grid compliance sweep covering every station branch with repeated thermal and vibration sampling.',
      priority: 'p3',
      lead: { type: 'crew', id: 'crew-2' },
      checklist: [
        { step: 'Freeze grid snapshot', done: true },
        { step: 'Collect thermal readings', done: true },
        { step: 'Cross-check schematics', done: false }
      ],
      telemetry: { drift: { value: 2.75, unit: 'deg' }, skew: { value: -0.4, unit: 'deg' } },
      config: { tag: 'adaptive', value: { sensitivityPercent: { value: 82, unit: 'percent' } } },
      dump: { snapshot: '2026-06-01', branches: 6 }
    },
    lineage: {},
    relations: { units: [] },
    states: { main: 'planned' },
    payload: null,
    ...overrides
  };
}

// The instance graph: one zone, three sectors, two stations per sector,
// two-to-three units per station (four lineage levels), files with varied
// cardinality, crews for cross-refs, and three audit runs.
export function createUiMappingInstances() {
  const readings = Array.from({ length: 10 }, (_, index) => createReadingInstance({
    id: `reading-${index + 1}`,
    fields: {
      title: `Pass ${index + 1} · ${['main bus', 'coolant loop', 'exhaust'][index % 3]}`,
      exposure: { value: 3 + index, unit: 'min' },
      frames: 8 + index * 2,
      filter: ['wide', 'narrow', 'thermal'][index % 3],
      note: `Capture ${index + 1} on the target branch; sensor settle time extended after the thermal transient.`
    },
    payload: { fileId: `gridfs-reading-${index + 1}`, mime: 'image/png', size: 1_500_000 + index * 180_000 }
  }));

  const schematics = Array.from({ length: 4 }, (_, index) => createSchematicInstance({
    id: `schematic-${index + 1}`,
    fields: { revision: `rev ${String.fromCharCode(65 + index)}`, layers: { value: 4 + index * 3, unit: 'count' }, updatedAt: `2026-0${index + 3}-15T10:00:00.000Z` },
    payload: { fileId: `gridfs-schematic-${index + 1}`, mime: 'application/x-schematic', size: 260_000 + index * 40_000 }
  }));

  const logs = Array.from({ length: 5 }, (_, index) => createLogEntryInstance({
    id: `log-${index + 1}`,
    fields: { entry: `Shift ${index + 1}: load balanced across branches, peak draw ${(19 - index).toFixed(1)} A, no alarms latched overnight.` },
    payload: { fileId: `gridfs-log-${index + 1}`, mime: 'text/plain', size: 2_800 + index * 700 }
  }));

  const sectors = [
    createSectorInstance(),
    createSectorInstance({ id: 'sector-2', fields: { designation: 'NR-07/Beta', index: { value: 2, unit: 'count' }, coverage: { value: 55, unit: 'percent' } } }),
    createSectorInstance({ id: 'sector-3', fields: { designation: 'NR-07/Gamma', index: { value: 3, unit: 'count' }, coverage: { value: 88, unit: 'percent' } } })
  ];

  const stations = [
    createStationInstance(),
    createStationInstance({ id: 'station-2', lineage: { stations: { type: 'sector', id: 'sector-1' } }, fields: { label: 'Bay 14', capacity: { value: 6, unit: 'count' } } }),
    createStationInstance({ id: 'station-3', lineage: { stations: { type: 'sector', id: 'sector-2' } }, fields: { label: 'Bay 21', capacity: { value: 10, unit: 'count' } } }),
    createStationInstance({ id: 'station-4', lineage: { stations: { type: 'sector', id: 'sector-2' } }, fields: { label: 'Bay 22', capacity: { value: 4, unit: 'count' } } }),
    createStationInstance({ id: 'station-5', lineage: { stations: { type: 'sector', id: 'sector-3' } }, fields: { label: 'Bay 31', capacity: { value: 8, unit: 'count' } } }),
    createStationInstance({ id: 'station-6', lineage: { stations: { type: 'sector', id: 'sector-3' } }, fields: { label: 'Bay 32', capacity: { value: 5, unit: 'count' } } })
  ];

  const stationByIndex = ['station-1', 'station-1', 'station-2', 'station-2', 'station-3', 'station-3', 'station-3', 'station-4', 'station-5', 'station-5', 'station-6', 'station-6'];
  const readingCounts = [1, 0, 2, 10, 3, 1, 0, 4, 2, 5, 1, 3];
  const unitStates = ['standby', 'running', 'service', 'running', 'decommissioned', 'standby', 'running', 'standby', 'service', 'running', 'standby', 'running'];
  const bands = ['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C'];
  const loads = [92, 44, 67, 18, 78, 55, 96, 33, 61, 71, 25, 49];
  const units = stationByIndex.map((stationId, index) => createUnitInstance({
    id: `unit-${index + 1}`,
    fields: {
      ...createUnitInstance().fields,
      serial: `UNT-${String(index + 1).padStart(4, '0')}`,
      band: bands[index],
      load: { value: loads[index], unit: 'percent' },
      tolerance: { value: 0.1 + index * 0.05, unit: 'mm' },
      temperature: { value: 40 + index * 3.5, unit: 'deg' },
      cycles: { value: 400 + index * 350, unit: 'count' },
      cost: { value: 4000 + index * 900, unit: 'currency' },
      uptime: { value: 8000 + index * 2600, unit: 'min' },
      active: unitStates[index] === 'running',
      commissionedAt: index % 3 === 1 ? null : `2026-0${(index % 8) + 1}-0${(index % 8) + 1}T08:00:00.000Z`,
      specification: { massG: { value: 900 + index * 120, unit: 'count' }, powerW: { value: 120 + index * 25, unit: 'count' } },
      tags: ['rotating', 'primary', 'calibration', 'low-cycle'].slice(0, 1 + (index % 3)),
      station: { type: 'station', id: stationId },
      maintainer: { type: 'crew', id: index % 2 === 0 ? 'crew-1' : 'crew-2' }
    },
    lineage: { units: { type: 'station', id: stationId } },
    relations: {
      readings: readings.slice(0, readingCounts[index]).map(reading => ({ type: 'reading', id: reading.id })),
      schematic: index % 3 === 0 ? { type: 'schematic', id: `schematic-${(index % 4) + 1}` } : null,
      logs: logs.slice(0, index % 4).map(log => ({ type: 'log_entry', id: log.id }))
    },
    states: { main: unitStates[index] }
  }));

  return {
    zones: [createZoneInstance()],
    sectors,
    stations,
    units,
    crews: [
      createCrewInstance(),
      createCrewInstance({ id: 'crew-2', fields: { ...createCrewInstance().fields, name: 'M. Okafor', role: 'lead', onDuty: false }, states: { main: 'leave' } })
    ],
    readings,
    schematics,
    logEntries: logs,
    audits: [
      createAuditRunInstance(),
      createAuditRunInstance({
        id: 'audit-2',
        states: { main: 'running' },
        relations: { units: [units[1], units[3], units[6]].map(unit => ({ type: 'unit', id: unit.id })) },
        fields: { ...createAuditRunInstance().fields, priority: 'p0', config: { tag: 'fixed', value: { windowMin: { value: 30, unit: 'min' } } } }
      }),
      createAuditRunInstance({
        id: 'audit-3',
        states: { main: 'failed' },
        relations: { units: [{ type: 'unit', id: 'unit-5' }] },
        fields: { ...createAuditRunInstance().fields, priority: 'p11', config: { tag: 'manual', value: 'operator override: split sweep across two shifts' } }
      })
    ]
  };
}
