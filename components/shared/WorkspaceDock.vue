<template>
  <div v-if="mounted" class="h-full min-h-0 w-full">
    <DockviewVue
      ref="dock"
      class="perigram-dock h-full min-h-0 w-full"
      :theme="dockTheme"
      :disable-floating-groups="true"
      :default-renderer="'onlyWhenVisible'"
      @ready="onReady"
    >
      <template #panel-workspacePanel="{ api }">
        <div
          :ref="el => setContentElement(api.id, el)"
          class="h-full min-h-0 w-full min-w-0"
        >
          <slot
            name="content"
            :item="itemFor(api.id)"
            :panel="api"
          />
        </div>
      </template>

      <template #defaultTab="{ api }">
        <div class="flex h-full min-w-0 items-center gap-1.5 px-1">
          <i v-if="iconFor(api.id)" :class="iconFor(api.id)" class="shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ labelFor(api.id) }}</span>
          <button
            v-if="closeableFor(api.id)"
            type="button"
            class="ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-ui text-muted hover:bg-[var(--p-button-secondary-active-background)] hover:text-[var(--p-button-secondary-active-color)]"
            :aria-label="$t('common.close')"
            @pointerdown.stop
            @click.stop="$emit('close-tab', api.id)"
          >
            <i class="pi pi-times text-[0.7rem]" aria-hidden="true" />
          </button>
        </div>
      </template>

      <template v-if="hasBack" #leftHeaderActions="{ group }">
        <div class="flex h-full items-center pl-1">
          <Button
            icon="pi pi-arrow-left"
            text
            rounded
            size="small"
            severity="secondary"
            :disabled="!hasBack(group.id)"
            :aria-label="$t('common.back')"
            :title="$t('common.back')"
            data-testid="pane-back"
            @click="$emit('back', group.id)"
          />
        </div>
      </template>

      <template v-if="allowAdd || allowSplit || allowCloseGroup" #rightHeaderActions="{ group }">
        <div class="flex h-full items-stretch">
          <Button
            v-if="allowAdd"
            icon="pi pi-plus"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="$t('project.newTab')"
            @click="$emit('add-tab', group.id)"
          />
          <span v-if="allowSplit || (allowCloseGroup && groupCount > 1)" class="inline-flex shrink-0 items-stretch">
            <Button
              icon="pi pi-ellipsis-v"
              text
              size="small"
              severity="secondary"
              class="!h-full !w-10"
              :aria-label="$t('common.more')"
              @click.stop="togglePaneMenu"
            />
            <Popover ref="paneMenu">
              <div class="flex min-w-44 flex-col gap-1" @click="hidePaneMenu">
                <Button
                  v-if="allowSplit"
                  :label="$t('project.splitRight')"
                  icon="pi pi-arrows-h"
                  text
                  size="small"
                  class="w-full justify-start"
                  @click="$emit('split', group.id, 'horizontal')"
                />
                <Button
                  v-if="allowSplit"
                  :label="$t('project.splitDown')"
                  icon="pi pi-arrows-v"
                  text
                  size="small"
                  class="w-full justify-start"
                  @click="$emit('split', group.id, 'vertical')"
                />
                <Button
                  v-if="allowCloseGroup && groupCount > 1"
                  :label="$t('common.close')"
                  icon="pi pi-times"
                  text
                  size="small"
                  severity="danger"
                  class="w-full justify-start"
                  @click="$emit('close-group', group.id)"
                />
              </div>
            </Popover>
          </span>
        </div>
      </template>

      <template #watermark>
        <div class="flex h-full items-center justify-center text-muted">
          <i class="pi pi-folder-open" aria-hidden="true" />
        </div>
      </template>
    </DockviewVue>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { DockviewVue, themeDark, themeLight } from 'dockview-vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import { emptyTabKey, isEmptyTabKey } from '~/utils/workspace-empty-tabs.js';

const props = defineProps({
  // Every surface that can appear as a tab. Only panels present in the
  // dock layout render; the list supplies labels, icons, and close rules.
  items: { type: Array, default: () => [] },
  hasBack: { type: Function, default: null },
  allowAdd: { type: Boolean, default: false },
  allowSplit: { type: Boolean, default: false },
  allowCloseGroup: { type: Boolean, default: false },
  panelCloseable: { type: Function, default: null }
});

const emit = defineEmits([
  'ready',
  'active-change',
  'layout-change',
  'close-tab',
  'close-group',
  'add-tab',
  'split',
  'back'
]);

