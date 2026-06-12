/**
 * Central registry for Entity-specific UI properties.
 * Maps entity types to their icons and routing patterns.
 */
export const ENTITY_UI = {
    project: { icon: 'pi pi-folder', route: (id) => `/project/${id}/queues` },
    queue: { icon: 'pi pi-list', route: (id, slug) => `/project/${slug}/queues` },
    nestingRun: { icon: 'pi pi-list-check', route: (id) => `/nesting-runs/${id}` },
    nesting_run: { icon: 'pi pi-list-check', route: (id) => `/nesting-runs/${id}` },
    sheetDesign: { icon: 'pi pi-map', route: (id) => `/design/sheet/${id}` },
    sheet_design: { icon: 'pi pi-map', route: (id) => `/design/sheet/${id}` },
    cassetteDesign: { icon: 'pi pi-pencil', route: () => `/assets/cassettes` },
    cassette_design: { icon: 'pi pi-pencil', route: () => `/assets/cassettes` },
    cassetteTemplate: { icon: 'pi pi-palette', route: (id) => `/assets/templates` },
    cassette_template: { icon: 'pi pi-palette', route: (id) => `/assets/templates` },
    cassetteInstance: { icon: 'pi pi-box', route: (id) => `/production/instance/${id}` },
    cassette_instance: { icon: 'pi pi-box', route: (id) => `/production/instance/${id}` },
    warehouse: { icon: 'pi pi-building', route: (id) => `/warehouses` },
    catalog: { icon: 'pi pi-book', route: (id) => `/catalog` },
    color: { icon: 'pi pi-palette', route: (id) => `/catalog` },
    requisition: { icon: 'pi pi-shopping-cart', route: (id) => `/requisitions` },
    batch: { icon: 'pi pi-truck', route: (id) => `/warehouses` },
    batchPile: { icon: 'pi pi-clone', route: (id) => `/warehouses` },
    sheet: { icon: 'pi pi-file', route: (id) => `/warehouses` },
    remnant: { icon: 'pi pi-undo', route: (id) => `/warehouses` },
    materialPile: { icon: 'pi pi-database', route: (id) => `/warehouses` },
    material_pile: { icon: 'pi pi-database', route: (id) => `/warehouses` },
    toolProfile: { icon: 'pi pi-wrench', route: (id) => `/assets/tools` },
    tool_profile: { icon: 'pi pi-wrench', route: (id) => `/assets/tools` },
    penTemplate: { icon: 'pi pi-palette', route: (id) => `/assets/pens` },
    pen_template: { icon: 'pi pi-palette', route: (id) => `/assets/pens` },
    layerStandard: { icon: 'pi pi-sitemap', route: (id) => `/assets/layer-standards` },
    layer_standard: { icon: 'pi pi-sitemap', route: (id) => `/assets/layer-standards` },
    entityRevision: { icon: 'pi pi-code-branch', route: (id) => `/admin/workbench` },
    entity_revision: { icon: 'pi pi-code-branch', route: (id) => `/admin/workbench` },
    geometryCapture: { icon: 'pi pi-camera', route: (id) => `/geometry-captures` },
    geometry_capture: { icon: 'pi pi-camera', route: (id) => `/geometry-captures` },
    user: { icon: 'pi pi-user', route: (id) => `/admin/users` },
    organization: { icon: 'pi pi-building', route: (id) => `/admin/organizations` },
    artifact: { icon: 'pi pi-file', route: (id) => `/api/artifacts/${id}` }
};

/**
 * Maps all system statuses to PrimeVue severities and icons.
 */
