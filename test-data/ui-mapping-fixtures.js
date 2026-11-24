// Synthetic UI-mapping fixtures: hydration four — a self-recursive
// filesystem-like graph that breaks the skeleton every previous hydration
// shared (rooted group-tree > items inside > files attached to items):
// containment recurses (folders inside folders, six levels), there is NO
// root (a forest of top folders plus items with no lineage at all), the
// rich types are files (documents supersede each other and many-to-many
// link sheets; folders pin documents), items are minimal floating keepers,
// and the bulk of the data is a stream of small stateful processes
// (watch jobs). No timeline type exists. The UI generation layer has zero
// domain knowledge.

// Bundle records derive exactly the way `compileClientBundle()` does:
// authored name/glyph/field labels plus the derived display policy
// (`renderPolicyFor` over the declaration-shaped record).
import { renderPolicyFor } from '#packages/cts';

const ORGANIZATION_ID = 'org-fixture-4';

// --- CTS client bundle --------------------------------------------------------

function typeRecord(declaration) {
  const record = {
    id: declaration.id,
    class: declaration.class,
    scope: declaration.scope || 'system',
    version: declaration.version || 1,
    name: declaration.name || null,
    glyph: declaration.glyph || null,
    fields: declaration.fields || {},
    payload: declaration.payload || null,
    edges: declaration.edges || {},
    operators: declaration.operators || {},
    revisions: declaration.revisions || null
  };
  const policy = renderPolicyFor(record);
  return {
    ...record,
    name: policy.name,
    glyph: policy.glyph,
    identifier: policy.identifier,
    depiction: policy.depiction,
    sections: policy.sections,
    schema: null
  };
}

export function createUiMappingClientBundle() {
  return {
    ok: true,
    errors: [],
    organizationId: ORGANIZATION_ID,
    types: [
      typeRecord({
        id: 'folder',
        class: 'group',
        name: 'Folder',
        glyph: 'pi pi-folder',
        fields: {
          name: { base: 'string', identifier: true, label: 'Name' }
        },
        edges: {
          children: {
            folders: { types: ['folder'], onRemove: 'restrict' },
            documents: { types: ['document'], onRemove: 'restrict' }
          },
          relations: {
            pinned: { types: ['document'], onRemove: 'detach' }
          }
        }
      }),
      typeRecord({
        id: 'document',
        class: 'file',
        name: 'Document',
        glyph: 'pi pi-file',
        payload: { mime: ['image/png'], accept: ['.png'], maxSize: 12 * 1024 * 1024, preview: 'image' },
        fields: {
          title: { base: 'string', identifier: true, label: 'Title' },
          pages: { base: 'number', label: 'Pages' },
          weightG: { base: 'quantity', unit: 'count', label: 'Weight (g)' },
          tags: { base: 'list', itemType: { base: 'string' }, label: 'Tags' },
          supersedes: { base: 'ref', accepts: ['document'], nullable: true, label: 'Supersedes' },
          owner: { base: 'ref', accepts: ['keeper'], label: 'Owner' },
          scan: { base: 'blob', label: 'Scan' }
        },
        edges: {
          relations: {
            linkedSheets: { types: ['sheet'], onRemove: 'detach' }
          }
        }
      }),
      typeRecord({
        id: 'sheet',
        class: 'file',
        name: 'Sheet',
        glyph: 'pi pi-table',
        payload: { mime: ['application/x-sheet'], accept: ['.sheet'], preview: 'geometry' },
        fields: {
          code: { base: 'string', identifier: true, label: 'Code' },
          rows: { base: 'quantity', unit: 'count', label: 'Rows' },
          margins: {
            base: 'record',
            label: 'Margins',
            fields: {
              topMm: { base: 'quantity', unit: 'mm', label: 'Top' },
              leftMm: { base: 'quantity', unit: 'mm', label: 'Left' }
            }
          },
          overrides: { base: 'map', itemType: { base: 'quantity', unit: 'mm' }, label: 'Overrides' },
          format: {
            base: 'variant',
            label: 'Format',
            tags: ['ascii', 'binary', 'mixed'],
            payloads: {
              ascii: { base: 'record', fields: { delimiter: { base: 'string' } } },
              binary: { base: 'quantity', unit: 'count' },
              mixed: { base: 'string' }
            }
          },
          grid: { base: 'json', label: 'Grid' },
          locked: { base: 'boolean', label: 'Locked' }
        },
        edges: {
          relations: {
            sources: { types: ['document'], onRemove: 'detach' }
          }
        }
      }),
      typeRecord({
        id: 'keeper',
        class: 'item',
        name: 'Keeper',
        glyph: 'pi pi-user',
        fields: {
          serial: { base: 'string', identifier: true, label: 'Serial' },
          load: { base: 'quantity', unit: 'percent', label: 'Load' }
        }
      }),
      typeRecord({
        id: 'watch_job',
        class: 'process',
        name: 'Watch job',
        glyph: 'pi pi-eye',
        fields: {
          priority: {
            base: 'enum',
            label: 'Priority',
            values: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']
          },
          startedAt: { base: 'instant', nullable: true, label: 'Started' },
          durationMin: { base: 'quantity', unit: 'min', label: 'Duration' },
          note: { base: 'string', max: 400, label: 'Note' }
        },
        edges: {
          relations: {
            targets: { types: ['document'], onRemove: 'detach' },
            watcher: { types: ['keeper'], onRemove: 'detach' }
          }
        }
      })
    ]
  };
}