const { t } = useI18n();
const isDarkMode = ref(false);
const dockTheme = computed(() => (isDarkMode.value ? themeDark : themeLight));
const paneMenu = ref(null);
let themeObserver = null;

function togglePaneMenu(event) {
  paneMenu.value?.toggle(event);
}

function hidePaneMenu() {
  paneMenu.value?.hide();
}

function syncTheme() {
  isDarkMode.value = document.documentElement.classList.contains('dark-mode');
}
const dock = ref(null);
const api = shallowRef(null);
const mounted = ref(false);
const groupCount = ref(0);
const itemsByKey = computed(() => new Map(props.items.map(item => [item.key, item])));
const contentElements = new Map();
const subscriptions = [];

function itemFor(key) {
  return itemsByKey.value.get(key) || null;
}

function labelFor(key) {
  if (isEmptyTabKey(key)) return t('project.newTab');
  return itemFor(key)?.label || key;
}

function iconFor(key) {
  if (isEmptyTabKey(key)) return '';
  return itemFor(key)?.icon || '';
}

function closeableFor(key) {
  if (isEmptyTabKey(key)) return true;
  if (typeof props.panelCloseable === 'function') return Boolean(props.panelCloseable(key));
  return true;
}

function setContentElement(key, element) {
  if (element) contentElements.set(key, element);
  else contentElements.delete(key);
}

function onReady(event) {
  const live = event.api;
  api.value = live;
  syncGroups();
  subscriptions.push(
    live.onDidActiveGroupChange(() => syncActive()),
    live.onDidActivePanelChange(() => syncActive()),
    live.onDidLayoutChange(() => {
      syncGroups();
      emit('layout-change', live.toJSON());
    })
  );
  nextTick(syncActive);
  emit('ready', event);
}

watch(() => props.items, () => {
  for (const panel of api.value?.panels || []) {
    const title = labelFor(panel.id);
    if (title && panel.title !== title) panel.setTitle(title);
  }
}, { deep: true });

function syncGroups() {
  groupCount.value = api.value?.groups?.length || 0;
}

function syncActive() {
  const active = api.value?.activePanel;
  emit('active-change', {
    groupId: api.value?.activeGroup?.id || '',
    panelId: active?.id || ''
  });
}

function focusPanel(key) {
  const panel = api.value?.getPanel(key);
  if (!panel) return false;
  panel.api.setActive();
  return true;
}

function openPanel(key, { newTab = false } = {}) {
  const live = api.value;
  if (!live || !key) return null;
  const existing = live.getPanel(key);
  if (existing) {
    existing.api.setActive();
    return existing;
  }
  const group = live.activeGroup || live.groups[0];
  if (!group) return addPanel(key);
  const activePanel = group.activePanel;
  const index = activePanel ? group.panels.indexOf(activePanel) : group.panels.length;
  const consumingEmpty = activePanel && isEmptyTabKey(activePanel.id);
  const replacing = !newTab && activePanel && !consumingEmpty && activePanel.id !== key;
  if (newTab && !consumingEmpty) {
    return addPanel(key, { referenceGroup: group });
  }
  if (replacing) {
    const panel = addPanel(key, { referenceGroup: group, index });
    if (panel) live.removePanel(activePanel, { removeEmptyGroup: false });
    return panel;
  }
  const panel = addPanel(key, { referenceGroup: group, index: consumingEmpty ? index : undefined });
  if (panel && consumingEmpty) live.removePanel(activePanel, { removeEmptyGroup: false });
  return panel;
}

function replaceActive(groupId, key) {
  const live = api.value;
  if (!live || !key) return null;
  const existing = live.getPanel(key);
  if (existing) {
    existing.api.setActive();
    return existing;
  }
  const group = live.getGroup(groupId) || live.activeGroup || live.groups[0];
  if (!group) return addPanel(key);
  const activePanel = group.activePanel;
  if (!activePanel) return addPanel(key, { referenceGroup: group });
  const panel = addPanel(key, {
    referenceGroup: group,
    index: group.panels.indexOf(activePanel)
  });
  if (panel) live.removePanel(activePanel, { removeEmptyGroup: false });
  return panel;
}

