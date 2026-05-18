<script setup>
/**
 * Artifact View Component - v24 Standardized
 */
import { computed } from 'vue';
import Chip from 'primevue/chip';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const ARTIFACT_FIELDS = [
  { path: 'attachments.primary.name', i18n: 'file.name' },
  { path: 'data.type', i18n: 'file.type' }
];

const props = defineProps({
  artifact: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card
});

defineEmits(['click']);

const state = computed(() => props.artifact.status?.state || 'UNKNOWN');
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
    <!-- INLINE: Small chip-like item -->
    <template v-if="variant === 'inline'">
      <Chip>
        <i :class="['pi', icon]" />
        <span>{{ typeLabel }}</span>
        <EntityStatus v-if="state !== 'READY'" :entity="artifact" entity-type="artifact" variant="inline" />
      </Chip>
    </template>

    <!-- COMPACT: List item with more info -->
    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="artifact" entity-type="artifact" variant="compact" :show-trace="false">
        <template #before-identity>
            <i :class="['pi', icon]"></i>
        </template>
        <template #subtitle>
            <small>{{ typeLabel }}</small>
        </template>
      </EntityCard>
    </template>

    <!-- CARD: Full featured card -->
    <template v-else-if="variant === 'card'">
      <EntityCard :entity="artifact" entity-type="artifact" variant="card" :show-trace="false">
        <template #before-identity>
            <i :class="['pi', icon]"></i>
        </template>
        <template #subtitle>
            <small>{{ typeLabel }}</small>
        </template>
        <Divider />
        <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-ui border border-content-border flex items-center justify-center shrink-0">
                <i :class="['pi', 'text-xl', icon]"></i>
            </div>
            <DataBlock :entity="artifact" :fields="ARTIFACT_FIELDS" class="flex-1" />
        </div>
      </EntityCard>
    </template>
  </div>
</template>
