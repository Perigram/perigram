import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { API_ROUTES } from '~/composables/apiRoutes';
import { resolveUiPermission } from '~/shared/ui-permissions';

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

    // Roles
    const isSuperAdmin = computed(() => user.value?.role === 'SuperAdmin');
    const isOrgAdmin = computed(() => ['ManufacturerAdmin', 'ContractorAdmin', 'CustomerAdmin'].includes(user.value?.role));
    
    // Org Types
    const isManufacturer = computed(() => organization.value?.data?.type === 'Manufacturer' || user.value?.role?.includes('Manufacturer'));
    const isContractor = computed(() => organization.value?.data?.type === 'Contractor' || user.value?.role?.includes('Contractor'));
    const isCustomer = computed(() => organization.value?.data?.type === 'Customer' || user.value?.role?.includes('Customer'));

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
        try {
            userOrgs.value = await $fetch('/api/auth/organizations', fetchOptions);
        } catch (err) {
            if (err.status === 401) {
                userOrgs.value = [];
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
        if (!user.value?.permissions) return false;
        const userLevel = user.value.permissions[entity] || 'none';
        const levels = ['none', 'read', 'write', 'admin'];
        return levels.indexOf(userLevel) >= levels.indexOf(level);
    }

    /**
     * Checks if the current user has permission for a specific UI action.
     * Uses the centralized UI Permission Matrix.
     */
    function can(feature, action) {
        // Fallback to role from user object if organization not fully loaded
        const role = user.value?.role || 'IndividualUser';
        return resolveUiPermission(role, feature, action);
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
        isSuperAdmin,
        isOrgAdmin,
        isManufacturer,
        isContractor,
        isCustomer,
        setUser,
        fetchUserOrgs,
        login,
        register,
        logout,
        hasPermission,
        can,
        switchOrganization
    };
});
