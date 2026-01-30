<script setup>
/**
 * Queue View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';
import LineageBreadcrumbs from '../shared/LineageBreadcrumbs.vue';
import { useAuthStore } from '~/stores/auth';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  queue: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { name } = useIdentity(props.queue);

const handleCardClick = () => {
    emit('view', props.queue);
};
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2 text-xs">
        <span class="opacity-50 font-bold">#{{ queue.identity?.queueNumber }}</span>
        <span class="font-medium">{{ name }}</span>
        <EntityStatus :entity="queue" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <div @click="handleCardClick" class="flex items-center justify-between gap-4 p-2 border rounded-lg cursor-pointer hover:border-primary transition-colors">
        <div class="flex items-center gap-2">
          <span class="opacity-30 font-bold text-xs">#{{ queue.identity?.queueNumber }}</span>
          <span class="font-bold text-sm">{{ name }}</span>
        </div>
        <EntityStatus :entity="queue" variant="inline" />
      </div>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <div @click="handleCardClick" class="p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl cursor-pointer hover:border-primary transition-all group flex flex-col gap-3 h-full">
        <div class="flex flex-col gap-1">
          <LineageBreadcrumbs v-if="queue.lineage" :lineage="queue.lineage" class="scale-75 origin-left" />
          <div class="flex justify-between items-start gap-4 mt-1">
            <span class="font-bold text-sm">#{{ queue.identity?.queueNumber }} {{ name }}</span>
            <EntityStatus :entity="queue" variant="inline" />
          </div>
        </div>
        
        <div class="flex-1 grid grid-cols-2 gap-4 border-t border-surface-50 dark:border-surface-800 pt-3">
          <div class="flex flex-col gap-0.5">
            <small class="font-bold opacity-40 uppercase text-[10px]">{{ $t('queue.jobItems') }}</small>
            <span class="text-lg font-black tracking-tight">{{ queue.job?.items?.length || 0 }}</span>
          </div>
          <div class="flex flex-col gap-0.5 text-right">
            <small class="font-bold opacity-40 uppercase text-[10px]">{{ $t('queue.runs') }}</small>
            <span class="text-lg font-black tracking-tight">{{ queue.summary?.runCount || 0 }}</span>
          </div>
        </div>

        <div class="flex justify-end gap-1 pt-2 border-t border-surface-50 dark:border-surface-800 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
            <Button v-if="authStore.can('queues', 'edit')" icon="pi pi-pencil" text rounded size="small" @click="$emit('edit', queue)" />
            <Button v-if="authStore.can('queues', 'delete')" icon="pi pi-trash" text rounded severity="danger" size="small" @click="$emit('delete', queue)" />
        </div>
      </div>
    </template>
  </div>
</template>
