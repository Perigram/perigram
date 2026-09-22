<template>
  <div class="flex h-full min-w-0 flex-1 items-stretch overflow-hidden">
    <Tabs
      :value="activeKey"
      scrollable
      class="min-w-0 flex-1 justify-center"
      @update:value="key => key !== activeKey && $emit('select', key)"
    >
      <TabList class="min-w-0 flex-1">
        <Tab
          v-for="tab in tabs"
          :key="tab.key"
          :value="tab.key"
          as="div"
          class="flex max-w-56 min-w-0 items-center !py-0 !px-2.5"
        >
          <i v-if="tabIcon(tab)" :class="tabIcon(tab)" class="shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ tabLabel(tab) }}</span>
          <InstanceState
            v-if="tab.kind === 'entity' && tab.entity?.states"
            :entity="tab.entity"
            :type-id="tab.type"
            variant="icon"
            @click.stop
            @refresh="$emit('refresh', tab)"
            @transitioned="$emit('refresh', tab)"
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
        </Tab>
      </TabList>
    </Tabs>
    <div class="flex shrink-0 items-center border-b border-chrome-border">
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
import { instanceIdentity } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';
import InstanceState from '~/components/shared/state/InstanceState.vue';

defineProps({
  tabs: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' }
});

defineEmits(['select', 'close', 'add', 'refresh']);

const { t } = useI18n();
const registry = useRegistryStore();

function tabLabel(tab = {}) {
  if (tab.kind === 'empty') return t('project.newTab');
  if (tab.kind === 'entity') {
    // Entity tab titles follow the render identity contract: the loaded
    // DTO maps through the wire-to-screen bridge before instanceIdentity,
    // so the declared identity field wins and raw ids never render.
    const typeRecord = registry.typeRecord(tab.type) || { id: tab.type };
    return instanceIdentity(typeRecord, dtoToScreenInstance(tab.entity || {}, typeRecord));
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
  if (tab.kind === 'empty') return 'pi pi-plus';
  if (tab.kind === 'entity' || tab.kind === 'screen') return registry.iconFor(tab.typeId);
  return resolveGeneratedWorkspacePage(tab.pageId)?.icon || 'pi pi-file';
}
</script>
