<template>
  <div class="flex h-full min-w-0 flex-1 items-stretch overflow-hidden">
    <div
      class="workspace-tab-strip flex min-w-0 items-stretch overflow-x-auto"
      role="tablist"
      :aria-label="$t('project.openFiles')"
      @dragover.prevent
      @drop.prevent="dropBefore($event)"
    >
      <div
        v-for="tab in tabs"
        :key="tab.key"
        role="presentation"
        class="workspace-file-tab group flex min-w-0 shrink-0 items-center border-r border-content-border"
        :class="tab.key === activeKey ? 'border-b-2 border-b-primary bg-content' : 'border-b-2 border-b-transparent'"
        draggable="true"
        @dragstart="startDrag($event, tab.key)"
        @dragover.prevent
        @drop.prevent="dropBefore($event, tab.key)"
      >
        <Button
          :label="tabLabel(tab)"
          :icon="tabIcon(tab)"
          text
          size="small"
          severity="secondary"
          class="min-w-0 max-w-56 !rounded-none"
          :class="tab.key === activeKey ? 'font-medium' : 'text-muted-color'"
          :pt="{ label: { class: 'truncate' } }"
          :title="tabLabel(tab)"
          role="tab"
          :aria-selected="tab.key === activeKey"
          @click="$emit('select', tab.key)"
        />
        <EntityStatus
          v-if="tab.kind === 'entity' && tab.entity?.status?.state"
          :entity="tab.entity"
          :entity-type="tab.type"
          variant="icon"
          @refresh="$emit('refresh', tab)"
          @transitioned="$emit('refresh', tab)"
        />
        <span
          v-if="isTabDirty(tab)"
          class="h-2 w-2 shrink-0 rounded-full bg-[var(--ck-status-warning)]"
          role="img"
          :aria-label="$t('cassette.v2.unsaved')"
          v-tooltip.top="$t('cassette.v2.unsaved')"
        />
        <Button
          icon="pi pi-times"
          text
          rounded
          size="small"
          severity="secondary"
          class="workspace-file-tab__close opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          :class="tab.key === activeKey ? '!opacity-100' : ''"
          :aria-label="$t('common.close')"
          @click.stop="$emit('close', tab.key)"
        />
      </div>
    </div>
    <Button
      icon="pi pi-plus"
      text
      rounded
      size="small"
      severity="secondary"
      class="shrink-0 self-center"
      :disabled="addableTabs.length === 0"
      :aria-label="$t('common.add')"
      @click.stop="toggleAdd"
    />
    <Popover ref="addPopover">
      <div class="flex min-w-52 flex-col gap-1" @click="hideAdd">
        <Button
          v-for="tab in addableTabs"
          :key="tab.key"
          :label="tabLabel(tab)"
          :icon="tabIcon(tab)"
          text
          size="small"
          class="w-full justify-start"
          @click="$emit('add', tab.key)"
        />
      </div>
    </Popover>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import { useI18n } from 'vue-i18n';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';

const props = defineProps({
  tabs: { type: Array, default: () => [] },
  availableTabs: { type: Array, default: () => [] },
  dirtyTabKeys: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' },
  paneId: { type: String, default: '' }
});

const emit = defineEmits(['select', 'close', 'add', 'refresh', 'reorder', 'move']);

const { t } = useI18n();
const domainUi = useCutkitDomainUi();
const addPopover = ref(null);
const addableTabs = computed(() => {
  const openKeys = new Set(props.tabs.map(tab => tab.key));
  return props.availableTabs.filter(tab => !openKeys.has(tab.key));
});

function toggleAdd(event) {
  addPopover.value?.toggle(event);
}

function hideAdd() {
  addPopover.value?.hide();
}

function isTabDirty(tab = {}) {
  return Boolean(tab.modified) || props.dirtyTabKeys.includes(tab.key);
}

function startDrag(event, key) {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-cutkit-workspace-file', JSON.stringify({
    key,
    paneId: props.paneId
  }));
}

function dropBefore(event, beforeKey = '') {
  const payload = readDragPayload(event);
  if (!payload?.key || !payload.paneId) return;
  if (payload.paneId === props.paneId) {
    emit('reorder', { key: payload.key, beforeKey });
    return;
  }
  emit('move', { ...payload, targetPaneId: props.paneId, beforeKey });
}

function readDragPayload(event) {
  try {
    return JSON.parse(event.dataTransfer?.getData('application/x-cutkit-workspace-file') || 'null');
  } catch {
    return null;
  }
}

function tabLabel(tab = {}) {
  if (tab.label) return tab.label;
  if (tab.kind === 'entity') {
    return tab.entity?.identity?.name || tab.entity?.identity?.slug || tab.entity?.identity?.uid || tab.key;
  }
  const definition = resolveGeneratedWorkspacePage(tab.pageId);
  return definition ? t(definition.labelKey) : tab.key;
}

function tabIcon(tab = {}) {
  if (tab.icon) return tab.icon;
  if (tab.kind === 'entity') return domainUi.getIcon(tab.type);
  return resolveGeneratedWorkspacePage(tab.pageId)?.icon || 'pi pi-file';
}
</script>
