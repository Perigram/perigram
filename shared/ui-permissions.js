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
            view_own: true,
            view_all: false
        },
        warehouses: {
            create: true,
            view_own: true,
            view_contractors: true
        },
        requisitions: {
            create: false,
            approve: true,
            fulfill: true,
            view_incoming: true
        }
    },
    'ContractorAdmin': {
        catalogs: {
            create: false,
            edit: false,
            delete: false,
            view_all: true
        },
        warehouses: {
            create: true,
            view_own: true,
            view_others: false
        },
        requisitions: {
            create: true,
            view_own: true,
            approve: false
        }
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

    const featurePerms = rolePerms[feature];
    if (!featurePerms) return false;

    return featurePerms[action] === true;
}
