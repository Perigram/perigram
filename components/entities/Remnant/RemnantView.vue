<script setup>
/**
 * Remnant View Component - v24 Standardized
 * Model: identity, lineage, specs
 */
import Card from 'primevue/card';
import EntityStatus from '../shared/EntityStatus.vue';

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
      <div class="flex items-center gap-2">
        <i class="pi pi-undo rotate-180 opacity-50"></i>
        <span class="font-mono font-bold">{{ serial }}</span>
        <EntityStatus :entity="remnant" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card>
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col">
              <span class="font-bold leading-none mb-1">{{ serial }}</span>
              <small class="opacity-50 font-black uppercase tracking-widest">{{ formattedArea }}</small>
            </div>
            <EntityStatus :entity="remnant" variant="inline" />
          </div>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card class="h-full">
        <template #title>
          <div class="flex justify-between items-start gap-4">
            <span class="font-black text-lg tracking-widest truncate">{{ serial }}</span>
            <EntityStatus :entity="remnant" variant="inline" />
          </div>
        </template>
        <template #content>
          <div class="flex flex-col gap-4 pt-4 mt-2 border-t border-surface border-dashed">
            <div class="aspect-video border border-surface border-dashed rounded-xl flex items-center justify-center opacity-20">
               <i class="pi pi-undo text-4xl rotate-180"></i>
            </div>
            <div class="flex justify-between items-center text-sm">
              <span class="opacity-50">Area</span>
              <span class="font-black text-primary">{{ formattedArea }}</span>
            </div>
          </div>
        </template>
      </Card>
    </template>
  </div>
</template>
