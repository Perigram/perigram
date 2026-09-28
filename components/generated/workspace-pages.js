import ChatSupport from '~/components/ChatSupport.vue';
import CallWorkspacePage from '~/components/calls/CallWorkspacePage.vue';
import DirectoryDetailSurface from '~/components/directory/DirectoryDetailSurface.vue';
import OrganizationTeamPage from '~/pages/organization/users.vue';
import OrganizationPartnersPage from '~/pages/organization/partners.vue';
import OrganizationBillingPage from '~/pages/organization/billing.vue';
import OrganizationProcessPage from '~/pages/organization/process.vue';
import { fileWorkspacePages } from '~/components/generated/file-surfaces.js';

// Entity-bound editor pages (for example the cassette designer) derive
// from the pack editor bindings through the file-surface registry; their
// page ids are the surface ids, so persisted pane state stays stable.
// Entity-less pages are always openable tabs. `ephemeral: true` marks
// runtime-parameterized pages that only open programmatically with per-call
// props (a live call room) and never appear in add-tab lists.
// The organization management pages (including the process designer)
// register with their `route` so chrome (the generated overview's
// system-screen buttons) can open them as pane tabs through the workspace
// page-open seam instead of routing away from home.
export const generatedWorkspacePages = [
  ...fileWorkspacePages(),
  // Directory pages are the workspace home of user/organization detail:
  // types with no compiled detail screen and no editor still open as pane
  // tabs, never as standalone routes.
  {
    id: 'directoryUser',
    typeId: 'user',
    labelKey: 'entities.user',
    icon: 'pi pi-user',
    component: DirectoryDetailSurface,
    props: page => ({ typeId: 'user', instanceId: page.entity?._id || page.instanceId || '' })
  },
  {
    id: 'directoryOrganization',
    typeId: 'organization',
    labelKey: 'entities.organization',
    icon: 'pi pi-building',
    component: DirectoryDetailSurface,
    props: page => ({ typeId: 'organization', instanceId: page.entity?._id || page.instanceId || '' })
  },
  {
    id: 'organizationTeam',
    labelKey: 'organization.teamManagement',
    icon: 'pi pi-users',
    component: OrganizationTeamPage,
    route: '/organization/users'
  },
  {
    id: 'organizationPartners',
    labelKey: 'partnerships.title',
    icon: 'pi pi-handshake',
    component: OrganizationPartnersPage,
    route: '/organization/partners'
  },
  {
    id: 'organizationBilling',
    labelKey: 'billing.title',
    icon: 'pi pi-credit-card',
    component: OrganizationBillingPage,
    route: '/organization/billing'
  },
  {
    id: 'organizationProcess',
    labelKey: 'processDesigner.title',
    icon: 'pi pi-sitemap',
    component: OrganizationProcessPage,
    route: '/organization/process'
  },
  {
    id: 'chats',
    labelKey: 'support.chatTitle',
    icon: 'pi pi-comments',
    component: ChatSupport,
    // A conversationKey pins the tab to one thread (the bottom-right
    // popup's expand action); without it the tab opens the general inbox.
    props: page => ({
      embedded: true,
      fullPage: true,
      openCallInPane: true,
      conversationKey: page.conversationKey || ''
    })
  },
  {
    id: 'call',
    labelKey: 'call.title',
    icon: 'pi pi-phone',
    component: CallWorkspacePage,
    ephemeral: true,
    props: page => ({
      room: page.room,
      conversationKey: page.conversationKey || ''
    })
  }
];

export function resolveGeneratedWorkspacePage(pageId = '') {
  return generatedWorkspacePages.find(page => page.id === pageId) || null;
}

// The workspace page registered for a system route, if any: chrome
// opening that route as a pane resolves through this map.
export function workspacePageIdForRoute(route = '') {
  return generatedWorkspacePages.find(page => page.route === route)?.id || null;
}

// The entity-bound fallback for types with no compiled detail screen: the
// first registered workspace page bound to the type (editor pages via the
// file-surface registry, directory pages for user/organization). Panes,
// never standalone routes.
export function entityWorkspacePageIdFor(typeId = '') {
  return generatedWorkspacePages.find(page => page.typeId === typeId && !page.ephemeral)?.id || null;
}
