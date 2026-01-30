<script setup>
/**
 * Catalog View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Button from 'primevue/button';
import { useAuthStore } from '~/stores/auth';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  catalog: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { name } = useIdentity(props.catalog);

const handleCardClick = () => {
    emit('view', props.catalog);
};
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2 text-xs">
        <i class="pi pi-book opacity-50"></i>
        <span class="font-medium">{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <div @click="handleCardClick" class="flex items-center justify-between gap-4 p-2 border rounded-lg cursor-pointer hover:border-primary transition-colors">
        <div class="flex items-center gap-2">
          <i class="pi pi-book text-xs opacity-50"></i>
          <span class="font-bold text-sm">{{ name }}</span>
        </div>
        <small class="text-[10px] opacity-50 uppercase font-bold">{{ catalog.material }}</small>
      </div>
    </template>

    <template v-else-if="variant === 'card'">
      <div @click="handleCardClick" class="p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl cursor-pointer hover:border-primary transition-all group flex flex-col gap-3 h-full">
        <div class="flex justify-between items-start">
          <span class="font-bold text-sm">{{ name }}</span>
          <span class="text-[10px] uppercase font-bold opacity-50">{{ catalog.material }}</span>
        </div>
        
        <div class="flex flex-col gap-2 flex-1 text-xs">
            <div class="flex justify-between items-center">
                <span class="opacity-60">{{ $t('catalog.colorsAvailable') }}</span>
                <span class="font-bold">{{ catalog.summary?.colorCount || 0 }}</span>
            </div>
        </div>

        <div class="flex justify-end gap-1 pt-2 border-t border-surface-100 dark:border-surface-800 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
            <Button v-if="authStore.can('catalogs', 'edit')" icon="pi pi-pencil" text rounded size="small" @click="$emit('edit', catalog)" />
            <Button v-if="authStore.can('catalogs', 'delete')" icon="pi pi-trash" text rounded severity="danger" size="small" @click="$emit('delete', catalog)" />
        </div>
      </div>
    </template>
  </div>
</template>
