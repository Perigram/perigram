// Sidebar user sections (SPEC §26): sections render as collapsible
// panels after the type panels with nested page trees; loose root pages
// render as root rows.
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import { describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const report1 = { _id: 'report1' };
  const bundleTypes = [
    { id: 't-group', scope: 'org', name: 'Group', edges: {} }
  ];
  const containment = [];
  const screenManifest = [
    { screenKey: 'sl-group', typeId: 't-group', template: 'typeList' }
  ];
  const sourceStates = {
    's-report': { source: { typeId: 't-group' }, items: [report1], rawItems: [report1] }
  };
  const screen = {
    id: 'home',
    screenKey: 'home',
    template: 'home',
    regions: [{ id: 'r-report', sourceId: 's-report' }]
  };
  const pages = [
    { _id: 'sec-notes', kind: 'section', name: 'Notes', parentId: null },
    { _id: 'pg-arch', kind: 'page', name: 'Architecture', parentId: 'sec-notes' },
    { _id: 'pg-arch-deep', kind: 'page', name: 'Walls', parentId: 'pg-arch' },
    { _id: 'pg-loose', kind: 'page', name: 'Loose', parentId: null }
  ];
  return { screen, sourceStates, bundleTypes, containment, screenManifest, pages };
});

const menuModelReaders = vi.hoisted(() => []);

vi.mock('primevue/panelmenu', async () => {
  const { h } = await import('vue');
  return {
    default: {
      name: 'PanelMenu',
      props: ['model', 'expandedKeys', 'multiple'],
      setup(props) {
        menuModelReaders.push(() => props.model);
        return () => h('nav', { 'data-panel-menu': '' });
      }
    }
  };
});

vi.mock('~/stores/auth', () => ({
  useAuthStore: () => ({
    processActive: true,
    lineageBindings: [],
    screenManifest: fixtures.screenManifest,
    organizationData: { _id: 'org-1' },
    userOrganizations: [],
    userData: { id: 'u1', organizationId: 'org-1' },
    userIsSet: true,
    hasPermission: () => false
  })
}));

vi.mock('~/stores/registry', () => ({
  useRegistryStore: () => ({
    containment: fixtures.containment,
    typeRecord: typeId => fixtures.bundleTypes.find(type => type.id === typeId) || null
  })
}));

vi.mock('~/stores/instances', () => ({
  useInstancesStore: () => ({
    records: {},
    recordFor: () => null,
    iconFor: () => 'pi pi-file',
    canonicalTypeKey: typeId => typeId,
    listInstances: async () => [],
    fetchInstance: async () => null,
    resolveReadableReference: async () => null
  })
}));

vi.mock('~/stores/supportChat', () => ({
  useSupportChatStore: () => ({})
}));

vi.mock('~/stores/pages', () => ({
  usePagesStore: () => ({
    pages: fixtures.pages,
    sections: fixtures.pages.filter(page => page.kind === 'section'),
    pageById: id => fixtures.pages.find(page => page._id === id) || null,
    ensureLoaded: async () => {},
    reload: async () => {}
  })
}));

vi.mock('~/stores/calls', () => ({
  useCallsStore: () => ({
    activeRooms: [],
    connect: () => {},
    pendingTabRoom: null
  })
}));

vi.mock('~/composables/useMobileHomeTabs.js', async () => {
  const { ref } = await import('vue');
  return { useMobileHomeTabs: () => ({ tabs: ref([]), activeKey: ref('') }) };
});

vi.mock('~/composables/useEntityPopup', () => ({
  useEntityPopup: () => ({ open: () => {} })
}));

vi.mock('~/composables/useCallRoomLabel.js', () => ({
  useCallRoomLabel: () => ({ label: () => '' })
}));

vi.mock('~/components/generated/workspace-pages.js', () => ({
  generatedWorkspacePages: () => [],
  resolveGeneratedWorkspacePage: () => null,
  entityWorkspacePageIdFor: () => null
}));

vi.mock('~/components/shared/UserAccountMenu.vue', () => ({ default: { name: 'StubbedUserAccountMenu', render: () => null } }));
vi.mock('~/components/shared/WorkspaceDock.vue', () => ({ default: { name: 'StubbedWorkspaceDock', render: () => null } }));
vi.mock('~/components/shared/CommunicationMenu.vue', () => ({ default: { name: 'StubbedCommunicationMenu', render: () => null } }));
vi.mock('~/components/generated/GeneratedScreenHost.vue', () => ({ default: { name: 'StubbedScreenHost', render: () => null } }));
vi.mock('~/components/generated/GeneratedWorkspacePane.vue', () => ({ default: { name: 'StubbedWorkspacePane', render: () => null } }));

async function renderSidebar() {
  menuModelReaders.length = 0;
  const HomeWorkspace = (await import('./GeneratedHomeWorkspace.vue')).default;
  const app = createSSRApp({
    render: () => h(HomeWorkspace, {
      screen: fixtures.screen,
      sourceState: sourceId => fixtures.sourceStates[sourceId] || { source: {}, items: [] }
    })
  });
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }));
  app.use(ConfirmationService);
  app.use(ToastService);
  return await renderToString(app);
}

async function sidebarModel() {
  await renderSidebar();
  return menuModelReaders.at(-1)?.() || [];
}

describe('sidebar user sections', () => {
  it('renders sections as panels after the type panels, pages nested by parentId', async () => {
    const model = await sidebarModel();
    const section = model.find(item => item.key === 'page-section:sec-notes');
    expect(section).toBeTruthy();
    expect(section.label).toBe('Notes');
    expect(section.icon).toBe('pi pi-folder-open');
    expect(section.items.map(row => row.key)).toEqual(['custom-page:pg-arch']);
    expect(section.items[0].items.map(row => row.key)).toEqual(['custom-page:pg-arch-deep']);
    expect(section.items[0].label).toBe('Architecture');
    expect(section.items[0].icon).toBe('pi pi-file');
  }, 15000);

  it('renders loose root pages as root rows beside the panels', async () => {
    const model = await sidebarModel();
    const loose = model.find(item => item.key === 'custom-page:pg-loose');
    expect(loose).toBeTruthy();
    expect(loose.label).toBe('Loose');
    expect(model.filter(item => item.key === 'page-section:sec-notes').length).toBe(1);
  }, 15000);

  it('drops the new-section affordance from the foot', async () => {
    const html = await renderSidebar();
    expect(html).not.toContain('pages.newSection');
  }, 15000);
});
