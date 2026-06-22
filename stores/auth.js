import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { API_ROUTES } from '~/composables/apiRoutes';
import { resolveUiPermission } from '~/shared/ui-permissions';
import { hasPermissionGrant } from '~/shared/access-control';

export const useAuthStore = defineStore('auth', () => {
    const user = ref({});
    const organization = ref(null);
    const userOrgs = ref([]);
    const isUserSet = ref(false);

    const userIsSet = computed(() => isUserSet.value);
    const userData = computed(() => user.value);
    const organizationData = computed(() => organization.value);
    const userOrganizations = computed(() => userOrgs.value);
    const memberships = computed(() => user.value?.memberships || user.value?.data?.memberships || []);
    const activeMembership = computed(() => {
        const activeOrgId = user.value?.organizationId || organization.value?._id;
        return activeOrgId
            ? memberships.value.find(membership => membership.organizationId?.toString() === activeOrgId.toString())
            : memberships.value[0];
    });
    const activePermissions = computed(() => {
        return user.value?.effectivePermissions || activeMembership.value?.permissions || user.value?.permissions || user.value?.data?.permissions || {};
    });
    const tenantPermissions = computed(() => activeMembership.value?.permissions || {});
    const navigationManifest = computed(() => user.value?.navigation || []);
    const screenManifest = computed(() => user.value?.screens || []);
    const actionManifest = computed(() => user.value?.roleAssignments?.actions || []);
    const fieldPolicies = computed(() => user.value?.fieldPolicies || {});
    const processActive = computed(() => user.value?.process?.active === true);

    const canManagePlatform = computed(() => hasTenantPermission('organizations', 'admin') || hasTenantPermission('users', 'admin') || hasPermission('workbench', 'admin') || hasPermission('domain_builder', 'admin') || hasPermission('config_bot', 'admin'));

    async function setUser(fetchOptions = {}) {
        try {
            const data = await $fetch('/api/auth/me', fetchOptions);
            if (data && (Boolean(data.userId) || Boolean(data.id))) {
                user.value = { ...data, id: data.userId || data.id }; // Normalize ID
                isUserSet.value = true;

                // Fetch organization if linked
                if (user.value.organizationId) {
                    try {
                        organization.value = await $fetch(`/api/organizations/${user.value.organizationId}`, fetchOptions);
                    } catch (err) {
                        console.error('Failed to fetch organization:', err);
                    }
                } else {
                    organization.value = null;
                }

                await fetchUserOrgs(fetchOptions);
            } else {
                user.value = {};
                organization.value = null;
                isUserSet.value = false;
            }
        } catch (error) {
            if (error.status !== 401) {
                console.error('Failed to set user:', error);
            }
            user.value = {};
            organization.value = null;
            isUserSet.value = false;
        }
    }

    async function login(email, password) {
        try {
            const response = await $fetch('/api/auth/login', {
                method: 'POST',
                body: { email, password }
            });
            
            user.value = { ...response.user, id: response.user.id || response.user._id };
            isUserSet.value = true;
            
            // Re-run setUser to get organization and permissions fresh
            await setUser();
            
            return response;
        } catch (err) {
            console.error('Login failed:', err);
            throw err;
        }
    }

    async function register(data) {
        try {
            const response = await $fetch('/api/auth/register', {
                method: 'POST',
                body: data
            });
            return response;
        } catch (err) {
            console.error('Registration failed:', err);
            throw err;
        }
    }

    async function logout() {
        try {
            await $fetch('/api/auth/logout', {
                method: 'POST'
            });
            user.value = {};
            organization.value = null;
            userOrgs.value = [];
            isUserSet.value = false;
        } catch (err) {
            console.error('Logout failed:', err);
        }
    }

    async function fetchUserOrgs(fetchOptions = {}) {
        if (!isUserSet.value) {
            userOrgs.value = [];
            return [];
        }

        try {
            userOrgs.value = await $fetch('/api/auth/organizations', fetchOptions);
            return userOrgs.value;
        } catch (err) {
            if (err.status === 401) {
                user.value = {};
                organization.value = null;
                userOrgs.value = [];
                isUserSet.value = false;
                return [];
            }
            console.error('Failed to fetch user organizations:', err);
            return [];
        }
    }

    async function switchOrganization(organizationId) {
        try {
            await $fetch('/api/auth/switch-org', {
                method: 'POST',
                body: { organizationId }
            });
            await setUser();
        } catch (err) {
            console.error('Failed to switch organization:', err);
            throw err;
        }
    }

    function hasPermission(entity, level) {
        return hasPermissionGrant({ permissions: activePermissions.value, feature: entity, level });
    }

    function hasTenantPermission(entity, level) {
        return hasPermission(entity, level)
            || hasPermissionGrant({ permissions: tenantPermissions.value, feature: entity, level });
    }

    /**
     * Checks if the current user has permission for a specific UI action.
     * Uses the centralized UI Permission Matrix.
     */
    function can(feature, action, context = {}) {
        if (processActive.value && context.actionId) {
            return actionManifest.value.some(item => item.actionId === context.actionId);
        }
        return resolveUiPermission(null, feature, action, {
            ...context,
            permissions: context.permissions || activePermissions.value
        });
    }

    return {
        user,
        organization,
        userOrgs,
        isUserSet,
        userIsSet,
        userData,
        organizationData,
        userOrganizations,
        memberships,
        activePermissions,
        tenantPermissions,
        navigationManifest,
        screenManifest,
        actionManifest,
        fieldPolicies,
        processActive,
        canManagePlatform,
        setUser,
        fetchUserOrgs,
        login,
        register,
        logout,
        hasPermission,
        hasTenantPermission,
        can,
        switchOrganization
    };
});
