<template>
  <div
    class="flex h-full min-w-0 flex-1 items-stretch overflow-x-auto"
    role="tablist"
    :aria-label="$t('project.openFiles')"
  >
    <div
      v-for="tab in tabs"
      :key="tab.key"
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
</template>

<script setup>
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';

defineProps({
  tabs: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' }
});

defineEmits(['select', 'close']);

const { t } = useI18n();
const domainUi = useCutkitDomainUi();

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
