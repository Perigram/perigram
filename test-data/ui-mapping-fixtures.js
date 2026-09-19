// Synthetic UI-mapping fixtures: hydration three — a maritime logistics
// shape deliberately unlike the previous two, stressing structures they
// never contained: a group with MULTIPLE child types, the same child type
// under three different parents, a self-type ref, a ref inside a variant
// payload, list<enum> and map<instant>, group-to-item relations, a typeList
// of a group (hierarchical), a file instanceDetail screen, and a
// single-instance type. The UI generation layer has zero domain knowledge;
// the timeline layout matcher's `log_entry` type id is reused by name.

const ORGANIZATION_ID = 'org-fixture-3';

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
        id: 'fleet',
        class: 'group',
        fields: {
          name: { base: 'string', label: 'Name' },
          homePortCode: { base: 'string', label: 'Home port' }
        },
        edges: {
          children: {
            convoys: { types: ['convoy'], onRemove: 'restrict' },
            directVessels: { types: ['vessel'], onRemove: 'restrict' }
          },
          relations: {
            partnerPorts: { types: ['port'], onRemove: 'detach' }
          }
        },
        render: {
          label: 'Fleet',
          icon: 'pi pi-compass',
          identityField: 'name',
          groups: [
            { id: 'identity', label: 'Identity', fields: ['name', 'homePortCode'] }
          ]
        }
      }),
      typeRecord({
        id: 'convoy',
        class: 'group',
        fields: {
          designation: { base: 'string', label: 'Designation' },
          hullCount: { base: 'quantity', unit: 'count', label: 'Hulls' }
        },
        edges: { children: { members: { types: ['vessel'], onRemove: 'restrict' } } },
        render: { label: 'Convoy', icon: 'pi pi-arrow-right-arrow-left', identityField: 'designation' }
      }),
      typeRecord({
        id: 'port',
        class: 'group',
        fields: {
          code: { base: 'string', label: 'Code' },
          area: { base: 'quantity', unit: 'm2', label: 'Area' },
          berthFee: { base: 'quantity', unit: 'currency', label: 'Berth fee' }
        },
        edges: { children: { moorings: { types: ['vessel'], onRemove: 'restrict' } } },
        render: { label: 'Port', icon: 'pi pi-map-marker', identityField: 'code' }
      }),
      typeRecord({
        id: 'vessel',
        class: 'item',
        fields: {
          name: { base: 'string', label: 'Name' },
          classBand: { base: 'enum', values: ['coastal', 'oceanic', 'inland'], label: 'Class' },
          crewCount: { base: 'number', label: 'Crew' },
          fuel: { base: 'quantity', unit: 'percent', label: 'Fuel' },
          heading: { base: 'quantity', unit: 'deg', label: 'Heading' },
          draft: { base: 'quantity', unit: 'mm', label: 'Draft' },
          flags: { base: 'list', itemType: { base: 'enum', values: ['eco', 'hazard', 'priority'] }, label: 'Flags' },
          escortOf: { base: 'ref', accepts: ['vessel'], nullable: true, label: 'Escort of' },
          specs: {
            base: 'record',
            label: 'Specs',
            fields: {
              lengthMm: { base: 'quantity', unit: 'mm', label: 'Length' },
              beamMm: { base: 'quantity', unit: 'mm', label: 'Beam' }
            }
          },
          manifest: { base: 'blob', label: 'Manifest' }
        },
        edges: {
          relations: {
            certificates: { types: ['certificate'], onRemove: 'detach' },
            logs: { types: ['log_entry'], onRemove: 'detach' }
          }
        },
        states: {
          main: { initial: 'moored', values: ['moored', 'underway', 'inspecting', 'laid_up'], terminal: ['laid_up'] }
        },
        transitions: [
          { from: 'moored', to: 'underway', intent: 'depart' },
          { from: 'underway', to: 'inspecting' },
          { from: 'inspecting', to: 'underway' },
          { from: 'underway', to: 'laid_up' },
          { from: 'moored', to: 'laid_up' }
        ],
        render: {
          label: 'Vessel',
          icon: 'pi pi-directions',
          identityField: 'name',
          groups: [
            { id: 'status', label: 'Status', fields: ['name', 'classBand', 'fuel'] },
            { id: 'navigation', label: 'Navigation', fields: ['heading', 'draft', 'crewCount', 'flags'] }
          ],
          states: { underway: { severity: 'info' }, inspecting: { severity: 'warning' }, laid_up: { severity: 'secondary' } }
        }
      }),
      typeRecord({
        id: 'beacon',
        class: 'item',
        fields: {
          code: { base: 'string', label: 'Code' },
          battery: { base: 'quantity', unit: 'percent', label: 'Battery' }
        },
        states: {
          main: { initial: 'dark', values: ['dark', 'lit'], terminal: [] }
        },
        transitions: [{ from: 'dark', to: 'lit' }, { from: 'lit', to: 'dark' }],
        render: { label: 'Beacon', icon: 'pi pi-circle-fill', identityField: 'code', states: { lit: { severity: 'success' } } }
      }),
      typeRecord({
        id: 'certificate',
        class: 'file',
        payload: { mime: ['image/png'], accept: ['.png'], maxSize: 8 * 1024 * 1024, preview: 'image' },
        fields: {
          issuedAt: { base: 'instant', label: 'Issued' },
          authority: {
            base: 'enum',
            label: 'Authority',
            values: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11']
          },
          tolerance: { base: 'quantity', unit: 'mm', label: 'Tolerance' },
          valid: { base: 'boolean', label: 'Valid' }
        },
        render: { label: 'Certificate', icon: 'pi pi-ticket', identityField: 'authority' }
      }),
      typeRecord({
        id: 'log_entry',
        class: 'file',
        payload: { mime: ['text/plain'], accept: ['.txt'], maxSize: 512 * 1024, preview: 'attachment' },
        fields: { entry: { base: 'string', max: 600, label: 'Entry' } },
        render: { label: 'Log entry', icon: 'pi pi-file-edit' }
      }),
      typeRecord({
        id: 'route_run',
        class: 'process',
        fields: {
          legs: {
            base: 'list',
            label: 'Legs',
            itemType: {
              base: 'record',
              fields: {
                fromPort: { base: 'string', label: 'From' },
                toPort: { base: 'string', label: 'To' },
                etaMin: { base: 'quantity', unit: 'min', label: 'ETA' },
                cleared: { base: 'boolean', label: 'Cleared' }
              }
            }
          },
          waypoints: { base: 'map', itemType: { base: 'instant' }, label: 'Waypoints' },
          config: {
            base: 'variant',
            label: 'Config',
            tags: ['direct', 'viaHub'],
            payloads: {
              direct: { base: 'quantity', unit: 'min' },
              viaHub: { base: 'record', fields: { hub: { base: 'ref', accepts: ['convoy'] }, bufferMin: { base: 'quantity', unit: 'min' } } }
            }
          },
          rawTrack: { base: 'json', label: 'Raw track' }
        },
        edges: { relations: { vessels: { types: ['vessel'], onRemove: 'detach' } } },
        states: {
          main: { initial: 'planned', values: ['planned', 'underway', 'diverted', 'complete', 'failed'], terminal: ['complete', 'failed'] }
        },
        transitions: [
          { from: 'planned', to: 'underway', intent: 'sail' },
          { from: 'underway', to: 'diverted' },
          { from: 'diverted', to: 'complete' },
          { from: 'underway', to: 'complete', intent: 'finishRun' },
          { from: 'underway', to: 'failed' }
        ],
        render: {
          label: 'Route run',
          icon: 'pi pi-route',
          groups: [
            { id: 'plan', label: 'Plan', fields: ['legs', 'config'] },
            { id: 'progress', label: 'Progress', fields: ['waypoints', 'rawTrack'] }
          ],
          states: { underway: { severity: 'info' }, diverted: { severity: 'warning' }, complete: { severity: 'success' }, failed: { severity: 'danger' } }
        }
      })
    ]
  };
}

