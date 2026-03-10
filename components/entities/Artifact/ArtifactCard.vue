<script setup>
/**
 * Artifact View Component - v24 Standardized
 */
import { computed } from 'vue';
import Chip from 'primevue/chip';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import StandardCard from '~/components/shared/StandardCard.vue';
import { useStatus } from '~/composables/useBlocks';

const props = defineProps({
  artifact: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card
});

defineEmits(['click']);

const { state, statusColor } = useStatus(props.artifact);

const icon = computed(() => {
  const type = props.artifact.type;
  if (type === 'LAYOUT_DXF') return 'pi-file-pdf';
  if (type === 'NESTING_REPORT') return 'pi-chart-bar';
  return 'pi-file';
});

const name = computed(() => props.artifact.identity?.name || props.artifact.name);
const typeLabel = computed(() => props.artifact.type?.replace('LAYOUT_', '') || 'FILE');
</script>

<template>
  <div class="cursor-pointer" @click="$emit('click', artifact)">
    <!-- INLINE: Small chip-like item -->
    <template v-if="variant === 'inline'">
      <Chip>
        <i :class="['pi', icon]" />
        <span>{{ typeLabel }}</span>
        <Tag v-if="state !== 'READY'" :severity="statusColor" size="small" />
      </Chip>
    </template>

    <!-- COMPACT: List item with more info -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex items-center gap-2">
                <i :class="['pi', icon]"></i>
                <span class="truncate">{{ name }}</span>
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
            <span class="truncate">{{ name }}</span>
        </template>
        <template #subtitle>
            <small>{{ typeLabel }}</small>
        </template>
        <template #content>
            <Divider />
            <div class="flex flex-col items-center gap-4">
                <i :class="['pi', icon]"></i>
                <Tag :value="state" :severity="statusColor" size="small" />
            </div>
        </template>
      </StandardCard>
    </template>
  </div>
</template>
