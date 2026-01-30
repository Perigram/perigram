<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <i class="pi pi-database text-xs opacity-50"></i>
        <span class="font-medium">{{ name }}</span>
        <EntityStatus :entity="pile" variant="inline" />
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <div @click="handleCardClick" class="flex items-center justify-between gap-4 p-2 border rounded-lg cursor-pointer hover:border-primary transition-colors">
        <div class="flex items-center gap-2">
          <i class="pi pi-database text-xs opacity-50"></i>
          <span class="font-bold text-sm">{{ name }}</span>
        </div>
        <EntityStatus :entity="pile" variant="inline" />
      </div>
    </template>

    <template v-else-if="variant === 'card'">
      <div @click="handleCardClick" class="p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl cursor-pointer hover:border-primary transition-all group flex flex-col gap-3 h-full">
        <div class="flex justify-between items-start">
          <div class="flex items-center gap-2">
              <i class="pi pi-database text-primary"></i>
              <span class="font-bold text-sm">{{ name }}</span>
          </div>
          <EntityStatus :entity="pile" variant="inline" />
        </div>
        
        <div class="flex flex-col gap-1 flex-1 text-xs">
            <div class="flex justify-between items-center opacity-60">
                <span>Receipt</span>
                <span class="font-mono">{{ pile.identity?.reference || '---' }}</span>
            </div>
            <div class="flex justify-between items-center" v-if="pile.status?.timestamp">
                <span class="opacity-60">Updated</span>
                <span>{{ new Date(pile.status.timestamp).toLocaleDateString() }}</span>
            </div>
        </div>

        <div class="flex justify-end gap-1 pt-2 border-t border-surface-100 dark:border-surface-800 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
            <Button 
                v-if="authStore.can('materials', 'edit')"
                icon="pi pi-pencil" text rounded size="small"
                @click="$emit('edit', pile)" 
            />
            <Button 
                v-if="authStore.can('materials', 'read')"
                icon="pi pi-search" text rounded size="small"
                @click="$emit('view', pile)" 
            />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
/**
 * Material Pile View Component - v24 Standardized
 */
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';
import { useAuthStore } from '~/stores/auth';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  pile: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { name } = useIdentity(props.pile);

const handleCardClick = () => {
    emit('view', props.pile);
};
</script>
