<script setup>
/**
 * Sheet Design View Component - v24 Standardized
 */
import Card from 'primevue/card';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { serial } = useIdentity(props.design);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-map"></i>
        <span>{{ serial || 'LAYOUT' }}</span>
        <EntityStatus :entity="design" entity-type="sheet_design" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card class="card-interactive">
        <template #content>
            <div class="flex items-center justify-between gap-4">
                <span>{{ serial || 'Sheet Design' }}</span>
                <EntityStatus :entity="design" entity-type="sheet_design" variant="inline" />
            </div>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card class="card-interactive">
        <template #content>
            <div class="flex flex-col gap-6 h-full">
                <div class="flex justify-between items-center gap-4">
                    <span class="text-xl">Sheet Layout</span>
                    <EntityStatus :entity="design" entity-type="sheet_design" variant="inline" />
                </div>
                <div class="flex flex-col gap-6 pt-6 border-t border-dashed flex-1">
                    <div class="aspect-[2/1] border border-dashed rounded flex items-center justify-center opacity-20 italic">
                        {{ serial }}
                    </div>
                    <div class="flex justify-between items-center mt-auto">
                        <small>Dimensions</small>
                        <span>{{ design.specs?.width }} x {{ design.specs?.length }} mm</span>
                    </div>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>
