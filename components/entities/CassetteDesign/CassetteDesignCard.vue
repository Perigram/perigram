<script setup>
/**
 * Cassette Design View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Badge from 'primevue/badge';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name, serial } = useIdentity(props.design);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2 whitespace-nowrap">
        <i class="pi pi-pencil opacity-50 text-[10px]"></i>
        <span class="font-bold text-xs">{{ serial }}</span>
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card>
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col min-w-0">
              <span class="font-bold truncate text-base leading-none mb-1">{{ name }}</span>
              <small class="opacity-50 uppercase font-black tracking-widest">{{ serial }}</small>
            </div>
            <Badge :value="Object.keys(design.parameters || {}).length" severity="secondary" size="small" />
          </div>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card class="h-full">
        <template #title>
          <div class="flex justify-between items-start gap-4">
            <span class="font-bold text-lg leading-tight truncate">{{ serial }}</span>
            <small class="opacity-40 uppercase font-black text-[9px]">Baked Design</small>
          </div>
        </template>
        <template #content>
          <div class="flex flex-col gap-4 pt-4 border-t border-surface border-dashed">
            <div class="aspect-square border border-surface border-dashed rounded-xl flex items-center justify-center opacity-30 mt-2">
               <i class="pi pi-pencil text-4xl"></i>
            </div>
            <span class="font-black text-sm text-center opacity-80">{{ name }}</span>
          </div>
        </template>
      </Card>
    </template>
  </div>
</template>
