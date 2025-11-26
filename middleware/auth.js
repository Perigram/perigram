import { authStore } from '~/composables/auth';
import { toRefs, unref } from 'vue';

const { getters, actions } = authStore;
const { setUser } = actions;
const { userIsSet } = toRefs(getters);

export default defineNuxtRouteMiddleware(async (to) => {
    // The index page has its own auth logic to handle redirection.
    if (to.name === 'index') {
        return;
    }

    // On the server, always try to set the user.
    // On the client, only set the user if they are not already set.
    if (process.server || !unref(userIsSet)) {
        await setUser();
    }

    const isLoggedIn = unref(userIsSet);

    // If the user is NOT logged in...
    if (!isLoggedIn) {
        // We need to allow access to auth-related pages.
        if (to.path.startsWith('/auth/')) {
            return;
        }
        // For any other page, redirect to the index page which is the login page.
        return navigateTo('/');
    }
});

