import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { API_ROUTES } from '~/composables/apiRoutes';

export const useAuthStore = defineStore('auth', () => {
    const user = ref({});
    const isUserSet = ref(false);

    const userIsSet = computed(() => isUserSet.value);
    const userData = computed(() => user.value);
    const isAdmin = computed(() => user.value?.role === 'SuperAdmin');
    const isOrgAdmin = computed(() => ['ManufacturerAdmin', 'ContractorAdmin', 'CustomerAdmin'].includes(user.value?.role));

    async function setUser() {
        try {
            const data = await $fetch('/api/auth/me');
            if (data && (Boolean(data.userId) || Boolean(data.id))) {
                user.value = { ...data, id: data.userId || data.id }; // Normalize ID
                isUserSet.value = true;
            } else {
                user.value = {};
                isUserSet.value = false;
            }
        } catch (error) {
            console.error('Failed to set user:', error);
            user.value = {};
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
            isUserSet.value = false;
        } catch (err) {
            console.error('Logout failed:', err);
        }
    }

    function hasPermission(entity, level) {
        if (!user.value?.permissions) return false;
        const userLevel = user.value.permissions[entity] || 'none';
        const levels = ['none', 'read', 'write', 'admin'];
        return levels.indexOf(userLevel) >= levels.indexOf(level);
    }

    return {
        user,
        isUserSet,
        userIsSet,
        userData,
        isAdmin,
        isOrgAdmin,
        setUser,
        login,
        register,
        logout,
        hasPermission
    };
});
