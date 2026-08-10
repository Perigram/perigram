import { cncStatusUi } from '@cutkit/domain-cnc';

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
    cassetteTemplate: { icon: 'pi pi-palette', route: (id) => `/assets/cassettes` },
    cassette_template: { icon: 'pi pi-palette', route: (id) => `/assets/cassettes` },
    cassetteInstance: { icon: 'pi pi-box', route: (id) => `/production/instance/${id}` },
    cassette_instance: { icon: 'pi pi-box', route: (id) => `/production/instance/${id}` },
    warehouse: { icon: 'pi pi-building', route: (id) => `/warehouses` },
    library: { icon: 'pi pi-book', route: () => null },
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
    organization: { icon: 'pi pi-building', route: (id) => `/organization/users` },
    artifact: { icon: 'pi pi-file', route: (id) => `/api/artifacts/${id}` }
};

/**
 * Status display mapping derived from the canonical domain `cncStatusUi`.
 * The domain owns status labels/severity/icon contracts; this is a projection,
 * not a second registry.
 */
export const STATUS_MAPPINGS = cncStatusUi;