function addPanel(key, { referenceGroup = null, referencePanel = '', direction = 'within', index, initialWidth, initialHeight, inactive = false } = {}) {
  const live = api.value;
  if (!live || !key) return null;
  const existing = live.getPanel(key);
  if (existing) return existing;
  const position = referenceGroup
    ? { referenceGroup, direction, ...(Number.isInteger(index) ? { index } : {}) }
    : referencePanel
      ? { referencePanel, direction, ...(Number.isInteger(index) ? { index } : {}) }
      : undefined;
  return live.addPanel({
    id: key,
    component: 'workspacePanel',
    title: labelFor(key),
    params: { key },
    ...(position ? { position } : {}),
    ...(initialWidth ? { initialWidth } : {}),
    ...(initialHeight ? { initialHeight } : {}),
    inactive
  });
}

function removePanel(key) {
  const live = api.value;
  const panel = live?.getPanel(key);
  if (!panel) return false;
  const group = panel.group;
  const lastPanel = group.panels.length === 1;
  const lastGroup = live.groups.length === 1;
  if (lastPanel && lastGroup) {
    const empty = addPanel(emptyTabKey(), { referenceGroup: group });
    live.removePanel(panel, { removeEmptyGroup: false });
    empty?.api.setActive();
    return true;
  }
  live.removePanel(panel, { removeEmptyGroup: true });
  return true;
}

function removeGroup(groupId) {
  const live = api.value;
  const group = live?.getGroup(groupId);
  if (!group) return false;
  live.removeGroup(group);
  if (!live.groups.length) {
    addPanel(emptyTabKey());
  }
  return true;
}

function splitGroup(groupId, orientation) {
  const live = api.value;
  const group = live?.getGroup(groupId);
  if (!group) return null;
  const next = live.addGroup({
    referenceGroup: group,
    direction: orientation === 'horizontal' ? 'right' : 'below'
  });
  const panel = addPanel(emptyTabKey(), { referenceGroup: next });
  panel?.api.setActive();
  return panel;
}

function ensureEmptyPanel() {
  if (!api.value) return null;
  if (api.value.panels.length) return null;
  return addPanel(emptyTabKey());
}

function applyLayout(layout) {
  const live = api.value;
  if (!live) return;
  if (!layout) {
    live.clear();
    return;
  }
  try {
    live.fromJSON(layout);
  } catch (error) {
    console.error('Workspace dock layout restore failed:', error);
    live.clear();
  }
  nextTick(() => {
    syncGroups();
    syncActive();
  });
}

function snapshot() {
  return api.value?.toJSON() || null;
}

function hasPanel(key) {
  return Boolean(api.value?.getPanel(key));
}

function panelIds() {
  return (api.value?.panels || []).map(panel => panel.id);
}

function groupFor(key) {
  return api.value?.getPanel(key)?.group || null;
}

function groupById(groupId) {
  return api.value?.getGroup(groupId) || null;
}

function groups() {
  return api.value?.groups || [];
}

function panelIdsInGroup(groupId) {
  return (api.value?.getGroup(groupId)?.panels || []).map(panel => panel.id);
}

function setPanelTitle(key, title) {
  api.value?.getPanel(key)?.setTitle(title);
}

async function sizePanelToContent(key, { axis = 'width', min = 160, max = null, ratio = 0.4 } = {}) {
  await nextTick();
  if (typeof requestAnimationFrame === 'function') {
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  const live = api.value;
  const panel = live?.getPanel(key);
  const element = contentElements.get(key);
  if (!panel || !element) return;
  const bounds = { width: live.width, height: live.height };
  const previous = axis === 'height' ? element.style.height : element.style.width;
  element.style[axis] = 'max-content';
  const measured = Math.ceil(Math.max(
    element.getBoundingClientRect()[axis],
    axis === 'height' ? element.scrollHeight : element.scrollWidth
  ));
  element.style[axis] = previous;
  if (!Number.isFinite(measured) || measured <= 0) return;
  const upper = max ?? Math.max(min, Math.floor(bounds[axis] * ratio));
  const size = Math.min(upper, Math.max(min, measured));
  panel.group.api.setSize(axis === 'height' ? { height: size } : { width: size });
}

onMounted(() => {
  mounted.value = true;
  syncTheme();
  themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});

onBeforeUnmount(() => {
  subscriptions.splice(0).forEach(subscription => subscription.dispose?.());
  themeObserver?.disconnect();
  themeObserver = null;
});

defineExpose({
  openPanel,
  replaceActive,
  addPanel,
  removePanel,
  removeGroup,
  splitGroup,
  ensureEmptyPanel,
  applyLayout,
  snapshot,
  hasPanel,
  panelIds,
  groupFor,
  groupById,
  groups,
  panelIdsInGroup,
  setPanelTitle,
  focusPanel,
  sizePanelToContent
});
</script>
