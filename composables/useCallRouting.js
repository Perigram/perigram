import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '~/stores/auth';
import { useCallsStore } from '~/stores/calls';

/**
 * Shared call-surface routing. The default call surface is the home
 * workspace tab; when the organization has no generated home workspace, or
 * the caller asks for an independent surface, the call goes to the absolute
 * floating window owned by the app shell. Mobile keeps its full-screen
 * dialog (there are no workspace tabs on mobile).
 */
export function useCallRouting() {
    const router = useRouter();
    const authStore = useAuthStore();
    const callsStore = useCallsStore();

    const homeWorkspaceRoute = computed(() => {
        if (!authStore.processActive) return '';
        const screens = authStore.screenManifest.filter(screen => (
            screen.kind !== 'system'
            && typeof screen.route === 'string'
            && screen.route.startsWith('/screens/')
        ));
        return screens.find(screen => screen.template === 'home')?.route || '';
    });

    const isMobileViewport = () => process.client
        && window.matchMedia?.('(max-width: 767px)')?.matches;

    // Opens the room as a home workspace tab, navigating home first when the
    // caller lives on another route. Falls back to the floating window when
    // no home workspace exists.
    function openCallInWorkspaceTab(room = '') {
        if (!room) return;
        if (homeWorkspaceRoute.value) {
            callsStore.acceptInvite({ room });
            if (router.currentRoute.value.path !== homeWorkspaceRoute.value) {
                router.push(homeWorkspaceRoute.value);
            }
            return;
        }
        callsStore.setFloating(room);
    }

    return { homeWorkspaceRoute, isMobileViewport, openCallInWorkspaceTab };
}
