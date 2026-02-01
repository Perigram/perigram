<template>
  <div>
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-pencil"></i>
        <span>{{ serial }}</span>
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ name }}</span>
                <Badge :value="Object.keys(design.parameters || {}).length" severity="secondary" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ serial }}</small>
        </template>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ serial }}</span>
                <small>Baked Design</small>
            </div>
        </template>
        <template #subtitle>
            <span>{{ name }}</span>
        </template>
        <template #content>
            <Divider />
            <div class="flex justify-center">
                <i class="pi pi-pencil"></i>
            </div>
        </template>
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Cassette Design View Component - v24 Standardized
 */
import Badge from 'primevue/badge';
import Divider from 'primevue/divider';
import StandardCard from '~/components/shared/StandardCard.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name, serial } = useIdentity(props.design);
</script>