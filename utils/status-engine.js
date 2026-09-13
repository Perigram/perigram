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
    project: { icon: 'pi pi-folder' },
    queue: { icon: 'pi pi-list' },
    nesting_run: { icon: 'pi pi-list-check' },
    sheet_design: { icon: 'ck-entity-icon ck-entity-icon-sheet-design' },
    cassette_design: { icon: 'ck-entity-icon ck-entity-icon-cassette-design' },
    cassette_template: { icon: 'ck-entity-icon ck-entity-icon-cassette-template' },
    cassette_instance: { icon: 'ck-entity-icon ck-entity-icon-cassette-instance' },
    warehouse: { icon: 'pi pi-building' },
    library: { icon: 'pi pi-book' },
    catalog: { icon: 'pi pi-book' },
    color: { icon: 'pi pi-palette' },
    requisition: { icon: 'pi pi-shopping-cart' },
    batch: { icon: 'pi pi-truck' },
    batch_pile: { icon: 'pi pi-clone' },
    sheet: { icon: 'ck-entity-icon ck-entity-icon-sheet-instance' },
    remnant: { icon: 'ck-entity-icon ck-entity-icon-remnant' },
    material_pile: { icon: 'pi pi-database' },
    tool_profile: { icon: 'pi pi-wrench' },
    pen_template: { icon: 'pi pi-palette' },
    layer_standard: { icon: 'pi pi-sitemap' },
    entity_revision: { icon: 'pi pi-code-branch' },
    geometry_capture: { icon: 'pi pi-camera' },
    user: { icon: 'pi pi-user' },
    organization: { icon: 'pi pi-building' },
    artifact: { icon: 'pi pi-file' }
};

function toSnakeCase(type = '') {
    return String(type || '').replace(/[A-Z]/g, character => `_${character.toLowerCase()}`).replace(/^_/, '');
}

export function entityUiFor(type = '') {
    return ENTITY_UI[type] || ENTITY_UI[toSnakeCase(type)] || { icon: 'pi pi-box' };
}

/**
 * Status display mapping derived from the canonical domain `cncStatusUi`.
 * The domain owns status labels/severity/icon contracts; this is a projection,
 * not a second registry.
 */
export const STATUS_MAPPINGS = cncStatusUi;
