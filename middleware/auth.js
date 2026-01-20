import { useAuthStore } from '~/stores/auth';
import { storeToRefs } from 'pinia';

export default defineNuxtRouteMiddleware(async (to) => {
    const authStore = useAuthStore();
    const { userIsSet } = storeToRefs(authStore);

    // The index page has its own auth logic to handle redirection.
    if (to.name === 'index') {
        return;
    }

    // On the server, always try to set the user.
    // On the client, only set the user if they are not already set.
    if (process.server || !userIsSet.value) {
        await authStore.setUser();
    }

    const isLoggedIn = userIsSet.value;

    // If the user is NOT logged in...
    if (!isLoggedIn) {
        // We need to allow access to auth-related pages.
        if (to.path.startsWith('/auth/') || to.path.startsWith('/invitation/')) {
            return;
        }
        // For any other page, redirect to the index page which is the login page.
        return navigateTo('/');
    }
});

