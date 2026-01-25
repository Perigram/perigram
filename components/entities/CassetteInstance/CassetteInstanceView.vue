<script setup>
/**
 * Cassette Instance View Component - v24 Standardized
 */
import Card from 'primevue/card';
import EntityStatus from '../shared/EntityStatus.vue';

const props = defineProps({
  instance: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { serial, reference } = useIdentity(props.instance);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2 whitespace-nowrap">
        <i class="pi pi-box opacity-50 text-[10px]"></i>
        <span class="font-bold text-xs">{{ serial }}</span>
        <EntityStatus :entity="instance" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card>
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col min-w-0">
              <span class="font-bold truncate text-base leading-none mb-1">{{ serial }}</span>
              <small class="opacity-50 uppercase font-black tracking-widest truncate">{{ reference || 'Physical Unit' }}</small>
            </div>
            <EntityStatus :entity="instance" variant="inline" />
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
            <EntityStatus :entity="instance" variant="inline" />
          </div>
        </template>
        <template #content>
          <div class="flex flex-col gap-4 pt-4 border-t border-surface border-dashed">
            <div class="py-6 border border-surface border-dashed rounded-xl flex items-center justify-center opacity-30 my-2">
               <i class="pi pi-box text-3xl"></i>
            </div>
            <div class="flex flex-col gap-1 text-[10px] uppercase font-bold opacity-40">
              <div class="flex justify-between">
                <span>Reference</span>
                <span class="text-inherit">{{ reference || 'N/A' }}</span>
              </div>
              <div class="flex justify-between">
                <span>Design ID</span>
                <span class="font-mono truncate ml-4">{{ instance.lineage?.designId }}</span>
              </div>
            </div>
          </div>
        </template>
      </Card>
    </template>
  </div>
</template>
