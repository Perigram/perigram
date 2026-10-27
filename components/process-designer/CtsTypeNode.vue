<template>
  <DesignerNodeCard :selected="selected" size="md" >
    <div class="flex items-center gap-1.5">
      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-ui bg-subtle">
        <i :class="type?.icon || 'pi pi-database'" aria-hidden="true"></i>
      </span>
      <strong class="min-w-0 flex-1 truncate text-label">{{ type?.label || typeId }}</strong>
      <Tag :value="type?.class || ''" severity="secondary" />
    </div>
    <DesignerSocketHandle v-if="hasOutput" :socket="outputSpec" side="right" handle-id="output:type" />
  </DesignerNodeCard>
</template>

<script setup>
// Type reference anchor (SPEC §20/§4): a canvas node for one registry type.
// It owns no records — its wires carry type bindings into species records
// (role: 'type' edges are gestures, the binding lands in the record's type).
// A source-only leaf: the port contract carries no inputs, and the output
// handle renders only while the referenced type resolves in the view.
import { computed } from 'vue';
import Tag from 'primevue/tag';
import DesignerNodeCard from '~/components/shared/DesignerNodeCard.vue';
import DesignerSocketHandle from '~/components/shared/DesignerSocketHandle.vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const typeId = computed(() => props.data?.typeId || '');
const type = computed(() => props.data?.type || null);
const hasOutput = computed(() => (props.data?.outputSpecs?.length || 0) > 0);
const outputSpec = computed(() => props.data?.outputSpecs?.[0] || {});
</script>
