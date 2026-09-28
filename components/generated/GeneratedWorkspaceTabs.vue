<template>
  <div class="flex h-full min-w-0 flex-1 items-stretch overflow-hidden">
    <Tabs
      :value="activeKey"
      scrollable
      class="min-w-0 h-full flex-1 justify-center"
      @update:value="key => key !== activeKey && $emit('select', key)"
    >
      <TabList class="min-w-0 flex-1" :pt="tabListPt">
        <Tab
          v-for="tab in tabs"
          :key="tab.key"
          :value="tab.key"
          as="div"
          class="group/workspace-tab flex max-w-56 min-w-24 items-center !py-0 !px-2"
        >
          <i v-if="tabIcon(tab)" :class="tabIcon(tab)" class="shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ tabLabel(tab) }}</span>
          <InstanceState
            v-if="tab.kind === 'instance'"
            :instance="tab.instance"
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
            class="invisible group-hover/workspace-tab:visible group-focus-within/workspace-tab:visible !h-7 !w-7"
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
        class="!h-7 !w-7"
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
import InstanceState from '~/components/shared/state/InstanceState.vue';

defineProps({
  tabs: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' }
});

defineEmits(['select', 'close-tab', 'add', 'refresh']);

const { t } = useI18n();
const registry = useRegistryStore();

// The tab strip fills the pane header's fixed compact height (28px): the
// viewport and the tab row stretch to 100% and the tabs themselves
// (already !py-0) center inside, so the stripe controls (close, add,
// pane menu) carry !h-7 !w-7 to fill the stripe exactly — the PrimeVue
// small default (32px) would overflow and clip. The pane header row
// owns the single hairline under the whole stripe (tabs + pane
// controls), so the tablist's own border is dropped.
const tabListPt = {
  root: { style: { height: '100%' } },
  tabList: { style: { height: '100%', alignItems: 'stretch', borderWidth: 0 } }
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
  if (tab.kind === 'empty') return 'pi pi-plus';
  if (tab.kind === 'instance' || tab.kind === 'screen') return registry.iconFor(tab.typeId);
  return resolveGeneratedWorkspacePage(tab.pageId)?.icon || 'pi pi-file';
}
</script>
