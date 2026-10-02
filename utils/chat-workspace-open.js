import { useAuthStore } from '~/stores/auth';
import { useSupportChatTarget } from '~/composables/useModalState';

const WORKSPACE_CHAT_OPEN_EVENT = 'perigram:open-workspace-chat';

const usePendingWorkspaceChat = () => useState('pendingWorkspaceChat', () => null);

function homeWorkspaceRoute() {
    const authStore = useAuthStore();
    // Same contract as the instance/call routing: whatever route the
    // manifest home screen carries (the stable '/home' or a compiled
    // route) hosts the home workspace; malformed manifests fall back to
    // the /chats route.
    const home = (authStore.screenManifest || []).find(screen => (
        screen.template === 'home'
        && typeof screen.route === 'string'
        && screen.route
    ));
    return home?.route || null;
}

/**
 * Opens a chat as a tab of the home workspace — the desktop "expand"
 * action. Fast path: a mounted home workspace (the chats drawer/popups
 * float above it) consumes the event and opens the pane tab immediately,
 * pinned to the given conversation. Otherwise the request is stashed as
 * pending state and the app navigates home; the workspace consumes it on
 * mount. An empty conversation key opens the general chats tab.
 */
export function openChatInWorkspaceTab({ conversationKey = '', label = '' } = {}) {
    if (typeof window === 'undefined') return false;
    // Mobile has no workspace tabs: the expand action opens the routed
    // chats surface with the thread preset through the shared chat
    // target (consumed on chat mount).
    if (window.matchMedia?.('(max-width: 767px)')?.matches) {
        const chatTarget = useSupportChatTarget();
        chatTarget.value = conversationKey
            ? { conversationKey, name: String(label || '') }
            : null;
        navigateTo('/chats');
        return true;
    }
    const handled = !window.dispatchEvent(new CustomEvent(WORKSPACE_CHAT_OPEN_EVENT, {
        detail: { conversationKey, label },
        cancelable: true
    }));
    if (handled) return true;
    const pending = usePendingWorkspaceChat();
    pending.value = { conversationKey, label };
    navigateTo(homeWorkspaceRoute() || '/');
    return true;
}

export function consumePendingWorkspaceChat() {
    const pending = usePendingWorkspaceChat();
    const request = pending.value;
    pending.value = null;
    return request;
}

export const workspaceChatOpenEvent = WORKSPACE_CHAT_OPEN_EVENT;
