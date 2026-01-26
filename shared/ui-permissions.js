/**
 * UI Permission Matrix
 * Defines visibility rules for UI elements based on User Roles.
 * This separates the "Policy" (Who sees what) from the "Component" (The v-if check).
 * 
 * Structure:
 * Role -> Feature -> Action -> Boolean
 */

export const UI_PERMISSIONS = {
    'ManufacturerAdmin': {
        catalogs: {
            create: true,
            edit: true,
            delete: true,
            view: true
        },
        warehouses: {
            create: true,
            edit: true,
            delete: true,
            view: true
        },
        requisitions: {
            create: false,
            edit: false,
            delete: false,
            view: true,
            approve: true,
            reject: true,
            fulfill: true
        },
        projects: {
            create: false,
            edit: false,
            delete: false,
            view: true
        },
        queues: {
            view: true,
            edit: false
        }
    },
    'ContractorAdmin': {
        catalogs: {
            create: false,
            edit: false,
            delete: false,
            view: true
        },
        warehouses: {
            create: true,
            edit: true,
            delete: true,
            view: true
        },
        requisitions: {
            create: true,
            edit: true,
            delete: true,
            view: true,
            send: true
        },
        projects: {
            create: true,
            edit: true,
            delete: true,
            view: true
        },
        queues: {
            create: true,
            edit: true,
            delete: true,
            view: true
        }
    },
    'IndividualUser': {
        catalogs: { view: true },
        requisitions: { create: true, edit: true, delete: true, view: true, send: true },
        projects: { create: true, edit: true, delete: true, view: true },
        queues: { create: true, edit: true, delete: true, view: true }
    },
    'SuperAdmin': {
        '*': true
    }
};

/**
 * Resolves if a specific role can perform a UI action.
 * @param {string} role - The user's role (e.g. 'ManufacturerAdmin')
 * @param {string} feature - Feature name (e.g. 'catalogs')
 * @param {string} action - Action name (e.g. 'create')
 * @returns {boolean}
 */
export function resolveUiPermission(role, feature, action) {
    if (!role) return false;
    if (role === 'SuperAdmin') return true;

    const rolePerms = UI_PERMISSIONS[role];
    if (!rolePerms) return false;

    // Support wildcard for SuperAdmin or future broad roles
    if (rolePerms['*']) return true;

    const featurePerms = rolePerms[feature];
    if (!featurePerms) return false;

    return featurePerms[action] === true;
}