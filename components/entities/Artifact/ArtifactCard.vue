<script setup>
/**
 * Artifact View Component - v24 Standardized
 */
import { computed } from 'vue';
import Chip from 'primevue/chip';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import { useStatus } from '~/composables/useBlocks';

const props = defineProps({
  artifact: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card
});

defineEmits(['click']);

const { state } = useStatus(props.artifact);

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
      <EntityCard :entity="artifact" entity-type="artifact" variant="compact" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex items-start justify-between gap-2 min-w-0">
                <div class="flex items-center gap-2 min-w-0">
                    <i :class="['pi', icon]"></i>
                    <IdentityBlock :entity="artifact" variant="compact" />
                </div>
                <div class="shrink-0">
                    <EntityStatus :entity="artifact" entity-type="artifact" variant="inline" />
                </div>
            </div>
        </template>
        <template #subtitle>
            <small>{{ typeLabel }}</small>
        </template>
      </EntityCard>
    </template>

    <!-- CARD: Full featured card -->
    <template v-else-if="variant === 'card'">
      <EntityCard :entity="artifact" entity-type="artifact" variant="card" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex justify-between items-start gap-3 min-w-0">
                <IdentityBlock :entity="artifact" />
                <div class="shrink-0">
                    <EntityStatus :entity="artifact" entity-type="artifact" variant="inline" />
                </div>
            </div>
        </template>
        <template #subtitle>
            <small>{{ typeLabel }}</small>
        </template>
        <Divider />
        <div class="flex justify-center">
            <i :class="['pi', 'text-4xl', icon]"></i>
        </div>
      </EntityCard>
    </template>
  </div>
</template>
