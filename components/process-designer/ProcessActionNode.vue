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
    </div>

    <div class="mt-3 flex flex-wrap gap-1">
      <Tag
        v-for="role in triggerLabels"
        :key="role"
        :value="role"
        size="small"
        severity="info"
      />
    </div>

    <div class="mt-3 grid grid-cols-1 gap-2">
      <div v-if="inputLabels.length" class="flex flex-wrap gap-1">
        <Tag v-for="input in inputLabels" :key="input" :value="input" size="small" />
      </div>
      <div v-if="outputLabels.length" class="flex flex-wrap gap-1">
        <Tag v-for="output in outputLabels" :key="output" :value="output" size="small" severity="success" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';

const props = defineProps({ data: { type: Object, default: () => ({}) } });
const { t } = useI18n();

const triggerLabels = computed(() => {
  if (props.data.triggerMode === 'user') return props.data.triggerRoleLabels?.length ? props.data.triggerRoleLabels : ['No role'];
  return [props.data.triggerMode || t('common.user')];
});
const inputLabels = computed(() => props.data.inputLabels || []);
const outputLabels = computed(() => props.data.outputLabels || []);
const subtitle = computed(() => {
  if (props.data.actionKind === 'runCommand') return props.data.commandId || t('processDesigner.commandId');
  if (props.data.statusTo) return `${props.data.entityType || t('processDesigner.entityType')} -> ${props.data.statusTo}`;
  return props.data.entityType || t('processDesigner.entityType');
});
const iconClass = computed(() => ({
  createEntity: 'pi pi-plus-circle text-primary',
  changeStatus: 'pi pi-sync text-primary',
  archiveEntity: 'pi pi-inbox text-primary',
  runCommand: 'pi pi-play-circle text-primary',
  sendToOrganization: 'pi pi-send text-primary'
})[props.data.actionKind] || 'pi pi-bolt text-primary');
</script>
