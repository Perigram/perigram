<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-0.5 rounded-t-ui" :style="{ backgroundColor: toneColor }"></div>
    <div class="flex items-center gap-2">
      <i :class="record.icon || 'pi pi-circle-fill'" :style="{ color: toneColor }"></i>
      <strong class="min-w-0 flex-1 truncate text-sm">{{ $t('processDesigner.paletteItems.defineStatus') }}</strong>
      <Button
        icon="pi pi-trash"
        severity="danger"
        text
        size="small"
        :aria-label="$t('common.delete')"
        @click.stop="data.onStatusDefinitionDelete?.()"
      />
    </div>

    <div class="nodrag nowheel mt-2 flex flex-col gap-2" @mousedown.stop @click.stop>
      <div class="grid grid-cols-2 gap-2">
        <InputText
          :model-value="record.statusId"
          size="small"
          :placeholder="$t('processDesigner.statusId')"
          @update:model-value="value => update({ statusId: value })"
        />
        <InputText
          :model-value="record.label"
          size="small"
          :placeholder="$t('common.label')"
          @update:model-value="value => update({ label: value })"
        />
        <Select
          :model-value="record.severity"
          :options="data.statusSeverityOptions || []"
          option-label="label"
          option-value="value"
          size="small"
          @update:model-value="value => update({ severity: value, color: value })"
        />
        <Select
          :model-value="record.icon"
          :options="data.statusIconOptions || []"
          option-label="label"
          option-value="value"
          size="small"
          @update:model-value="value => update({ icon: value })"
        >
          <template #option="{ option }">
            <div class="flex items-center gap-2">
              <i :class="option.value"></i>
              <span>{{ option.label }}</span>
            </div>
          </template>
        </Select>
      </div>

      <Button
        :icon="evidenceOpen ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
        :label="evidenceLabel"
        severity="secondary"
        text
        size="small"
        class="justify-start"
        @click="evidenceOpen = !evidenceOpen"
      />

      <div v-if="evidenceOpen" class="flex flex-col gap-2 border-t border-content-border pt-2">
        <div class="flex items-center gap-2">
          <Checkbox
            :model-value="Boolean(record.lifecycle?.description?.required)"
            binary
            :input-id="`status-description-${data.refId}`"
            @update:model-value="setDescriptionRequired"
          />
          <label :for="`status-description-${data.refId}`" class="text-xs">{{ $t('processDesigner.requireDescription') }}</label>
        </div>

        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium">{{ $t('processDesigner.attachments') }}</span>
          <Button icon="pi pi-plus" text size="small" :aria-label="$t('processDesigner.addAttachment')" @click="addAttachment" />
        </div>
        <div v-for="entry in attachmentEntries" :key="entry.key" class="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-1">
          <InputText :model-value="entry.key" size="small" @change="event => renameAttachment(entry.key, event.target.value)" />
          <Select
            :model-value="entry.schema.kind"
            :options="data.attachmentKindOptions || []"
            option-label="label"
            option-value="value"
            editable
            size="small"
            @update:model-value="value => updateAttachment(entry.key, { kind: value })"
          />
          <Checkbox
            :model-value="Boolean(entry.schema.required)"
            binary
            @update:model-value="value => updateAttachment(entry.key, { required: value })"
          />
          <Button icon="pi pi-times" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="removeAttachment(entry.key)" />
        </div>

        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium">{{ $t('processDesigner.snapshots') }}</span>
          <Button icon="pi pi-plus" text size="small" :aria-label="$t('processDesigner.addSnapshot')" @click="addSnapshot" />
        </div>
        <div v-for="entry in snapshotEntries" :key="entry.key" class="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1">
          <InputText :model-value="entry.key" size="small" @change="event => renameSnapshot(entry.key, event.target.value)" />
          <Select
            :model-value="entry.schema.entityType"
            :options="data.entityTypeOptions || []"
            option-label="label"
            option-value="value"
            size="small"
            @update:model-value="value => updateSnapshot(entry.key, { entityType: value })"
          />
          <InputText
            :model-value="entry.schema.lineageKey"
            size="small"
            :placeholder="$t('processDesigner.lineageKey')"
            @update:model-value="value => updateSnapshot(entry.key, { lineageKey: value })"
          />
          <Button icon="pi pi-times" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="removeSnapshot(entry.key)" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const evidenceOpen = ref(false);
