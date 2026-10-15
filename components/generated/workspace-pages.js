import { defineAsyncComponent } from 'vue';
import { fileWorkspacePages } from '~/components/generated/file-surfaces.js';

// Page components resolve lazily: the registry is imported from the app
// shell's chat/entity-popup chain, and eagerly importing pages here put
// every workspace page (the process designer included) into the shell's
// module graph — and a workspace-pages → DirectoryDetailSurface →
// GeneratedOrganizationOverview → workspace-pages import cycle 500'd the
// route whose graph entered DirectoryDetailSurface first
// ("Cannot access 'DirectoryDetailSurface' before initialization").
// Registry rows (ids, labels, icons, route maps) stay synchronous.
const ChatSupport = defineAsyncComponent(() => import('~/components/ChatSupport.vue'));
const CallWorkspacePage = defineAsyncComponent(() => import('~/components/calls/CallWorkspacePage.vue'));
const DirectoryDetailSurface = defineAsyncComponent(() => import('~/components/directory/DirectoryDetailSurface.vue'));
const OrganizationTeamPage = defineAsyncComponent(() => import('~/pages/organization/users.vue'));
const OrganizationBotsPage = defineAsyncComponent(() => import('~/pages/organization/bots.vue'));
const OrganizationModelsPage = defineAsyncComponent(() => import('~/pages/organization/models.vue'));
const OrganizationPartnersPage = defineAsyncComponent(() => import('~/pages/organization/partners.vue'));
const OrganizationBillingPage = defineAsyncComponent(() => import('~/pages/organization/billing.vue'));
const OrganizationProcessPage = defineAsyncComponent(() => import('~/pages/organization/process.vue'));
const OrganizationPluginsPage = defineAsyncComponent(() => import('~/pages/organization/plugins.vue'));

// Entity-bound editor pages (for example the cassette designer) derive
// from the editor bindings through the file-surface registry (see
// `generatedWorkspacePages` below for the per-call rule); their
// page ids are the surface ids, so persisted pane state stays stable.
// Entity-less pages are always openable tabs. `ephemeral: true` marks
// runtime-parameterized pages that only open programmatically with per-call
// props (a live call room) and never appear in add-tab lists. `flush: true`
// marks pages that own their own full-bleed shell (canvas, call stage,
// self-padding scroll surfaces); every other page is hosted inside the
// padded scroll area the workspace page host provides.
// The organization management pages (including the process designer and
// the plugin marketplace) register with their `route` so chrome (the
// generated overview's system-screen buttons) can open them as pane tabs
// through the workspace page-open seam instead of routing away from home.
export const fixedWorkspacePages = [
  // Directory pages are the workspace home of user/organization detail:
  // types with no compiled detail screen and no editor still open as pane
  // tabs, never as standalone routes. Their surface owns its padding and
  // scrolling, so the host stays flush.
  {
    id: 'directoryUser',
    typeId: 'user',
    labelKey: 'entities.user',
    icon: 'pi pi-user',
    component: DirectoryDetailSurface,
    flush: true,
    props: page => ({ typeId: 'user', instanceId: page.entity?._id || page.instanceId || '' })
  },
  {
    id: 'directoryOrganization',
    typeId: 'organization',
    labelKey: 'entities.organization',
    icon: 'pi pi-building',
    component: DirectoryDetailSurface,
    flush: true,
    props: page => ({ typeId: 'organization', instanceId: page.entity?._id || page.instanceId || '' })
  },
  {
    id: 'organizationTeam',
    labelKey: 'organization.teamManagement',
    icon: 'pi pi-users',
    component: OrganizationTeamPage,
    route: '/organization/users',
    // The directory's invite action lands here with its target: the
    // one-shot param flows through the page-open seam's params channel.
    props: page => ({ inviteUserId: page.params?.invite || '' })
  },
  {
    id: 'organizationModels',
    labelKey: 'organization.modelsManagement',
    icon: 'pi pi-sparkles',
    component: OrganizationModelsPage,
    route: '/organization/models'
  },
  {
    id: 'organizationBots',
    labelKey: 'organization.botsManagement',
    icon: 'pi pi-comment',
    component: OrganizationBotsPage,
    route: '/organization/bots'
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
    route: '/organization/process',
    flush: true
  },
  {
    id: 'organizationPlugins',
    labelKey: 'plugins.title',
    icon: 'pi pi-puzzle',
    component: OrganizationPluginsPage,
    route: '/organization/plugins'
  },
  {
    id: 'chats',
    labelKey: 'support.chatTitle',
    icon: 'pi pi-comments',
    component: ChatSupport,
    flush: true,
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
    flush: true,
    props: page => ({
      room: page.room,
      conversationKey: page.conversationKey || ''
    })
  }
];

// The full page list, derived per call: the file-type half reads the
// editor bindings through `activeEditorBindings()` (served plugin
// bindings once the organization type view loads, pack fallback before),
// so consumer computeds that call this track the view and event-handler
// calls resolve whatever is served at that moment — a module-scope
// array would freeze the pre-auth fallback and drop plugin editor pages
// (the cassette designer) exactly like the editor-action snapshot did.
export function generatedWorkspacePages() {
  return [...fileWorkspacePages(), ...fixedWorkspacePages];
}

export function resolveGeneratedWorkspacePage(pageId = '') {
  return generatedWorkspacePages().find(page => page.id === pageId) || null;
}

// The workspace page registered for a system route, if any: chrome
// opening that route as a pane resolves through this map.
export function workspacePageIdForRoute(route = '') {
  return generatedWorkspacePages().find(page => page.route === route)?.id || null;
}

// The entity-bound fallback for types with no compiled detail screen: the
// first registered workspace page bound to the type (editor pages via the
// file-surface registry, directory pages for user/organization). Panes,
// never standalone routes.
export function entityWorkspacePageIdFor(typeId = '') {
  return generatedWorkspacePages().find(page => page.typeId === typeId && !page.ephemeral)?.id || null;
}
