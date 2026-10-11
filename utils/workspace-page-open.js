const WORKSPACE_PAGE_OPEN_EVENT = 'perigram:open-workspace-page';

const usePendingWorkspacePage = () => useState('pendingWorkspacePage', () => null);

export const workspacePageOpenEvent = WORKSPACE_PAGE_OPEN_EVENT;

/**
 * Opens a registered workspace page as a tab of the home workspace — the
 * page-open twin of `instance-workspace-open`. Entity-bound pages carry
 * their `entity`/`typeId` through the event and the pending state, so the
 * workspace can bind the tab to the instance. `params` carries one-shot
 * page intent (for example a preselected invite target) that the opened
 * page consumes through its registry props adapter. Fast path: a mounted
 * home workspace consumes the event and opens the pane tab immediately.
 * Otherwise the request is stashed as pending state and the app navigates
 * home; the workspace consumes it on mount. Mobile viewports have no
 * panes: the provided route is navigated directly, with the params as
 * its query.
 */
export function openWorkspacePageFromChrome({ pageId = '', route = '', entity = null, typeId = '', params = null } = {}) {
    if (!pageId || typeof window === 'undefined') return false;
    if (window.matchMedia?.('(max-width: 767px)')?.matches) {
        if (route) navigateTo({ path: route, query: params || undefined });
        return true;
    }
    const handled = !window.dispatchEvent(new CustomEvent(WORKSPACE_PAGE_OPEN_EVENT, {
        detail: { pageId, entity, typeId, params },
        cancelable: true
    }));
    if (handled) return true;
    const pending = usePendingWorkspacePage();
    pending.value = { pageId, entity, typeId, params };
    navigateTo('/');
    return true;
}

export function consumePendingWorkspacePage() {
    const pending = usePendingWorkspacePage();
    const request = pending.value;
    pending.value = null;
    return request;
}
