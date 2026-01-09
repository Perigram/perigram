import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { API_ROUTES } from '~/composables/apiRoutes';

export const useAuthStore = defineStore('auth', () => {
    const user = ref({});
    const isUserSet = ref(false);

    const userIsSet = computed(() => isUserSet.value);
    const userData = computed(() => user.value);

    async function setUser() {
        try {
            const data = await $fetch(API_ROUTES.USER);
            if (data && Boolean(data.id)) {
                user.value = data;
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

    async function logout() {
        try {
            await $fetch(API_ROUTES.LOGOUT, {
                method: 'POST',
                credentials: 'include'
            });
            user.value = {};
            isUserSet.value = false;
        } catch (err) {
            console.error('Logout failed:', err);
        }
    }

    return {
        user,
        isUserSet,
        userIsSet,
        userData,
        setUser,
        logout
    };
});
