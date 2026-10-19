<template>
  <div class="flex h-full min-w-0 flex-1 items-stretch gap-1 overflow-hidden pl-1">
    <Tabs
      :value="activeKey"
      scrollable
      class="h-full min-w-0 w-fit"
      @update:value="key => key !== activeKey && $emit('select', key)"
    >
      <TabList class="min-w-0 h-full" :pt="tabListPt">
        <Tab
          v-for="tab in tabs"
          :key="tab.key"
          :value="tab.key"
          as="div"
          class="group/workspace-tab m-0 flex max-w-64 items-center gap-1.5 rounded-ui border px-2 py-0.5 text-supporting transition-colors"
          :class="tab.key === activeKey
            ? 'bg-[var(--p-button-secondary-background)] text-[var(--p-button-secondary-color)] border-[var(--p-button-secondary-border-color)] hover:bg-[var(--p-button-secondary-hover-background)] hover:text-[var(--p-button-secondary-hover-color)] hover:border-[var(--p-button-secondary-hover-border-color)]'
            : 'border-transparent text-muted hover:bg-subtle'"
        >
          <i v-if="tabIcon(tab)" :class="tabIcon(tab)" class="shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ tabLabel(tab) }}</span>
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="secondary"
            class="invisible group-hover/workspace-tab:visible group-focus-within/workspace-tab:visible !h-6 !w-6 !text-current"
            :aria-label="$t('common.close')"
            @click.stop="$emit('close-tab', tab.key)"
          />
        </Tab>
      </TabList>
    </Tabs>
    <div class="flex shrink-0 items-center">
      <Button
        icon="pi pi-plus"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('project.newTab')"
        @click.stop="$emit('add')"
      />
    </div>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import { useI18n } from 'vue-i18n';
import { useRegistryStore } from '~/stores/registry';
import { titleFor } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';

defineProps({
  tabs: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' }
});

defineEmits(['select', 'close-tab', 'add']);

const { t } = useI18n();
const registry = useRegistryStore();

// The strip stretches to the pane header's fixed height. Tab surfaces
// ride one step under the chats folder chips (ChatSupport.vue):
// selected takes the secondary button surface, idle tabs stay on the
// floor.
const tabListPt = {
  root: { style: { height: '100%' } },
  tabList: { class: 'h-full items-center gap-1', style: { borderWidth: 0 } },
  activeBar: { style: { display: 'none' } }
};

function tabLabel(tab = {}) {
  if (tab.kind === 'empty') return t('project.newTab');
  if (tab.kind === 'instance') {
    // Entity tab titles follow the one title resolver: the loaded DTO
    // maps through the wire-to-screen bridge before titleFor, so the
    // declared identity field wins and raw ids never render.
    const typeRecord = registry.typeRecord(tab.type) || null;
    return titleFor(
      typeRecord ? dtoToScreenInstance(tab.instance || {}, typeRecord) : null,
      typeRecord,
      { unnamedLabel: t('common.unnamed') }
    );
  }
  // Opened type screens resolve their compiled label from the manifest.
  if (tab.kind === 'screen') {
    return tab.label || tab.screenKey;
  }
  // Runtime-opened pages (live calls) carry their own label.
  if (typeof tab.label === 'string' && tab.label) return tab.label;
  const definition = resolveGeneratedWorkspacePage(tab.pageId);
  return definition ? t(definition.labelKey) : tab.key;
}

function tabIcon(tab = {}) {
  if (tab.kind === 'empty') return null;
  if (tab.kind === 'instance' || tab.kind === 'screen') return registry.iconFor(tab.typeId);
  return resolveGeneratedWorkspacePage(tab.pageId)?.icon || 'pi pi-file';
}
</script>
