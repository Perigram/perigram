<template>
  <div class="relative min-w-72 rounded-ui border border-emerald-300 bg-content px-3 py-3 shadow-card">
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

    <div class="mt-3 grid grid-cols-2 gap-3">
      <div class="flex flex-col gap-1">
        <small class="mb-1 block text-muted-color">{{ $t('processDesigner.inputs') }}</small>
        <div
          v-for="(input, index) in inputSpecs"
          :key="input.id"
          class="relative min-w-0 rounded-ui border border-content-border py-1 pl-3 pr-2"
        >
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" class="!left-[-0.55rem] !border-emerald-500 !bg-emerald-500" />
          <div class="min-w-0">
            <Tag :value="input.label" size="small" />
            <div v-if="input.detail" class="truncate text-xs text-muted-color">{{ input.detail }}</div>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <small class="mb-1 block text-muted-color">{{ $t('processDesigner.outputs') }}</small>
        <div
          v-for="(output, index) in outputSpecs"
          :key="output.id"
          class="relative min-w-0 rounded-ui border border-content-border py-1 pl-2 pr-3 text-right"
        >
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" class="!right-[-0.55rem] !border-emerald-500 !bg-emerald-500" />
          <div class="min-w-0">
            <Tag :value="output.label" size="small" severity="success" />
            <div v-if="output.detail" class="truncate text-xs text-muted-color">{{ output.detail }}</div>
          </div>
        </div>
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
  if (props.data.triggerMode === 'user') return props.data.triggerRoleLabels?.length ? props.data.triggerRoleLabels : [t('common.notAvailable')];
  return [props.data.triggerMode || t('common.user')];
});
const inputSpecs = computed(() => normalizeSpecs(props.data.inputSpecs || props.data.inputLabels || []));
const outputSpecs = computed(() => normalizeSpecs(props.data.outputSpecs || props.data.outputLabels || []));
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

function normalizeSpecs(items = []) {
  return items.map((item, index) => {
    if (typeof item === 'string') return { id: `${item}-${index}`, label: item, detail: '' };
    return {
      id: item.id || item.label || index,
      label: item.label || item.entityType || item.id,
      detail: item.detail || ''
    };
  });
}

function socketHandleId(kind, item, index, items) {
  if (items.length === 1) return kind;
  return `${kind}:${item.id || index}`;
}
</script>
