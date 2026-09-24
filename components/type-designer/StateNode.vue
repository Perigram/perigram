<template>
  <DesignerNodeCard :selected="selected" size="sm">
    <div class="flex items-center gap-1.5">
      <i :class="[initial ? 'pi pi-flag-fill' : terminal ? 'pi pi-circle-fill' : 'pi pi-circle', flagTone]" aria-hidden="true" />
      <InputText
        :model-value="value"
        size="small"
        class="min-w-0 flex-1"
        :placeholder="'state'"
        @update:model-value="val => $emit('rename', val)"
        @click.stop
        @dblclick.stop
      />
    </div>
    <div v-if="axis || hasParent" class="flex flex-wrap gap-1">
      <span v-if="axis" class="rounded-ui border border-content-border px-1 text-muted text-supporting">{{ axis }}</span>
      <span v-if="hasParent" class="rounded-ui border border-content-border px-1 text-muted text-supporting">parent</span>
    </div>
    <DesignerSocketHandle :socket="inputSpec" side="left" handle-id="input:in" />
    <DesignerSocketHandle :socket="outputSpec" side="right" handle-id="output:state" />
  </DesignerNodeCard>
</template>

<script setup>
// State declaration node: wires into its type (declares); wired into
// another state it nests under that parent status (`parent.child`,
// nested machines). Transitions are declared by transition nodes only.
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import DesignerNodeCard from '~/components/shared/DesignerNodeCard.vue';
import DesignerSocketHandle from '~/components/shared/DesignerSocketHandle.vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

defineEmits(['rename']);

const value = computed(() => props.data.value || '');
const axis = computed(() => props.data.axis || '');
const hasParent = computed(() => Boolean(props.data.parentStateId));
const initial = computed(() => props.data.initial === true);
const terminal = computed(() => props.data.terminal === true);
const flagTone = computed(() => initial.value ? 'text-primary' : 'text-muted');
const inputSpec = computed(() => props.data.inputSpecs?.[0] || {});
const outputSpec = computed(() => props.data.outputSpecs?.[0] || {});
</script>
