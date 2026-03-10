<script setup>
/**
 * Artifact View Component - v24 Standardized
 */
import { computed } from 'vue';
import Chip from 'primevue/chip';
import Divider from 'primevue/divider';
import StandardCard from '~/components/shared/StandardCard.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import { useIdentity, useStatus } from '~/composables/useBlocks';

const props = defineProps({
  artifact: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card
});

defineEmits(['click']);

const { name } = useIdentity(props.artifact);
const { state, statusColor } = useStatus(props.artifact);

const icon = computed(() => {
  const type = props.artifact.type;
  if (type === 'LAYOUT_DXF') return 'pi-file-pdf';
  if (type === 'NESTING_REPORT') return 'pi-chart-bar';
  return 'pi-file';
});

const typeLabel = computed(() => props.artifact.type?.replace('LAYOUT_', '') || 'FILE');
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
      <StandardCard>
        <template #title>
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                    <i :class="['pi', icon]"></i>
                    <span class="truncate">{{ name }}</span>
                </div>
                <EntityStatus :entity="artifact" entity-type="artifact" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ typeLabel }}</small>
        </template>
      </StandardCard>
    </template>

    <!-- CARD: Full featured card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ name }}</span>
                <EntityStatus :entity="artifact" entity-type="artifact" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ typeLabel }}</small>
        </template>
        <Divider />
        <div class="flex justify-center">
            <i :class="['pi', 'text-4xl', icon]"></i>
        </div>
      </StandardCard>
    </template>
  </div>
</template>
