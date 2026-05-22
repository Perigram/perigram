<script setup>
/**
 * Artifact View Component - v24 Standardized
 */
import { computed } from 'vue';
import EntityCard from '~/components/shared/EntityCard.vue';

const props = defineProps({
  artifact: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card
});

defineEmits(['click']);

const artifactType = computed(() => props.artifact.data?.type || '');

const icon = computed(() => {
  const type = artifactType.value;
  if (type === 'LAYOUT_DXF') return 'pi-file-pdf';
  if (type === 'NESTING_REPORT') return 'pi-chart-bar';
  return 'pi-file';
});

const typeLabel = computed(() => artifactType.value.replace('LAYOUT_', '') || 'FILE');
</script>

<template>
  <div class="cursor-pointer" @click="$emit('click', artifact)">
    <EntityCard :entity="artifact" entity-type="artifact" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i :class="['pi', icon]"></i>
      </template>
      <template #subtitle>
        <span>{{ typeLabel }}</span>
      </template>
    </EntityCard>
  </div>
</template>