export const STATUS_MAPPINGS = {
    // Requisition
    draft: { label: 'status.draft', severity: 'secondary', icon: 'pi pi-pencil' },
    sent: { label: 'status.sent', severity: 'info', icon: 'pi pi-send' },
    approved: { label: 'status.approved', severity: 'success', icon: 'pi pi-check-circle' },
    rejected: { label: 'status.rejected', severity: 'danger', icon: 'pi pi-times-circle' },
    in_fulfillment: { label: 'status.fulfilling', severity: 'warn', icon: 'pi pi-cog' },
    fulfilled: { label: 'status.fulfilled', severity: 'success', icon: 'pi pi-box' },
    canceled: { label: 'status.canceled', severity: 'danger', icon: 'pi pi-ban' },

    // Batch (Delivery)
    requested: { label: 'status.requested', severity: 'secondary', icon: 'pi pi-clock' },
    assembled: { label: 'status.assembled', severity: 'info', icon: 'pi pi-briefcase' },
    arrived: { label: 'status.arrived', severity: 'success', icon: 'pi pi-map-marker' },
    in_stock: { label: 'status.inStock', severity: 'success', icon: 'pi pi-home' },
    partially_used: { label: 'status.partiallyUsed', severity: 'warn', icon: 'pi pi-chart-pie' },
    used_up: { label: 'status.usedUp', severity: 'danger', icon: 'pi pi-trash' },

    // Queue (Production)
    DRAFT: { label: 'status.draft', severity: 'info', icon: 'pi pi-pencil' },
    NESTING: { label: 'status.nesting', severity: 'warn', icon: 'pi pi-cog' },
    READY: { label: 'status.ready', severity: 'success', icon: 'pi pi-check' },
    CUT: { label: 'status.cut', severity: 'success', icon: 'pi pi-scissors' },
    CLOSED: { label: 'status.closed', severity: 'secondary', icon: 'pi pi-lock' },
    ARCHIVED: { label: 'status.archived', severity: 'secondary', icon: 'pi pi-archive' },
    COMPLETE: { label: 'status.complete', severity: 'success', icon: 'pi pi-check-circle' },
    ERROR: { label: 'status.error', severity: 'danger', icon: 'pi pi-times-circle' },
    CHOSEN: { label: 'status.chosen', severity: 'success', icon: 'pi pi-star' },
    ACTIVE: { label: 'status.active', severity: 'success', icon: 'pi pi-check-circle' },
    AVAILABLE: { label: 'status.available', severity: 'success', icon: 'pi pi-box' },
    STOCKED: { label: 'status.stocked', severity: 'success', icon: 'pi pi-database' },
    DEPLETED: { label: 'status.depleted', severity: 'secondary', icon: 'pi pi-inbox' },
    USED: { label: 'status.used', severity: 'secondary', icon: 'pi pi-check-circle' },
    'IN-CUTTING': { label: 'status.inCutting', severity: 'warn', icon: 'pi pi-scissors' },
    MILLED: { label: 'status.milled', severity: 'success', icon: 'pi pi-check-square' },
    IN_STOCK: { label: 'status.inStock', severity: 'success', icon: 'pi pi-home' },
    SENT: { label: 'status.sent', severity: 'info', icon: 'pi pi-send' },
    SUBMITTED: { label: 'status.submitted', severity: 'info', icon: 'pi pi-send' },
    MANUFACTURED: { label: 'status.manufactured', severity: 'info', icon: 'pi pi-cog' },
    APPROVED: { label: 'status.approved', severity: 'success', icon: 'pi pi-check-circle' },
    FULFILLED: { label: 'status.fulfilled', severity: 'success', icon: 'pi pi-box' },
    REJECTED: { label: 'status.rejected', severity: 'danger', icon: 'pi pi-times-circle' },
    PRODUCED: { label: 'status.produced', severity: 'info', icon: 'pi pi-box' },
    INSTALLED: { label: 'status.installed', severity: 'success', icon: 'pi pi-check' },
    GENERATING: { label: 'status.generating', severity: 'warn', icon: 'pi pi-spin pi-cog' },
    PROCESSING: { label: 'status.processing', severity: 'warn', icon: 'pi pi-spin pi-cog' },
    FAILED: { label: 'status.error', severity: 'danger', icon: 'pi pi-times-circle' },
    SCRAP: { label: 'status.scrap', severity: 'danger', icon: 'pi pi-trash' },

    // Cassette Instance
    nested: { label: 'status.nested', severity: 'secondary', icon: 'pi pi-th-large' },
    manufactured: { label: 'status.manufactured', severity: 'info', icon: 'pi pi-cog' },
    'on-site': { label: 'status.onSite', severity: 'warn', icon: 'pi pi-map-marker' },
    installed: { label: 'status.installed', severity: 'success', icon: 'pi pi-check' },

    // Sheet
    'in cutting': { label: 'status.inCutting', severity: 'warn', icon: 'pi pi-scissors' },
    milled: { label: 'status.milled', severity: 'success', icon: 'pi pi-check-square' }
};
