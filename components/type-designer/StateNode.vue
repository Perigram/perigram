<template>
  <DesignerNodeCard :selected="selected" size="sm" :shape="shape">
    <div class="flex items-center gap-1.5">
      <i :class="[terminal ? 'pi pi-circle-fill' : 'pi pi-circle', flagTone]" aria-hidden="true" />
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
    <DesignerSocketHandle :socket="inputSpec" side="left" handle-id="input:state" />
    <DesignerSocketHandle :socket="outputSpec" side="right" handle-id="output:state" />
  </DesignerNodeCard>
</template>

<script setup>
// State node: a value token (SPEC §7). Its output wires the value into
// create/transition state sockets; its input nests another state inside
// it. No axis names, no parent markers — the wire is the declaration.
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import DesignerNodeCard from '~/components/shared/DesignerNodeCard.vue';
import DesignerSocketHandle from '~/components/shared/DesignerSocketHandle.vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false },
  // Population shape passthrough (node UI contract): the process canvas
  // renders this family as the dashed declaration vocabulary; the type
  // canvas passes nothing and keeps the neutral default frame.
  shape: { type: String, default: '' }
});

defineEmits(['rename']);

const value = computed(() => props.data.value || '');
const terminal = computed(() => props.data.terminal === true);
const flagTone = 'text-muted';
const inputSpec = computed(() => props.data.inputSpecs?.[0] || {});
const outputSpec = computed(() => props.data.outputSpecs?.[0] || {});
</script>
