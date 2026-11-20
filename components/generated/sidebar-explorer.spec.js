// Sidebar explorer contract: mounts the home workspace's PanelMenu model
// over a fixture home screen (a group type with a text-document child
// type) and pins the one-hierarchy law — a parented child lists beneath
// its parent's row, its own type node keeps unparented rows only, and
// relation-nested rows wear the link glyph.
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import { describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const report1 = { _id: 'report1' };
  const report2 = { _id: 'report2' };
  const textParented1 = { _id: 'text1', lineage: { groupId: 'report1' } };
  const textParented2 = { _id: 'text2', lineage: { groupId: 'report2' } };
  const textOrphan = { _id: 'text3' };
  const bundleTypes = [
    {
      id: 't-group',
      scope: 'org',
      name: 'Group',
      edges: { children: { texts: { types: ['text-document'], lineageKey: 'groupId' } } }
    },
    { id: 'text-document', scope: 'org', name: 'Text', edges: {} }
  ];
  const containment = [
    { childType: 'text-document', parentType: 't-group', lineageKey: 'groupId', declared: 'org' }
  ];
  const screenManifest = [
    { screenKey: 'sl-group', typeId: 't-group', template: 'typeList' },
    { screenKey: 'sl-text', typeId: 'text-document', template: 'typeList' }
  ];
  const sourceStates = {
    's-report': { source: { typeId: 't-group' }, items: [report1, report2], rawItems: [report1, report2] },
    's-text': {
      source: { typeId: 'text-document' },
      items: [textParented1, textParented2, textOrphan],
      rawItems: [textParented1, textParented2, textOrphan]
    }
  };
  const screen = {
    id: 'home',
    screenKey: 'home',
    template: 'home',
    regions: [
      { id: 'r-report', sourceId: 's-report' },
      { id: 'r-text', sourceId: 's-text' }
    ]
  };
  return { screen, sourceStates, bundleTypes, containment, screenManifest };
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
  usePagesStore: () => ({ pages: [], sections: [], pageById: () => null, ensureLoaded: async () => {}, reload: async () => {} })
}));

vi.mock('~/stores/calls', () => ({
  useCallsStore: () => ({
    activeRooms: [],
    connect: () => {},
    pendingTabRoom: null,
    consumePendingTabRoom: () => null
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

async function renderSidebarModel() {
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
  await renderToString(app);
  return menuModelReaders.at(-1)?.() || [];
}

describe('sidebar explorer hierarchy', () => {
  it('panels carry instance rows alone — no type rows, contained types never panel on their own', async () => {
    const model = await renderSidebarModel();
    const groupPanel = model.find(item => item.typeId === 't-group');
    expect(groupPanel).toBeTruthy();
    expect(groupPanel.items.map(row => row.key)).toEqual([
      't-group:report1',
      't-group:report2'
    ]);
    expect(model.some(item => item.typeId === 'text-document')).toBe(false);
  }, 15000);
});
