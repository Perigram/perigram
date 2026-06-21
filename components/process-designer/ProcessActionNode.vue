<template>
  <div class="relative min-w-72 rounded-ui border border-emerald-300 bg-content px-3 py-3 shadow-card">
    <Handle id="input" type="target" :position="Position.Left" class="!border-emerald-500 !bg-emerald-500" />
    <Handle id="output" type="source" :position="Position.Right" class="!border-emerald-500 !bg-emerald-500" />
    <Handle id="trigger" type="target" :position="Position.Top" class="!border-sky-500 !bg-sky-500" />

    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i :class="iconClass" aria-hidden="true"></i>
          <strong class="truncate">{{ data.label || data.actionKind || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ subtitle }}</small>
      </div>
      <Badge :value="data.roleCount || 0" severity="success" />
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <Tag :value="data.triggerMode || commonUserLabel" size="small" severity="info" />
      <Tag :value="$t('processDesigner.inputsCount', { count: data.inputCount || 0 })" size="small" />
      <Tag :value="$t('processDesigner.outputsCount', { count: data.outputCount || 0 })" size="small" severity="success" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Badge from 'primevue/badge';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';

const props = defineProps({ data: { type: Object, default: () => ({}) } });
const { t } = useI18n();

const commonUserLabel = computed(() => t('common.user'));
const subtitle = computed(() => {
  if (props.data.actionKind === 'runCommand') return props.data.commandId || t('processDesigner.commandId');
  if (props.data.statusTo) return `${props.data.entityType || t('processDesigner.entityType')} -> ${props.data.statusTo}`;
  return props.data.entityType || t('processDesigner.entityType');
});
const iconClass = computed(() => ({
  createEntity: 'pi pi-plus-circle text-primary',
  changeStatus: 'pi pi-sync text-primary',
  archiveEntity: 'pi pi-inbox text-primary',
  runCommand: 'pi pi-play-circle text-primary'
})[props.data.actionKind] || 'pi pi-bolt text-primary');
</script>