// --- Compiled process contract (CTS vocabulary) --------------------------------

export function createUiMappingCompiledContract() {
  const actions = {
    vessel_create: {
      id: 'vessel_create',
      label: 'Create vessel',
      actionKind: 'createInstance',
      typeId: 'vessel',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      construction: { mode: 'generic', inputs: ['name', 'classBand', 'fuel'] }
    },
    vessel_depart: {
      id: 'vessel_depart',
      label: 'Depart',
      actionKind: 'updateInstance',
      typeId: 'vessel',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      status: { to: 'underway' }
    },
    vessel_layup: {
      id: 'vessel_layup',
      label: 'Lay up',
      actionKind: 'updateInstance',
      typeId: 'vessel',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      status: { to: 'laid_up' }
    },
    vessel_delete: {
      id: 'vessel_delete',
      label: 'Delete vessel',
      actionKind: 'deleteInstance',
      typeId: 'vessel',
      trigger: { mode: 'manual' },
      access: { level: 'admin', grants: [] }
    },
    certificate_link: {
      id: 'certificate_link',
      label: 'Certificate',
      actionKind: 'link',
      typeId: 'vessel',
      relation: { key: 'certificates', targetType: 'certificate', cardinality: 'array' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    certificate_unlink: {
      id: 'certificate_unlink',
      label: 'Unlink certificate',
      actionKind: 'unlink',
      typeId: 'vessel',
      relation: { key: 'certificates', targetType: 'certificate', cardinality: 'array' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    route_sail: {
      id: 'route_sail',
      label: 'Sail',
      actionKind: 'runCommand',
      commandId: 'route.sail',
      typeId: 'route_run',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    vessel_auto_ping: {
      id: 'vessel_auto_ping',
      label: 'Ping vessel',
      actionKind: 'updateInstance',
      typeId: 'vessel',
      trigger: { mode: 'event' },
      access: { level: 'write', grants: [] }
    }
  };

  return {
    processId: 'proc_fixture_v3',
    dataflowVersion: 4,
    roles: {
      operator: { id: 'operator', label: 'Operator', grants: [{ feature: 'vessels', level: 'write' }] }
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
          { id: 'vessels', typeId: 'vessel', mode: 'list', required: null },
          { id: 'convoys', typeId: 'convoy', mode: 'list', required: null }
        ],
        regions: [
          { id: 'vessels', slot: 'main', sourceId: 'vessels', surface: 'list', actions: ['vessel_create'] },
          { id: 'convoys', slot: 'main', sourceId: 'convoys', surface: 'list', actions: [] }
        ],
        actions: ['vessel_create']
      },
      auto_operator_vessel: {
        id: 'auto_operator_vessel',
        screenKey: 'auto_operator_vessel',
        label: 'Operator vessels',
        kind: 'typeList',
        template: 'typeList',
        route: '/screens/auto_operator_vessel',
        sourceRoute: '/screens/auto_operator_vessel',
        placement: 'hub',
        typeId: 'vessel',
        required: { feature: 'vessels', level: 'read' },
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [{ id: 'vessel', typeId: 'vessel', mode: 'list', required: { feature: 'vessels', level: 'read' } }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'vessel', surface: 'list', actions: ['vessel_create', 'certificate_link'] }],
        actions: ['vessel_create', 'certificate_link']
      },
      auto_operator_convoy: {
        id: 'auto_operator_convoy',
        screenKey: 'auto_operator_convoy',
        label: 'Operator convoys',
        kind: 'typeList',
        template: 'typeList',
        route: '/screens/auto_operator_convoy',
        sourceRoute: '/screens/auto_operator_convoy',
        placement: 'hub',
        typeId: 'convoy',
        required: null,
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [{ id: 'convoy', typeId: 'convoy', mode: 'list', required: null }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'convoy', surface: 'list', actions: [] }],
        actions: []
      },
      auto_operator_fleet_detail: {
        id: 'auto_operator_fleet_detail',
        screenKey: 'auto_operator_fleet_detail',
        label: 'Fleet detail',
        kind: 'instanceDetail',
        template: 'instanceDetail',
        route: '/screens/auto_operator_fleet_detail',
        sourceRoute: '/screens/auto_operator_fleet_detail',
        placement: 'detail',
        typeId: 'fleet',
        required: null,
        roleIds: ['operator'],
        scope: { instanceId: 'fleet-1' },
        bindings: {},
        sources: [
          { id: 'fleet', typeId: 'fleet', mode: 'single', required: null, identifier: '$screen.scope.instanceId' },
          { id: 'convoys', typeId: 'convoy', mode: 'list', required: null, lineage: { sourceId: 'fleet', key: 'convoys' } },
          { id: 'directVessels', typeId: 'vessel', mode: 'list', required: null, lineage: { sourceId: 'fleet', key: 'directVessels' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'fleet', surface: 'detail', actions: [] },
          { id: 'convoys', slot: 'children', sourceId: 'convoys', surface: 'list', actions: [] },
          { id: 'directVessels', slot: 'children', sourceId: 'directVessels', surface: 'list', actions: ['vessel_create'] }
        ],
        actions: ['vessel_create']
      },
      auto_operator_vessel_detail: {
        id: 'auto_operator_vessel_detail',
        screenKey: 'auto_operator_vessel_detail',
        label: 'Vessel detail',
        kind: 'instanceDetail',
        template: 'instanceDetail',
        route: '/screens/auto_operator_vessel_detail',
        sourceRoute: '/screens/auto_operator_vessel_detail',
        placement: 'detail',
        typeId: 'vessel',
        required: { feature: 'vessels', level: 'read' },
        roleIds: ['operator'],
        scope: { instanceId: 'vessel-3' },
        bindings: {},
        sources: [
          { id: 'vessel', typeId: 'vessel', mode: 'single', required: { feature: 'vessels', level: 'read' }, identifier: '$screen.scope.instanceId' },
          { id: 'certificates', typeId: 'certificate', mode: 'list', required: null, relation: { sourceId: 'vessel', key: 'certificates' } },
          { id: 'logs', typeId: 'log_entry', mode: 'list', required: null, relation: { sourceId: 'vessel', key: 'logs' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'vessel', surface: 'detail', actions: ['vessel_depart', 'vessel_layup', 'vessel_delete', 'certificate_link'] },
          { id: 'certificates', slot: 'children', sourceId: 'certificates', surface: 'list', actions: ['certificate_link'] },
          { id: 'logs', slot: 'children', sourceId: 'logs', surface: 'list', actions: [] }
        ],
        actions: ['vessel_depart', 'vessel_layup', 'vessel_delete', 'certificate_link', 'certificate_unlink']
      },
      auto_operator_certificate_detail: {
        id: 'auto_operator_certificate_detail',
        screenKey: 'auto_operator_certificate_detail',
        label: 'Certificate detail',
        kind: 'instanceDetail',
        template: 'instanceDetail',
        route: '/screens/auto_operator_certificate_detail',
        sourceRoute: '/screens/auto_operator_certificate_detail',
        placement: 'detail',
        typeId: 'certificate',
        required: null,
        roleIds: ['operator'],
        scope: { instanceId: 'certificate-2' },
        bindings: {},
        sources: [
          { id: 'certificate', typeId: 'certificate', mode: 'single', required: null, identifier: '$screen.scope.instanceId' }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'certificate', surface: 'detail', actions: [] }
        ],
        actions: []
      },
      auto_operator_route_detail: {
        id: 'auto_operator_route_detail',
        screenKey: 'auto_operator_route_detail',
        label: 'Route detail',
        kind: 'instanceDetail',
        template: 'instanceDetail',
        route: '/screens/auto_operator_route_detail',
        sourceRoute: '/screens/auto_operator_route_detail',
        placement: 'detail',
        typeId: 'route_run',
        required: null,
        roleIds: ['operator'],
        scope: { instanceId: 'route-2' },
        bindings: {},
        sources: [
          { id: 'route', typeId: 'route_run', mode: 'single', required: null, identifier: '$screen.scope.instanceId' },
          { id: 'vessels', typeId: 'vessel', mode: 'list', required: null, relation: { sourceId: 'route', key: 'vessels' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'route', surface: 'detail', actions: ['route_sail'] },
          { id: 'vessels', slot: 'children', sourceId: 'vessels', surface: 'list', actions: [] }
        ],
        actions: ['route_sail']
      }
    },
    actions,
    navigation: [{ label: 'Vessels', screenKey: 'auto_operator_vessel', icon: 'pi pi-directions' }]
  };
}

// --- Instances (CTS stored shape) -----------------------------------------------

export function createFleetInstance(overrides = {}) {
  return {
    id: 'fleet-1',
    type: 'fleet',
    typeVersion: 1,
    fields: { name: 'Meridian Line', homePortCode: 'PT-GRN' },
    lineage: {},
    relations: { partnerPorts: [] },
    states: {},
    payload: null,
    ...overrides
  };
}

export function createConvoyInstance(overrides = {}) {
  return {
    id: 'convoy-1',
    type: 'convoy',
    typeVersion: 1,
    fields: { designation: 'MER-A', hullCount: { value: 3, unit: 'count' } },
    lineage: { convoys: { type: 'fleet', id: 'fleet-1' } },
    relations: {},
    states: {},
    payload: null,
    ...overrides
  };
}

export function createPortInstance(overrides = {}) {
  return {
    id: 'port-1',
    type: 'port',
    typeVersion: 1,
    fields: { code: 'PT-GRN', area: { value: 86000, unit: 'm2' }, berthFee: { value: 320, unit: 'currency' } },
    lineage: {},
    relations: {},
    states: {},
    payload: null,
    ...overrides
  };
}

export function createVesselInstance(overrides = {}) {
  return {
    id: 'vessel-1',
    type: 'vessel',
    typeVersion: 1,
    fields: {
      name: 'Corvina',
      classBand: 'coastal',
      crewCount: 9,
      fuel: { value: 64, unit: 'percent' },
      heading: { value: 128.5, unit: 'deg' },
      draft: { value: 4600, unit: 'mm' },
      flags: ['eco'],
      escortOf: null,
      specs: { lengthMm: { value: 38000, unit: 'mm' }, beamMm: { value: 7400, unit: 'mm' } },
      manifest: { fileId: 'gridfs-manifest-1', mime: 'application/json', size: 7_400 }
    },
    lineage: {},
    relations: { certificates: [], logs: [] },
    states: { main: 'moored' },
    payload: null,
    ...overrides
  };
}

export function createBeaconInstance(overrides = {}) {
  return {
    id: 'beacon-1',
    type: 'beacon',
    typeVersion: 1,
    fields: { code: 'BN-114', battery: { value: 87, unit: 'percent' } },
    lineage: {},
    relations: {},
    states: { main: 'lit' },
    payload: null,
    ...overrides
  };
}

export function createCertificateInstance(overrides = {}) {
  return {
    id: 'certificate-1',
    type: 'certificate',
    typeVersion: 1,
    fields: {
      issuedAt: '2026-01-20T00:00:00.000Z',
      authority: 'A4',
      tolerance: { value: 0.5, unit: 'mm' },
      valid: true
    },
    lineage: {},
    relations: {},
    states: {},
    payload: { fileId: 'gridfs-certificate-1', mime: 'image/png', size: 1_900_000 },
    ...overrides
  };
}

export function createLogEntryInstance(overrides = {}) {
  return {
    id: 'log-1',
    type: 'log_entry',
    typeVersion: 1,
    fields: { entry: 'Watch change completed; drift compensation adjusted after the tidal current shifted two points to starboard.' },
    lineage: {},
    relations: {},
    states: {},
    payload: { fileId: 'gridfs-log-1', mime: 'text/plain', size: 3_100 },
    ...overrides
  };
}

export function createRouteRunInstance(overrides = {}) {
  return {
    id: 'route-1',
    type: 'route_run',
    typeVersion: 1,
    fields: {
      legs: [
        { fromPort: 'PT-GRN', toPort: 'PT-KLV', etaMin: { value: 640, unit: 'min' }, cleared: true },
        { fromPort: 'PT-KLV', toPort: 'PT-ARN', etaMin: { value: 410, unit: 'min' }, cleared: false }
      ],
      waypoints: { departure: '2026-07-01T06:00:00.000Z', pilot: '2026-07-01T07:30:00.000Z' },
      config: { tag: 'direct', value: { value: 45, unit: 'min' } },
      rawTrack: { source: 'ais', points: 1180 }
    },
    lineage: {},
    relations: { vessels: [] },
    states: { main: 'planned' },
    payload: null,
    ...overrides
  };
}

// The instance graph: one fleet holding convoys AND direct vessels (two
// child types), vessels moored under a port (third parent type), escort
// self-refs, varied certificate/log cardinality, and three route runs —
// one diverting via a convoy (ref inside a variant payload).
export function createUiMappingInstances() {
  const certificates = Array.from({ length: 6 }, (_, index) => createCertificateInstance({
    id: `certificate-${index + 1}`,
    fields: {
      issuedAt: `2026-0${(index % 8) + 1}-1${index % 9}T00:00:00.000Z`,
      authority: `A${(index % 11) + 1}`,
      tolerance: { value: 0.2 + index * 0.1, unit: 'mm' },
      valid: index % 4 !== 3
    },
    payload: { fileId: `gridfs-certificate-${index + 1}`, mime: 'image/png', size: 1_200_000 + index * 220_000 }
  }));

  const logs = Array.from({ length: 6 }, (_, index) => createLogEntryInstance({
    id: `log-${index + 1}`,
    fields: { entry: `Watch ${index + 1}: sea state ${(4 - index % 3).toFixed(0)}, consumption ${(22 - index).toFixed(1)} t/day, machinery nominal through the shift.` },
    payload: { fileId: `gridfs-log-${index + 1}`, mime: 'text/plain', size: 2_600 + index * 500 }
  }));

  const parentByIndex = [
    { key: 'convoys', id: 'convoy-1' },
    { key: 'convoys', id: 'convoy-1' },
    { key: 'directVessels', id: 'fleet-1' },
    { key: 'convoys', id: 'convoy-2' },
    { key: 'convoys', id: 'convoy-2' },
    { key: 'moorings', id: 'port-1' },
    { key: 'moorings', id: 'port-1' },
    { key: 'directVessels', id: 'fleet-1' },
    { key: 'convoys', id: 'convoy-3' },
    { key: 'moorings', id: 'port-1' }
  ];
  const certCounts = [2, 0, 1, 4, 0, 6, 1, 0, 3, 2];
  const vesselStates = ['moored', 'underway', 'moored', 'underway', 'inspecting', 'moored', 'laid_up', 'underway', 'moored', 'underway'];
  const vessels = parentByIndex.map((parent, index) => createVesselInstance({
    id: `vessel-${index + 1}`,
    fields: {
      ...createVesselInstance().fields,
      name: ['Corvina', 'Aster', 'Brisk', 'Dourado', 'Fen', 'Galt', 'Halm', 'Ilex', 'Joskin', 'Kite'][index],
      classBand: ['coastal', 'oceanic', 'inland'][index % 3],
      crewCount: 5 + index * 2,
      fuel: { value: [91, 42, 68, 17, 77, 55, 95, 33, 60, 48][index], unit: 'percent' },
      heading: { value: 15 + index * 33, unit: 'deg' },
      draft: { value: 3200 + index * 550, unit: 'mm' },
      flags: [['eco'], ['hazard', 'priority'], [], ['eco', 'priority'], ['hazard'], [], ['eco'], ['priority'], [], ['eco', 'hazard']][index],
      escortOf: index % 4 === 1 && index > 0 ? { type: 'vessel', id: `vessel-${index}` } : null,
      specs: { lengthMm: { value: 28000 + index * 3600, unit: 'mm' }, beamMm: { value: 6200 + index * 420, unit: 'mm' } }
    },
    lineage: { [parent.key]: { type: parent.key === 'convoys' ? 'convoy' : parent.key === 'moorings' ? 'port' : 'fleet', id: parent.id } },
    relations: {
      certificates: certificates.slice(0, certCounts[index]).map(certificate => ({ type: 'certificate', id: certificate.id })),
      logs: logs.slice(0, index % 4).map(log => ({ type: 'log_entry', id: log.id }))
    },
    states: { main: vesselStates[index] }
  }));

  return {
    fleets: [createFleetInstance()],
    convoys: [
      createConvoyInstance(),
      createConvoyInstance({ id: 'convoy-2', fields: { designation: 'MER-B', hullCount: { value: 2, unit: 'count' } } }),
      createConvoyInstance({ id: 'convoy-3', fields: { designation: 'MER-C', hullCount: { value: 1, unit: 'count' } } })
    ],
    ports: [
      createPortInstance(),
      createPortInstance({ id: 'port-2', fields: { code: 'PT-KLV', area: { value: 41000, unit: 'm2' }, berthFee: { value: 210, unit: 'currency' } } })
    ],
    vessels,
    beacons: [createBeaconInstance()],
    certificates,
    logEntries: logs,
    routes: [
      createRouteRunInstance(),
      createRouteRunInstance({
        id: 'route-2',
        states: { main: 'underway' },
        relations: { vessels: [vessels[1], vessels[3], vessels[7]].map(vessel => ({ type: 'vessel', id: vessel.id })) },
        fields: {
          ...createRouteRunInstance().fields,
          config: { tag: 'viaHub', value: { hub: { type: 'convoy', id: 'convoy-2' }, bufferMin: { value: 90, unit: 'min' } } }
        }
      }),
      createRouteRunInstance({
        id: 'route-3',
        states: { main: 'failed' },
        relations: { vessels: [{ type: 'vessel', id: 'vessel-6' }] },
        fields: {
          ...createRouteRunInstance().fields,
          legs: [{ fromPort: 'PT-GRN', toPort: 'PT-ARN', etaMin: { value: 980, unit: 'min' }, cleared: false }],
          config: { tag: 'direct', value: { value: 0, unit: 'min' } }
        }
      })
    ]
  };
}

export function withFleetPartners() {
  const instances = createUiMappingInstances();
  instances.fleets[0].relations.partnerPorts = [
    { type: 'port', id: 'port-1' },
    { type: 'port', id: 'port-2' }
  ];
  return instances;
}
