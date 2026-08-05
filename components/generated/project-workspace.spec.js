import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./GeneratedProjectWorkspace.vue', import.meta.url), 'utf8');
const entityPageSource = readFileSync(new URL('../shared/EntityPage.vue', import.meta.url), 'utf8');
const generatedScreenSource = readFileSync(new URL('./GeneratedScreen.vue', import.meta.url), 'utf8');
const standardPageSource = readFileSync(new URL('../shared/StandardPage.vue', import.meta.url), 'utf8');
const entityFileSource = readFileSync(new URL('./GeneratedEntityFile.vue', import.meta.url), 'utf8');
const workspacePaneSource = readFileSync(new URL('./GeneratedWorkspacePane.vue', import.meta.url), 'utf8');
const workspacePageSource = readFileSync(new URL('./GeneratedWorkspacePage.vue', import.meta.url), 'utf8');
const workspaceTabsSource = readFileSync(new URL('./GeneratedWorkspaceTabs.vue', import.meta.url), 'utf8');
const workspacePaneMenuSource = readFileSync(new URL('./GeneratedWorkspacePaneMenu.vue', import.meta.url), 'utf8');
const detailActionOwnershipSource = readFileSync(new URL('./detail-action-ownership.js', import.meta.url), 'utf8');
const statusBadgeSource = readFileSync(new URL('../shared/blocks/StatusBadge.vue', import.meta.url), 'utf8');
const workspacePagesSource = readFileSync(new URL('./workspace-pages.js', import.meta.url), 'utf8');
const projectContextActionsSource = readFileSync(new URL('./project-context-actions.js', import.meta.url), 'utf8');
const detailBodySource = readFileSync(new URL('./GeneratedEntityDetailBody.vue', import.meta.url), 'utf8');
const queueDetailSource = readFileSync(new URL('./GeneratedQueueDetail.vue', import.meta.url), 'utf8');
const entityCardSource = readFileSync(new URL('../shared/EntityCard.vue', import.meta.url), 'utf8');
const splitNodeSource = readFileSync(new URL('../shared/WorkspaceSplitNode.vue', import.meta.url), 'utf8');
const regionSource = readFileSync(new URL('./GeneratedRegion.vue', import.meta.url), 'utf8');
const collectionSource = readFileSync(new URL('./GeneratedEntityCollection.vue', import.meta.url), 'utf8');
const entityWorkspaceSource = readFileSync(new URL('../shared/EntityWorkspace.vue', import.meta.url), 'utf8');
const appLayoutSource = readFileSync(new URL('../../layouts/app.vue', import.meta.url), 'utf8');
const mainCssSource = readFileSync(new URL('../../assets/css/main.css', import.meta.url), 'utf8');

