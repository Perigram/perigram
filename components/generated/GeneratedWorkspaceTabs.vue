<template>
  <div class="flex h-full min-w-0 flex-1 items-stretch overflow-hidden">
    <div
      class="workspace-tab-strip flex min-w-0 items-stretch overflow-x-auto"
      role="tablist"
      :aria-label="$t('project.openFiles')"
    >
      <div
        v-for="tab in tabs"
        :key="tab.key"
        role="presentation"
        class="flex min-w-0 shrink-0 items-center border-r border-content-border"
        :class="tab.key === activeKey ? 'border-b-2 border-b-primary bg-content' : 'border-b-2 border-b-transparent'"
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
  activeKey: { type: String, default: '' }
});

defineEmits(['select', 'close', 'add', 'refresh']);

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
  return props.dirtyTabKeys.includes(tab.key);
}

function tabLabel(tab = {}) {
  if (tab.kind === 'entity') {
    return tab.entity?.identity?.name || tab.entity?.identity?.slug || tab.entity?.identity?.uid || tab.key;
  }
  const definition = resolveGeneratedWorkspacePage(tab.pageId);
  return definition ? t(definition.labelKey) : tab.key;
}

function tabIcon(tab = {}) {
  if (tab.kind === 'entity') return domainUi.getIcon(tab.type);
  return resolveGeneratedWorkspacePage(tab.pageId)?.icon || 'pi pi-file';
}
</script>
