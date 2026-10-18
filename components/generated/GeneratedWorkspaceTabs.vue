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
          class="group/workspace-tab flex max-w-64 min-w-28 items-center gap-1.5 !py-0 !px-3"
        >
          <i v-if="tabIcon(tab)" :class="tabIcon(tab)" class="shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate text-body">{{ tabLabel(tab) }}</span>
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="secondary"
            class="invisible group-hover/workspace-tab:visible group-focus-within/workspace-tab:visible !h-6 !w-6"
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
        size="small"
        severity="secondary"
        class="!h-full !w-10"
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
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';

defineProps({
  tabs: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' }
});

defineEmits(['select', 'close-tab', 'add']);

const { t } = useI18n();

// The strip stretches to the pane header's fixed height; the header row
// owns the single hairline, so the tablist's border is dropped.
const tabListPt = {
  root: { style: { height: '100%' } },
  tabList: { style: { height: '100%', alignItems: 'stretch', borderWidth: 0 } },
  // Active tab indicator: a primary-colored bar riding the stripe's
  // hairline (the mirror of the mobile bar's top-edge accent).
  activeBar: { style: { height: '2px', background: 'var(--p-primary-color)', borderRadius: 0, zIndex: 1 } }
};

// Items carry their live label and icon (resolved over the instances pool
// and the page registry at build time); the strip only renders them.
function tabLabel(tab = {}) {
  if (tab.kind === 'empty') return t('project.newTab');
  if (tab.label) return tab.label;
  const definition = resolveGeneratedWorkspacePage(tab.pageId);
  return definition ? t(definition.labelKey) : tab.key;
}

function tabIcon(tab = {}) {
  if (tab.kind === 'empty') return 'pi pi-plus';
  return tab.icon || resolveGeneratedWorkspacePage(tab.pageId)?.icon || 'pi pi-file';
}
</script>
