<template>
  <div class="flex h-full min-w-0 flex-1 items-stretch overflow-hidden">
    <Tabs
      :value="activeKey"
      class="min-w-0 flex-1 justify-center"
      @update:value="key => key !== activeKey && $emit('select', key)"
    >
      <TabList class="min-w-0 flex-1">
        <Tab
          v-for="tab in tabs"
          :key="tab.key"
          :value="tab.key"
          as="div"
          class="flex max-w-56 min-w-0 items-center !shrink !py-1.5 !px-2.5"
        >
          <i v-if="tabIcon(tab)" :class="tabIcon(tab)" class="shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ tabLabel(tab) }}</span>
          <EntityStatus
            v-if="tab.kind === 'entity' && tab.entity?.status?.state"
            :entity="tab.entity"
            :entity-type="tab.type"
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
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import { useI18n } from 'vue-i18n';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';

const props = defineProps({
  tabs: { type: Array, default: () => [] },
  availableTabs: { type: Array, default: () => [] },
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
