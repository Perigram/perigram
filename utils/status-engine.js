import { cncStatusUi } from '@cutkit/domain-cnc';

/**
 * Central registry for Entity-specific UI properties.
 * Maps canonical snake_case entity types to their icons and routing patterns.
 * Camel-case surface names are normalized at lookup time; only canonical
 * snake_case keys are stored.
 *
 * `icon` is a CSS class string. CNC-domain entities use the custom
 * `ck-entity-icon-*` mask classes (assets/css/main.css) backed by the SVGs in
 * public/icons/data-model/cnc-domain; everything else uses PrimeIcons.
 */
export const ENTITY_UI = {
    project: { icon: 'pi pi-folder', route: (id) => `/project/${id}/queues` },
    queue: { icon: 'pi pi-list', route: (id, slug) => `/project/${slug}/queues` },
    nesting_run: { icon: 'pi pi-list-check', route: (id) => `/nesting-runs/${id}` },
    sheet_design: { icon: 'ck-entity-icon ck-entity-icon-sheet-design', route: (id) => `/design/sheet/${id}` },
    cassette_design: { icon: 'ck-entity-icon ck-entity-icon-cassette-design', route: () => `/assets/cassettes` },
    cassette_template: { icon: 'ck-entity-icon ck-entity-icon-cassette-template', route: (id) => `/assets/cassettes` },
    cassette_instance: { icon: 'ck-entity-icon ck-entity-icon-cassette-instance', route: (id) => `/production/instance/${id}` },
    warehouse: { icon: 'pi pi-building', route: (id) => `/warehouses` },
    library: { icon: 'pi pi-book', route: () => null },
    catalog: { icon: 'pi pi-book', route: (id) => `/catalog` },
    color: { icon: 'pi pi-palette', route: (id) => `/catalog` },
    requisition: { icon: 'pi pi-shopping-cart', route: (id) => `/requisitions` },
    batch: { icon: 'pi pi-truck', route: (id) => `/warehouses` },
    batch_pile: { icon: 'pi pi-clone', route: (id) => `/warehouses` },
    sheet: { icon: 'ck-entity-icon ck-entity-icon-sheet-instance', route: (id) => `/warehouses` },
    remnant: { icon: 'ck-entity-icon ck-entity-icon-remnant', route: (id) => `/warehouses` },
    material_pile: { icon: 'pi pi-database', route: (id) => `/warehouses` },
    tool_profile: { icon: 'pi pi-wrench', route: (id) => `/assets/tools` },
    pen_template: { icon: 'pi pi-palette', route: (id) => `/assets/pens` },
    layer_standard: { icon: 'pi pi-sitemap', route: (id) => `/assets/layer-standards` },
    entity_revision: { icon: 'pi pi-code-branch', route: (id) => `/admin/workbench` },
    geometry_capture: { icon: 'pi pi-camera', route: (id) => `/geometry-captures` },
    user: { icon: 'pi pi-user', route: (id) => `/admin/users` },
    organization: { icon: 'pi pi-building', route: (id) => `/organization/users` },
    artifact: { icon: 'pi pi-file', route: (id) => `/api/artifacts/${id}` }
};

function toSnakeCase(type = '') {
    return String(type || '').replace(/[A-Z]/g, character => `_${character.toLowerCase()}`).replace(/^_/, '');
}

export function entityUiFor(type = '') {
    return ENTITY_UI[type] || ENTITY_UI[toSnakeCase(type)] || { icon: 'pi pi-box', route: () => '#' };
}

/**
 * Status display mapping derived from the canonical domain `cncStatusUi`.
 * The domain owns status labels/severity/icon contracts; this is a projection,
 * not a second registry.
 */
export const STATUS_MAPPINGS = cncStatusUi;
