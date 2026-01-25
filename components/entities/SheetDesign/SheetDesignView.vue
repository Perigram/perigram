<script setup>
/**
 * Sheet Design View Component - v24 Standardized
 */
import Card from 'primevue/card';
import EntityStatus from '../shared/EntityStatus.vue';

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
      <div class="flex items-center gap-2 whitespace-nowrap">
        <i class="pi pi-map opacity-50 text-[10px]"></i>
        <span class="font-mono text-xs font-bold">{{ serial || 'LAYOUT' }}</span>
        <EntityStatus :entity="design" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card>
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <span class="font-bold truncate leading-none text-base">{{ serial || 'Sheet Design' }}</span>
            <EntityStatus :entity="design" variant="inline" />
          </div>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card class="h-full">
        <template #title>
          <div class="flex justify-between items-center gap-4">
            <span class="font-bold text-lg leading-tight">Sheet Layout</span>
            <EntityStatus :entity="design" variant="inline" />
          </div>
        </template>
        <template #content>
          <div class="flex flex-col gap-4 pt-4 border-t border-surface border-dashed">
            <div class="aspect-[2/1] border border-surface border-dashed rounded-xl flex items-center justify-center opacity-20 my-2 font-black italic">
               {{ serial }}
            </div>
            <div class="flex justify-between items-center text-sm font-bold opacity-60">
              <span class="uppercase text-[10px]">Dimensions</span>
              <span>{{ design.specs?.width }} x {{ design.specs?.length }} mm</span>
            </div>
          </div>
        </template>
      </Card>
    </template>
  </div>
</template>