// --- Compiled process contract (CTS vocabulary) --------------------------------

export function createUiMappingCompiledContract() {
  const actions = {
    doc_create: {
      id: 'doc_create',
      label: 'Create document',
      actionKind: 'createInstance',
      typeId: 'document',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      construction: { mode: 'generic', inputs: ['title', 'pages'] }
    },
    doc_delete: {
      id: 'doc_delete',
      label: 'Delete document',
      actionKind: 'deleteInstance',
      typeId: 'document',
      trigger: { mode: 'manual' },
      access: { level: 'admin', grants: [] }
    },
    sheet_link: {
      id: 'sheet_link',
      label: 'Sheet',
      actionKind: 'link',
      typeId: 'document',
      relation: { key: 'linkedSheets', targetTypes: ['sheet'], cardinality: 'many' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    sheet_unlink: {
      id: 'sheet_unlink',
      label: 'Unlink sheet',
      actionKind: 'unlink',
      typeId: 'document',
      relation: { key: 'linkedSheets', targetTypes: ['sheet'], cardinality: 'many' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    job_start: {
      id: 'job_start',
      label: 'Start',
      actionKind: 'updateInstance',
      typeId: 'watch_job',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      state: { to: 'running' }
    },
    job_abort: {
      id: 'job_abort',
      label: 'Abort',
      actionKind: 'updateInstance',
      typeId: 'watch_job',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      state: { to: 'aborted' }
    },
    job_run: {
      id: 'job_run',
      label: 'Run sweep',
      actionKind: 'runCommand',
      commandId: 'watch.sweep',
      typeId: 'watch_job',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    job_auto_recheck: {
      id: 'job_auto_recheck',
      label: 'Recheck job',
      actionKind: 'updateInstance',
      typeId: 'watch_job',
      trigger: { mode: 'event' },
      access: { level: 'write', grants: [] }
    }
  };

  return {
    processId: 'proc_fixture_v4',
    dataflowVersion: 4,
    // The flat state vocabulary's display policy (SPEC §7): what a
    // compiled producer workflow would carry for the authored state
    // nodes — derived per type by statePolicyByType in real hydration.
    statePolicy: {
      keeper: {
        available: { label: null, severity: null, icon: null, terminal: false },
        busy: { label: null, severity: 'info', icon: null, terminal: false },
        away: { label: null, severity: null, icon: null, terminal: false }
      },
      watch_job: {
        queued: { label: null, severity: null, icon: null, terminal: false },
        running: { label: null, severity: 'info', icon: null, terminal: false },
        review: { label: null, severity: 'warning', icon: null, terminal: false },
        done: { label: null, severity: 'success', icon: null, terminal: true },
        aborted: { label: null, severity: 'danger', icon: null, terminal: true }
      }
    },
    // The authored machine edges the same producer workflows would carry
    // (stateTransitionsByType in real hydration): the board projection's
    // legal-move contract over those vocabularies.
    stateTransitions: {
      keeper: [
        { from: 'available', to: 'busy', region: 'lifecycle', intent: null },
        { from: 'busy', to: 'away', region: 'lifecycle', intent: null },
        { from: 'away', to: 'available', region: 'lifecycle', intent: null }
      ],
      watch_job: [
        { from: 'queued', to: 'running', region: 'lifecycle', intent: 'start' },
        { from: 'running', to: 'review', region: 'lifecycle', intent: null },
        { from: 'running', to: 'aborted', region: 'lifecycle', intent: 'abort' },
        { from: 'queued', to: 'aborted', region: 'lifecycle', intent: 'abort' },
        { from: 'review', to: 'done', region: 'lifecycle', intent: null }
      ]
    },
    roles: {
      operator: { id: 'operator', label: 'Operator', grants: [{ feature: 'documents', level: 'write' }] }
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
          { id: 'jobs', typeId: 'watch_job', mode: 'list', required: null },
          { id: 'documents', typeId: 'document', mode: 'list', required: null }
        ],
        regions: [
          { id: 'jobs', slot: 'main', sourceId: 'jobs', surface: 'list', actions: [] },
          { id: 'documents', slot: 'main', sourceId: 'documents', surface: 'list', actions: ['doc_create'] }
        ],
        actions: ['doc_create']
      },
      auto_operator_watch_job: {
        id: 'auto_operator_watch_job',
        screenKey: 'auto_operator_watch_job',
        label: 'Operator watch jobs',
        kind: 'typeList',
        template: 'typeList',
        route: '/screens/auto_operator_watch_job',
        sourceRoute: '/screens/auto_operator_watch_job',
        placement: 'hub',
        typeId: 'watch_job',
        required: null,
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [{ id: 'job', typeId: 'watch_job', mode: 'list', required: null }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'job', surface: 'list', actions: ['job_run'] }],
        actions: ['job_run']
      },
      auto_operator_document: {
        id: 'auto_operator_document',
        screenKey: 'auto_operator_document',
        label: 'Operator documents',
        kind: 'typeList',
        template: 'typeList',
        route: '/screens/auto_operator_document',
        sourceRoute: '/screens/auto_operator_document',
        placement: 'hub',
        typeId: 'document',
        required: { feature: 'documents', level: 'read' },
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [{ id: 'document', typeId: 'document', mode: 'list', required: { feature: 'documents', level: 'read' } }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'document', surface: 'list', actions: ['doc_create', 'sheet_link'] }],
        actions: ['doc_create', 'sheet_link']
      },
      auto_operator_folder_detail: {
        id: 'auto_operator_folder_detail',
        screenKey: 'auto_operator_folder_detail',
        label: 'Folder detail',
        kind: 'instanceDetail',
        template: 'instanceDetail',
        route: '/screens/auto_operator_folder_detail',
        sourceRoute: '/screens/auto_operator_folder_detail',
        placement: 'detail',
        typeId: 'folder',
        required: null,
        roleIds: ['operator'],
        scope: { instanceId: 'folder-a1ai' },
        bindings: {},
        sources: [
          { id: 'folder', typeId: 'folder', mode: 'single', required: null, identifier: '$screen.scope.instanceId' },
          { id: 'subfolders', typeId: 'folder', mode: 'list', required: null, lineage: { sourceId: 'folder', key: 'folders' } },
          { id: 'docs', typeId: 'document', mode: 'list', required: null, lineage: { sourceId: 'folder', key: 'documents' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'folder', surface: 'detail', actions: [] },
          { id: 'subfolders', slot: 'children', sourceId: 'subfolders', surface: 'list', actions: [] },
          { id: 'docs', slot: 'children', sourceId: 'docs', surface: 'list', actions: ['doc_create'] }
        ],
        actions: ['doc_create']
      },
      auto_operator_document_detail: {
        id: 'auto_operator_document_detail',
        screenKey: 'auto_operator_document_detail',
        label: 'Document detail',
        kind: 'instanceDetail',
        template: 'instanceDetail',
        route: '/screens/auto_operator_document_detail',
        sourceRoute: '/screens/auto_operator_document_detail',
        placement: 'detail',
        typeId: 'document',
        required: { feature: 'documents', level: 'read' },
        roleIds: ['operator'],
        scope: { instanceId: 'document-4' },
        bindings: {},
        sources: [
          { id: 'document', typeId: 'document', mode: 'single', required: { feature: 'documents', level: 'read' }, identifier: '$screen.scope.instanceId' },
          { id: 'sheets', typeId: 'sheet', mode: 'list', required: null, relation: { sourceId: 'document', key: 'linkedSheets' } },
          { id: 'jobs', typeId: 'watch_job', mode: 'list', required: null }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'document', surface: 'detail', actions: ['doc_delete', 'sheet_link'] },
          { id: 'sheets', slot: 'children', sourceId: 'sheets', surface: 'list', actions: ['sheet_link'] },
          { id: 'jobs', slot: 'children', sourceId: 'jobs', surface: 'list', actions: [] }
        ],
        actions: ['doc_delete', 'sheet_link', 'sheet_unlink']
      },
      auto_operator_sheet_detail: {
        id: 'auto_operator_sheet_detail',
        screenKey: 'auto_operator_sheet_detail',
        label: 'Sheet detail',
        kind: 'instanceDetail',
        template: 'instanceDetail',
        route: '/screens/auto_operator_sheet_detail',
        sourceRoute: '/screens/auto_operator_sheet_detail',
        placement: 'detail',
        typeId: 'sheet',
        required: null,
        roleIds: ['operator'],
        scope: { instanceId: 'sheet-2' },
        bindings: {},
        sources: [
          { id: 'sheet', typeId: 'sheet', mode: 'single', required: null, identifier: '$screen.scope.instanceId' },
          { id: 'sources', typeId: 'document', mode: 'list', required: null, relation: { sourceId: 'sheet', key: 'sources' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'sheet', surface: 'detail', actions: [] },
          { id: 'sources', slot: 'children', sourceId: 'sources', surface: 'list', actions: [] }
        ],
        actions: []
      },
      auto_operator_job_detail: {
        id: 'auto_operator_job_detail',
        screenKey: 'auto_operator_job_detail',
        label: 'Watch job detail',
        kind: 'instanceDetail',
        template: 'instanceDetail',
        route: '/screens/auto_operator_job_detail',
        sourceRoute: '/screens/auto_operator_job_detail',
        placement: 'detail',
        typeId: 'watch_job',
        required: null,
        roleIds: ['operator'],
        scope: { instanceId: 'job-3' },
        bindings: {},
        sources: [
          { id: 'job', typeId: 'watch_job', mode: 'single', required: null, identifier: '$screen.scope.instanceId' },
          { id: 'targets', typeId: 'document', mode: 'list', required: null, relation: { sourceId: 'job', key: 'targets' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'job', surface: 'detail', actions: ['job_start', 'job_abort', 'job_run'] },
          { id: 'targets', slot: 'children', sourceId: 'targets', surface: 'list', actions: [] }
        ],
        actions: ['job_start', 'job_abort', 'job_run']
      }
    },
    actions,
    navigation: [{ label: 'Documents', screenKey: 'auto_operator_document', icon: 'pi pi-file' }]
  };
}

// --- Instances (CTS stored shape) -----------------------------------------------

export function createFolderInstance(overrides = {}) {
  return {
    id: 'folder-a',
    type: 'folder',
    typeVersion: 1,
    fields: { name: 'Archive A' },
    lineage: {},
    relations: { pinned: [] },
    states: {},
    payload: null,
    ...overrides
  };
}

export function createDocumentInstance(overrides = {}) {
  return {
    id: 'document-1',
    type: 'document',
    typeVersion: 1,
    fields: {
      title: 'Ledger folio 1',
      pages: 3,
      weightG: { value: 240, unit: 'count' },
      tags: ['primary'],
      scan: { fileId: 'gridfs-scan-1', mime: 'image/png', size: 2_400_000 }
    },
    lineage: { documents: { type: 'folder', id: 'folder-a1ai' } },
    relations: { linkedSheets: [], supersedes: null, owner: { type: 'keeper', id: 'keeper-1' } },
    state: null,
    payload: { fileId: 'gridfs-doc-1', mime: 'image/png', size: 3_100_000 },
    ...overrides
  };
}

export function createSheetInstance(overrides = {}) {
  return {
    id: 'sheet-1',
    type: 'sheet',
    typeVersion: 1,
    fields: {
      code: 'SH-01',
      rows: { value: 64, unit: 'count' },
      margins: { topMm: { value: 12, unit: 'mm' }, leftMm: { value: 9, unit: 'mm' } },
      overrides: { colW: { value: 3.5, unit: 'mm' } },
      format: { tag: 'ascii', value: { delimiter: ';' } },
      grid: { cols: 12, fixed: true },
      locked: false
    },
    lineage: {},
    relations: { sources: [] },
    state: null,
    payload: { fileId: 'gridfs-sheet-1', mime: 'application/x-sheet', size: 210_000 },
    ...overrides
  };
}

export function createKeeperInstance(overrides = {}) {
  return {
    id: 'keeper-1',
    type: 'keeper',
    typeVersion: 1,
    fields: { serial: 'KPR-01', load: { value: 30, unit: 'percent' } },
    lineage: {},
    relations: {},
    state: 'busy',
    payload: null,
    ...overrides
  };
}

export function createWatchJobInstance(overrides = {}) {
  return {
    id: 'job-1',
    type: 'watch_job',
    typeVersion: 1,
    fields: {
      priority: 'p2',
      startedAt: '2026-04-02T08:15:00.000Z',
      durationMin: { value: 45, unit: 'min' },
      note: 'Routine sweep over the pinned set with drift detection enabled across the whole index.'
    },
    lineage: {},
    relations: { targets: [], watcher: { type: 'keeper', id: 'keeper-2' } },
    state: 'queued',
    payload: null,
    ...overrides
  };
}

// The instance graph: a forest of three top folders, one branch recursing
// six levels deep; documents with a three-step supersedes chain and
// many-to-many sheet links; keepers floating with no lineage; fourteen
// small watch jobs as the bulk of the data.
export function createUiMappingInstances() {
  const folders = [
    createFolderInstance(),
    createFolderInstance({ id: 'folder-b', fields: { name: 'Archive B' } }),
    createFolderInstance({ id: 'folder-c', fields: { name: 'Archive C' } }),
    createFolderInstance({ id: 'folder-a1', lineage: { folders: { type: 'folder', id: 'folder-a' } }, fields: { name: 'Shelf A1' } }),
    createFolderInstance({ id: 'folder-a2', lineage: { folders: { type: 'folder', id: 'folder-a' } }, fields: { name: 'Shelf A2' } }),
    createFolderInstance({ id: 'folder-a1a', lineage: { folders: { type: 'folder', id: 'folder-a1' } }, fields: { name: 'Box A1a' } }),
    createFolderInstance({ id: 'folder-b1', lineage: { folders: { type: 'folder', id: 'folder-b' } }, fields: { name: 'Shelf B1' } }),
    createFolderInstance({ id: 'folder-a1ai', lineage: { folders: { type: 'folder', id: 'folder-a1a' } }, fields: { name: 'Binder A1a-i' } }),
    createFolderInstance({ id: 'folder-c1', lineage: { folders: { type: 'folder', id: 'folder-c' } }, fields: { name: 'Shelf C1' } }),
    createFolderInstance({ id: 'folder-a1aialpha', lineage: { folders: { type: 'folder', id: 'folder-a1ai' } }, fields: { name: 'Sleeve A1a-i-α' } }),
    createFolderInstance({ id: 'folder-a1aialpha7', lineage: { folders: { type: 'folder', id: 'folder-a1aialpha' } }, fields: { name: 'Leaf A1a-i-α-7' } })
  ];

  const sheets = Array.from({ length: 7 }, (_, index) => createSheetInstance({
    id: `sheet-${index + 1}`,
    fields: {
      code: `SH-${String(index + 1).padStart(2, '0')}`,
      rows: { value: 32 + index * 24, unit: 'count' },
      margins: { topMm: { value: 8 + index, unit: 'mm' }, leftMm: { value: 6 + index, unit: 'mm' } },
      overrides: index % 2 === 0 ? { colW: { value: 2.5 + index, unit: 'mm' } } : {},
      format: [
        { tag: 'ascii', value: { delimiter: ';' } },
        { tag: 'binary', value: { value: 64 + index * 16, unit: 'count' } },
        { tag: 'mixed', value: 'row-headers plus binary body' }
      ][index % 3],
      grid: { cols: 8 + index * 2, fixed: index % 2 === 0 },
      locked: index % 4 === 3
    },
    payload: { fileId: `gridfs-sheet-${index + 1}`, mime: 'application/x-sheet', size: 160_000 + index * 30_000 }
  }));

  const folderByIndex = ['folder-a1ai', 'folder-a1ai', 'folder-a1aialpha', 'folder-a1aialpha', 'folder-a2', 'folder-b1', 'folder-b1', 'folder-c1', 'folder-a1ai', 'folder-a1a', 'folder-a1ai'];
  const titles = ['Ledger folio', 'Manifest', 'Index card', 'Draft memo', 'Waybill', 'Receipt roll', 'Register', 'Survey plate', 'Addendum', 'Inventory', 'Letter'];
  const linkedCounts = [3, 0, 1, 5, 0, 2, 1, 0, 4, 1, 2];
  const documents = folderByIndex.map((folderId, index) => createDocumentInstance({
    id: `document-${index + 1}`,
    fields: {
      title: `${titles[index]} ${index + 1}`,
      pages: 2 + (index % 7),
      weightG: { value: 120 + index * 40, unit: 'count' },
      tags: ['primary', 'copy', 'fragile', 'indexed'].slice(0, 1 + (index % 3)),
      scan: { fileId: `gridfs-scan-${index + 1}`, mime: 'image/png', size: 900_000 + index * 260_000 }
    },
    lineage: { documents: { type: 'folder', id: folderId } },
    relations: {
      linkedSheets: sheets.slice(0, linkedCounts[index]).map(sheet => ({ type: 'sheet', id: sheet.id })),
      supersedes: index >= 1 ? { type: 'document', id: `document-${index}` } : null,
      owner: { type: 'keeper', id: index % 2 === 0 ? 'keeper-1' : 'keeper-3' }
    },
    payload: { fileId: `gridfs-doc-${index + 1}`, mime: 'image/png', size: 1_400_000 + index * 310_000 }
  }));

  sheets.forEach((sheet, index) => {
    sheet.relations.sources = documents
      .filter(document => document.relations.linkedSheets.some(ref => ref.id === sheet.id))
      .map(document => ({ type: 'document', id: document.id }));
  });

  folders[0].relations.pinned = [{ type: 'document', id: 'document-1' }, { type: 'document', id: 'document-9' }];
  folders[8].relations.pinned = [{ type: 'document', id: 'document-4' }];

  const jobStates = ['queued', 'running', 'review', 'running', 'done', 'queued', 'aborted', 'running', 'review', 'queued', 'done', 'running', 'queued', 'review'];
  const jobs = jobStates.map((state, index) => createWatchJobInstance({
    id: `job-${index + 1}`,
    fields: {
      priority: `p${index % 11}`,
      startedAt: state === 'queued' ? null : `2026-04-${String(2 + (index % 27)).padStart(2, '0')}T${String(6 + (index % 14)).padStart(2, '0')}:00:00.000Z`,
      durationMin: { value: 15 + index * 5, unit: 'min' },
      note: `Sweep ${index + 1}: ${['index drift', 'page tears', 'weight deltas', 'tag rot'][index % 4]} checked against the pinned set with tolerance band ${index % 3}.`
    },
    relations: {
      targets: documents.slice(index % 4, (index % 4) + 1 + (index % 3)).map(document => ({ type: 'document', id: document.id })),
      watcher: { type: 'keeper', id: index % 2 === 0 ? 'keeper-2' : 'keeper-1' }
    },
    state
  }));

  return {
    folders,
    documents,
    sheets,
    keepers: [
      createKeeperInstance(),
      createKeeperInstance({ id: 'keeper-2', fields: { serial: 'KPR-02', load: { value: 82, unit: 'percent' } }, state: 'available' }),
      createKeeperInstance({ id: 'keeper-3', fields: { serial: 'KPR-03', load: { value: 12, unit: 'percent' } }, state: 'away' })
    ],
    jobs
  };
}
