<script setup>
/**
 * Cassette Template View Component - v24 Standardized
 */
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  template: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card
});

const { name } = useIdentity(props.template);

const downloadDxf = () => {
    const url = `/api/cassettes/${props.template._id}/export`;
    window.open(url, '_blank');
};
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline View -->
    <template v-if="variant === 'inline'">
      <i class="pi pi-clone text-[10px]"></i>
      <span class="font-bold text-xs text-surface-900 dark:text-surface-0">{{ name }}</span>
    </template>

    <!-- Compact View -->
    <template v-else-if="variant === 'compact'">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl border border-surface-200 dark:border-surface-700 flex items-center justify-center bg-surface-50 dark:bg-surface-800 transition-colors">
          <i class="pi pi-clone text-surface-400"></i>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="font-bold text-surface-900 dark:text-surface-0 leading-none">{{ name }}</span>
          <span class="text-[10px] text-surface-400 dark:text-surface-500 uppercase font-black tracking-widest">{{ template.definition?.type }}</span>
        </div>
      </div>
    </template>

    <!-- Card View -->
    <template v-else-if="variant === 'card'">
      <div class="block-header">
        <span class="text-[10px] font-black text-surface-400 dark:text-surface-500 uppercase tracking-[0.2em]">Cassette Template</span>
        <EntityStatus :entity="template" variant="inline" />
      </div>

      <div class="my-4">
        <h3 class="text-2xl font-black text-surface-900 dark:text-surface-0 tracking-tight leading-none">{{ name }}</h3>
        <p class="text-[10px] text-surface-400 dark:text-surface-500 font-black uppercase mt-2 tracking-widest">{{ template.definition?.type }}</p>
      </div>

      <div class="flex flex-wrap gap-2 mb-6">
        <Tag v-for="param in template.definition?.parameters" :key="param" :value="param" severity="secondary" class="text-[9px] font-black tracking-widest px-2 py-0.5" />
      </div>

      <div class="mt-auto pt-4 border-t border-surface-100 dark:border-surface-800 flex gap-2">
         <Button label="Create Instance" icon="pi pi-plus" size="small" outlined class="flex-1 font-bold" />
         <Button icon="pi pi-download" size="small" text rounded class="h-8 w-8" @click="downloadDxf" />
      </div>
    </template>
  </div>
</template>