<script setup>
// CTS state node, modeled on ProcessStatusDefinitionNode: an inline-editable
// card — name input inside the node, initial/terminal toggles, and handles
// for wiring transitions by drag, exactly like the process designer.
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});
const emit = defineEmits(['change', 'set-initial']);

const tone = computed(() => {
  if (props.data.initial) return 'var(--ck-status-info)';
  if (props.data.terminal) return 'var(--ck-status-danger)';
  return 'var(--ck-status-neutral)';
});

const frameClass = computed(() => [
  'relative w-52 rounded-ui border bg-content p-2.5 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);

function update(patch) {
  if (!props.data.editable) return;
  Object.assign(props.data, patch);
  emit('change');
}
</script>

<template>
  <div :class="frameClass">
    <div class="absolute inset-x-0 top-0 h-0.5 rounded-t-ui" :style="{ backgroundColor: tone }"></div>

    <div class="flex items-center gap-1.5 border-b border-content-border pb-1.5">
      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-ui bg-subtle">
        <i :class="data.initial ? 'pi pi-flag' : data.terminal ? 'pi pi-circle-stop' : 'pi pi-circle'" :style="{ color: tone }" aria-hidden="true"></i>
      </span>
      <strong class="min-w-0 flex-1 truncate text-label">state</strong>
      <Tag v-if="data.initial" value="initial" severity="info" />
      <Tag v-else-if="data.terminal" value="terminal" severity="danger" />
    </div>

    <div class="nodrag nowheel mt-2 flex flex-col gap-1.5" @mousedown.stop @click.stop>
      <InputText
        :model-value="data.name"
        size="small"
        class="w-full"
        placeholder="state name"
        :readonly="!data.editable"
        @update:model-value="value => update({ name: value })"
      />
      <div class="flex gap-1.5">
        <Button
          label="initial"
          size="small"
          :severity="data.initial ? 'info' : 'secondary'"
          :outlined="!data.initial"
          :disabled="!data.editable"
          class="flex-1"
          @click="emit('set-initial')"
        />
        <Button
          label="terminal"
          size="small"
          :severity="data.terminal ? 'danger' : 'secondary'"
          :outlined="!data.terminal"
          :disabled="!data.editable"
          class="flex-1"
          @click="update({ terminal: !data.terminal })"
        />
      </div>
    </div>

    <Handle type="target" :position="Position.Left" class="!h-3 !w-3 !rounded-full" aria-label="transition in" />
    <Handle type="source" :position="Position.Right" class="!h-3 !w-3 !rounded-full" aria-label="transition out" />
  </div>
</template>
