<script setup>
/**
 * Requisition View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';
import { useAuthStore } from '~/stores/auth';
import { useIdentity, useStatus } from '~/composables/useBlocks';

const props = defineProps({
  requisition: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { name } = useIdentity(props.requisition);
const { state } = useStatus(props.requisition);

const handleCardClick = () => {
    emit('view', props.requisition);
};
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2 text-xs">
        <i class="pi pi-shopping-cart opacity-50"></i>
        <span class="font-medium">{{ name }}</span>
        <EntityStatus :entity="requisition" variant="inline" />
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <div @click="handleCardClick" class="flex items-center justify-between gap-4 p-2 border rounded-lg cursor-pointer hover:border-primary transition-colors">
        <div class="flex items-center gap-2">
          <i class="pi pi-shopping-cart text-xs opacity-50"></i>
          <span class="font-bold text-sm">{{ name }}</span>
        </div>
        <EntityStatus :entity="requisition" variant="inline" />
      </div>
    </template>

    <template v-else-if="variant === 'card'">
      <div @click="handleCardClick" class="p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl cursor-pointer hover:border-primary transition-all group flex flex-col gap-3 h-full">
        <div class="flex justify-between items-start">
          <div class="flex items-center gap-2">
              <i class="pi pi-shopping-cart text-primary"></i>
              <span class="font-bold text-sm uppercase tracking-tight">{{ name }}</span>
          </div>
          <EntityStatus :entity="requisition" variant="inline" />
        </div>
        
        <div class="flex flex-col gap-1.5 flex-1 text-xs">
            <div class="flex justify-between items-center opacity-60">
                <span>Items</span>
                <span class="font-bold">{{ requisition.items?.length || 0 }}</span>
            </div>
            <div class="flex justify-between items-center" v-if="requisition.status?.timestamp">
                <span class="opacity-60">Updated</span>
                <span>{{ new Date(requisition.status.timestamp).toLocaleDateString() }}</span>
            </div>
        </div>

        <div class="flex justify-end gap-1 pt-2 border-t border-surface-100 dark:border-surface-800 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
            <Button 
                v-if="state === 'DRAFT' && authStore.can('requisitions', 'edit')"
                icon="pi pi-pencil" text rounded size="small"
                @click="$emit('edit', requisition)" 
            />
            <Button 
                v-if="state === 'DRAFT' && authStore.can('requisitions', 'delete')"
                icon="pi pi-trash" text rounded severity="danger" size="small"
                @click="$emit('delete', requisition)" 
            />
            <Button 
                v-if="authStore.can('requisitions', 'read')"
                icon="pi pi-cog" text rounded size="small"
                @click="$emit('view', requisition)" 
            />
        </div>
      </div>
    </template>
  </div>
</template>
