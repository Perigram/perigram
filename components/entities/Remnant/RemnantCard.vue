<script setup>
/**
 * Remnant View Component - v24 Standardized
 */
import Card from 'primevue/card';
import EntityStatus from '../shared/EntityStatus.vue';
import { useIdentity, useSpecs } from '~/composables/useBlocks';

const props = defineProps({
  remnant: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { serial } = useIdentity(props.remnant);
const { formattedArea } = useSpecs(props.remnant);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-undo rotate-180"></i>
        <span>{{ serial }}</span>
        <EntityStatus :entity="remnant" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card>
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <span class="truncate">{{ serial }}</span>
                <EntityStatus :entity="remnant" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ formattedArea }}</small>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ serial }}</span>
                <EntityStatus :entity="remnant" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>Area: {{ formattedArea }}</small>
        </template>
        <template #content>
            <div class="flex flex-col gap-4 pt-4 border-t border-dashed">
                <div class="aspect-video border rounded border-muted flex items-center justify-center opacity-30">
                    <i class="pi pi-undo text-3xl rotate-180"></i>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>