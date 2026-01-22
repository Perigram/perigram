/**
 * Central registry for Entity-specific UI properties.
 * Maps entity types to their icons and routing patterns.
 */
export const ENTITY_UI = {
    project: { icon: 'pi pi-folder', route: (id) => `/project/${id}/queues` },
    queue: { icon: 'pi pi-list', route: (id, slug) => `/project/${slug}/queues` },
    sheetDesign: { icon: 'pi pi-map', route: (id) => `/design/sheet/${id}` },
    cassetteDesign: { icon: 'pi pi-pencil', route: (id) => `/design/cassette/${id}` },
    cassetteInstance: { icon: 'pi pi-box', route: (id) => `/production/instance/${id}` },
    warehouse: { icon: 'pi pi-building', route: (id) => `/warehouses` },
    catalog: { icon: 'pi pi-book', route: (id) => `/catalog` },
    requisition: { icon: 'pi pi-shopping-cart', route: (id) => `/requisitions` },
    batch: { icon: 'pi pi-truck', route: (id) => `/warehouses` },
    batchPile: { icon: 'pi pi-clone', route: (id) => `/warehouses` },
    sheet: { icon: 'pi pi-file', route: (id) => `/warehouses` },
    remnant: { icon: 'pi pi-undo', route: (id) => `/warehouses` },
    cassetteTemplate: { icon: 'pi pi-palette', route: (id) => `/assets/templates` }
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
    CUT: { label: 'status.cut', severity: 'success', icon: 'pi pi-scissors' },

    // Cassette Instance
    nested: { label: 'status.nested', severity: 'secondary', icon: 'pi pi-th-large' },
    manufactured: { label: 'status.manufactured', severity: 'info', icon: 'pi pi-cog' },
    'on-site': { label: 'status.onSite', severity: 'warn', icon: 'pi pi-map-marker' },
    installed: { label: 'status.installed', severity: 'success', icon: 'pi pi-check' },

    // Sheet
    'in cutting': { label: 'status.inCutting', severity: 'warn', icon: 'pi pi-scissors' },
    milled: { label: 'status.milled', severity: 'success', icon: 'pi pi-check-square' }
};