const record = computed(() => props.data.statusDefinitionRecord || props.data);
const attachmentEntries = computed(() => Object.entries(record.value.lifecycle?.attachments || {})
  .map(([key, schema]) => ({ key, schema })));
const snapshotEntries = computed(() => Object.entries(record.value.lifecycle?.snapshots || {})
  .map(([key, schema]) => ({ key, schema })));
const evidenceCount = computed(() => (
  (record.value.lifecycle?.description?.required ? 1 : 0)
  + attachmentEntries.value.length
  + snapshotEntries.value.length
));
const evidenceLabel = computed(() => `${props.data.evidenceLabel || ''}${evidenceCount.value ? ` · ${evidenceCount.value}` : ''}`);
const toneColor = computed(() => ({
  success: 'var(--p-green-500)',
  info: 'var(--p-blue-500)',
  warn: 'var(--p-amber-500)',
  warning: 'var(--p-amber-500)',
  danger: 'var(--p-red-500)',
  secondary: 'var(--p-surface-500)'
})[record.value.severity || record.value.color] || 'var(--p-blue-500)');
const nodeFrameClass = computed(() => [
  'relative w-[26rem] rounded-ui border bg-content p-3 pt-3.5 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);

function update(updates) {
  props.data.onStatusDefinitionUpdate?.(updates);
}

function mutateLifecycle(mutator) {
  const lifecycle = structuredClone(record.value.lifecycle || {});
  mutator(lifecycle);
  if (!lifecycle.description?.required) delete lifecycle.description;
  if (!Object.keys(lifecycle.attachments || {}).length) delete lifecycle.attachments;
  if (!Object.keys(lifecycle.snapshots || {}).length) delete lifecycle.snapshots;
  update({ lifecycle: Object.keys(lifecycle).length ? lifecycle : undefined });
}

function setDescriptionRequired(required) {
  mutateLifecycle(lifecycle => {
    if (required) lifecycle.description = { required: true };
    else delete lifecycle.description;
  });
}

function addAttachment() {
  mutateLifecycle(lifecycle => {
    lifecycle.attachments ||= {};
    const key = uniqueKey('proof', lifecycle.attachments);
    lifecycle.attachments[key] = { kind: 'photo', required: true };
  });
}

function updateAttachment(key, updates) {
  mutateLifecycle(lifecycle => Object.assign(lifecycle.attachments[key], updates));
}

function renameAttachment(previous, value) {
  renameLifecycleEntry('attachments', previous, value);
}

function removeAttachment(key) {
  mutateLifecycle(lifecycle => delete lifecycle.attachments?.[key]);
}

function addSnapshot() {
  mutateLifecycle(lifecycle => {
    lifecycle.snapshots ||= {};
    const key = uniqueKey('snapshot', lifecycle.snapshots);
    lifecycle.snapshots[key] = {
      entityType: props.data.entityTypeOptions?.[0]?.value || '',
      lineageKey: '',
      required: true
    };
  });
}

function updateSnapshot(key, updates) {
  mutateLifecycle(lifecycle => Object.assign(lifecycle.snapshots[key], updates));
}

function renameSnapshot(previous, value) {
  renameLifecycleEntry('snapshots', previous, value);
}

function removeSnapshot(key) {
  mutateLifecycle(lifecycle => delete lifecycle.snapshots?.[key]);
}

function renameLifecycleEntry(section, previous, value) {
  const next = String(value || '').trim();
  if (!next || next === previous || record.value.lifecycle?.[section]?.[next]) return;
  mutateLifecycle(lifecycle => {
    lifecycle[section][next] = lifecycle[section][previous];
    delete lifecycle[section][previous];
  });
}

function uniqueKey(prefix, entries) {
  let index = 1;
  while (entries[`${prefix}${index}`]) index += 1;
  return `${prefix}${index}`;
}
</script>