describe('generated project workspace architecture', () => {
  it('keeps the IDE-style tab strip scrollable without visible scrollbar chrome', () => {
    expect(workspaceTabsSource).toContain('workspace-tab-strip');
    expect(workspaceTabsSource).toContain('overflow-x-auto');
    expect(mainCssSource).toContain('.workspace-tab-strip');
    expect(mainCssSource).toContain('scrollbar-width: none');
    expect(mainCssSource).toContain('.workspace-tab-strip::-webkit-scrollbar');
  });

  it('suppresses the browser focus border for app-owned interactive states', () => {
    expect(mainCssSource).toContain(':where(button, a, input, textarea, select, [tabindex]):focus {');
    expect(mainCssSource).not.toContain(':focus:not(:focus-visible)');
  });

  it('renders pane-native entity files and registered pages in recursively splittable workspace panes', () => {
    expect(source).toContain('<GeneratedWorkspacePane');
    expect(source).toContain('<WorkspaceSplitNode');
    expect(source).toContain('<Splitter');
    expect(source).toContain('<Tree');
    expect(source).not.toContain('<GeneratedEntityDetail');
    expect(source).not.toContain('<ScrollablePanel');
    expect(source).not.toContain('project.lifecycle');
    expect(splitNodeSource).toContain(":layout=\"node.orientation\"");
    expect(workspacePaneSource).toContain('<GeneratedEntityFile');
    expect(workspacePaneSource).toContain('<GeneratedWorkspacePage');
    expect(workspacePageSource).toContain('resolveGeneratedWorkspacePage');
    expect(workspacePagesSource).not.toContain("id: 'project-actions'");
    expect(workspacePagesSource).toContain("id: 'cassette-designer'");
    expect(entityFileSource).toContain('<GeneratedEntityDetail');
    expect(entityFileSource).toContain('generatedDetailActionIds');
    expect(entityFileSource).not.toContain('<GeneratedEntityDetailBody');
    expect(entityFileSource).not.toContain('mode="file"');
    expect(entityFileSource).toContain('embedded');
    expect(entityFileSource).toContain('useGeneratedScreen(scopedDetailScreen)');
    expect(entityFileSource).toContain('detailChildRegions');
    expect(entityFileSource).toContain('<GeneratedRegion');
    expect(entityFileSource).toContain(':action-context="detailActionContext"');
    expect(entityFileSource).toContain(':body-actions="detailChildActionIds"');
    expect(entityFileSource).not.toContain('<EntitySurfaceContent');
    expect(detailBodySource).toContain('resolveGeneratedEntityDetailOverload');
    expect(detailBodySource).not.toContain('actionProducesEntityType');
    expect(detailBodySource).not.toContain('authStore.actionManifest.filter');
    expect(detailBodySource).toContain('uniqueActions(props.actions)');
    expect(regionSource).toContain(':body-actions="bodyActions"');
    expect(generatedScreenSource).toContain(':body-actions="detailChildActionIds"');
    expect(queueDetailSource).toContain('<QueueEditor');
    expect(queueDetailSource).toContain(':flush="flush"');
    expect(entityWorkspaceSource).toContain('container-type: inline-size');
    expect(entityWorkspaceSource).toContain('@container (min-width: 64rem)');
  });

  it('stays inside compiled screen sources and actions', () => {
    expect(source).toContain('sourceStateForRegion');
    expect(source).toContain('projectContextActionEntries');
    expect(source).toContain('props.screenActions');
    expect(projectContextActionsSource).toContain("parentEntityType(action) === 'project'");
    expect(projectContextActionsSource).toContain('actionAppliesToEntity(action, project, \'project\')');
    expect(source).not.toContain('cncRelations');
    expect(source).not.toContain('relationKeysForAction');
    expect(source).not.toContain('authStore.actionManifest.filter');
  });

  it('keeps entity pages canonical and exposes actions inside the active tab body', () => {
    expect(source).not.toContain('variant="workspace"');
    expect(entityPageSource).not.toContain("variant: { type: String");
    expect(entityPageSource).not.toContain("props.variant === 'workspace'");
    expect(entityPageSource).toContain('<EntityActionsPopover');
    expect(entityCardSource).toContain('<EntityActionsPopover');
    expect(entityFileSource).not.toContain('<EntityActionsPopover');
    expect(entityFileSource).toContain('<GeneratedActionButton');
    expect(entityFileSource).not.toContain('menu-item\n        @execute="executeAction"');
    expect(entityFileSource).toContain('data-tab-actions');
    expect(entityFileSource).toContain('generatedEntityDetailConsumesAction');
    expect(entityFileSource).toContain('v-for="actionId in tabActionIds"');
    expect(entityFileSource).not.toContain('<GeneratedCassetteDesignerAction');
    expect(detailActionOwnershipSource).toContain('detailActionSurfaceOwners');
    expect(entityFileSource).toContain('<GeneratedWorkspaceTabs');
    expect(entityFileSource).not.toContain('<EntityStatus');
    expect(workspaceTabsSource).toContain('<EntityStatus');
    expect(workspaceTabsSource).toContain('variant="icon"');
    expect(entityPageSource).toContain('<EntityActionsPopover');
  });

  it('keeps project actions and Explorer visibility in fixed workspace chrome', () => {
    expect(source).toContain("class=\"flex h-full min-h-0 flex-1 flex-col overflow-hidden\"");
    expect(source).toContain('data-project-actions-strip');
    expect(source).toContain('<GeneratedProjectActionPalette');
    expect(source).toContain('class="min-h-0 flex-1 overflow-hidden"');
    expect(source).toContain('!border-0 !p-0');
    expect(source).toContain("'!px-1 !py-0.5 !gap-1'");
    expect(source).toContain('explorerOpen');
    expect(source).toContain("project.collapseExplorer");
    expect(source).toContain("project.expandExplorer");
    expect(source.match(/\$t\('project\.explorer'\)/g)).toHaveLength(1);
    expect(source.match(/:node="paneTree"/g)).toHaveLength(1);
    expect(source).toContain('key="workspace-content"');
    expect(source).toContain(':size="explorerSize"');
    expect(source).toContain(':min-size="10"');
    expect(source).toContain(':size="100 - explorerSize"');
    expect(source).toContain(':pt="workspaceSplitterPt"');
    expect(source).toContain("{ '!hidden': !explorerOpen }");
    expect(source).toContain("gutter: { class: explorerOpen.value ? '' : '!hidden' }");
    expect(source).not.toContain('v-if="explorerOpen"');
    expect(source).not.toContain("pageId: 'project-actions'");
    expect(workspacePaneSource).not.toContain('showExplorerToggle');
    expect(entityFileSource).not.toContain('project.expandExplorer');
    expect(workspacePageSource).not.toContain('project.expandExplorer');
    expect(source).not.toContain('chrome-signal-rule');
    expect(entityFileSource).not.toContain('chrome-signal-rule');
    expect(workspacePageSource).not.toContain('chrome-signal-rule');
    expect(source).toContain('bg-chrome');
    expect(generatedScreenSource).toContain(':workspace="Boolean(screenOverload)"');
    expect(standardPageSource).toContain("'h-full min-h-0 max-w-none flex-1 gap-0 overflow-hidden'");
    expect(appLayoutSource).toContain('isGeneratedWorkspaceRoute');
    expect(appLayoutSource).toContain("'max-w-none overflow-hidden p-0");
  });

  it('opens pages for linked entities and restores versioned per-project pane state', () => {
    expect(source).toContain('const workspaceEntityItems = computed');
    expect(source).toContain('workspaceEntityItems.value.find');
    expect(source).toContain('loadProjectWorkspaceState(window.localStorage, key)');
    expect(source).toContain('saveProjectWorkspaceState(window.localStorage, key');
    expect(source).toContain('@resize="resizePaneSplit"');
    expect(splitNodeSource).toContain('@resizeend="$emit(\'resize\', node.id, $event.sizes)"');
  });

  it('owns IDE tabs and pane-local chrome outside the embedded entity body', () => {
    expect(source).toContain(':tabs="tabItemsForPane(pane)"');
    expect(source).toContain('@select-tab="key => selectPaneTab(pane.id, key)"');
    expect(source).toContain('@close-tab="key => closePaneTab(pane.id, key)"');
    expect(source).toContain('selectionKey: key, tabKeys');
    expect(entityFileSource).toContain('embedded');
    expect(entityPageSource).toContain('v-if="showHeader"');
    expect(splitNodeSource).toContain('workspace-pane-active');
    expect(splitNodeSource).toContain(':deep([data-pane-header])');
    expect(workspaceTabsSource).toContain('icon="pi pi-plus"');
    expect(workspaceTabsSource).toContain('availableTabs: { type: Array');
    expect(workspaceTabsSource).toContain('class="workspace-tab-strip flex min-w-0 items-stretch overflow-x-auto"');
    expect(statusBadgeSource).toContain('status-badge-glyph');
    expect(statusBadgeSource).toContain('h-1.5 w-1.5 rounded-full');
    expect(workspacePaneMenuSource).toContain('icon="pi pi-ellipsis-v"');
    expect(workspacePaneMenuSource).toContain("$emit('split', 'horizontal')");
    expect(workspacePaneMenuSource).toContain("$emit('close')");
    expect(entityFileSource).not.toContain('icon="pi pi-arrows-h"');
    expect(entityFileSource).not.toContain(':aria-label="$t(\'common.close\')"');
  });

  it('keeps nested detail-region entities and their actions inside the active project pane', () => {
    expect(entityFileSource).toContain('open-in-workspace');
    expect(entityFileSource).toContain('@open-entity');
    expect(regionSource).toContain(':open-in-workspace="openInWorkspace"');
    expect(regionSource).toContain('@open-page');
    expect(collectionSource).toContain("emit('open-entity', { entity, entityType: props.entityType })");
    expect(collectionSource).toContain(':open-in-workspace="openInWorkspace"');
    expect(source).toContain('@open-entity="openWorkspaceEntity"');
    expect(source).toContain('openedEntityRefs');
    expect(source).toContain('rememberWorkspaceEntity(request.entityType, request.entity)');
  });

  it('leaves initial and newly split panes empty until Explorer selection', () => {
    expect(source).toContain("const paneTree = ref(createWorkspaceLeaf('pane-1'));");
    expect(source).toContain('createWorkspaceLeaf(`pane-${++paneSequence.value}`)');
    expect(source).toContain("const key = activePane.value?.selectionKey || '';");
    expect(source).toContain('watch(workspaceItems, () =>');
    expect(source).not.toContain('visibleKeys.has(pane.selectionKey)');
    expect(source).not.toContain('defaultPaneKey');
    expect(source).not.toContain('|| projectItem.value');
    expect(workspacePaneSource).toContain('data-empty-workspace-pane');
    expect(workspacePaneSource).toContain('v-else');
    expect(workspacePaneSource).toContain("$t('project.openSomething')");
    expect(workspacePaneSource).toContain('<GeneratedWorkspacePaneMenu');
    expect(workspacePaneSource).toContain("$emit('close')");
  });

  it('shows breadcrumb menus for actual alternatives rather than sibling array length', () => {
    expect(appLayoutSource).toContain('breadcrumbAlternatives(crumb).length');
    expect(appLayoutSource).toContain('(sibling.id || sibling.to) !== crumb.to');
    expect(appLayoutSource).not.toContain('crumb.siblings.length > 1');
  });
});
