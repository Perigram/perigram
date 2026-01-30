<script setup>
/**
 * Project View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';
import LineageBreadcrumbs from '../shared/LineageBreadcrumbs.vue';
import { useAuthStore } from '~/stores/auth';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  project: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { name, slug } = useIdentity(props.project);

const handleCardClick = () => {
    emit('view', props.project);
};
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2 text-xs">
        <NuxtLink :to="`/project/${slug}`" class="font-bold text-primary">{{ name }}</NuxtLink>
        <EntityStatus :entity="project" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <div @click="handleCardClick" class="flex items-center justify-between gap-4 p-2 border rounded-lg cursor-pointer hover:border-primary transition-colors">
        <div class="flex flex-col">
          <span class="font-bold text-sm">{{ name }}</span>
          <small class="text-[10px] opacity-50 uppercase font-mono">{{ slug }}</small>
        </div>
        <EntityStatus :entity="project" variant="inline" />
      </div>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <div @click="handleCardClick" class="p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl cursor-pointer hover:border-primary transition-all group flex flex-col gap-3 h-full">
        <div class="flex flex-col gap-1">
          <LineageBreadcrumbs v-if="project.lineage" :lineage="project.lineage" class="scale-75 origin-left" />
          <div class="flex justify-between items-start gap-4 mt-1">
            <div class="flex flex-col">
                <span class="font-bold text-sm">{{ name }}</span>
                <span class="text-[10px] font-mono opacity-40 uppercase">{{ slug }}</span>
            </div>
            <EntityStatus :entity="project" variant="inline" />
          </div>
        </div>
        
        <div class="flex-1 grid grid-cols-2 gap-4 border-t border-surface-50 dark:border-surface-800 pt-3 text-xs">
            <div class="flex flex-col">
                <span class="opacity-50 uppercase font-bold text-[10px]">{{ $t('project.queues') }}</span>
                <span class="font-bold">{{ project.summary?.queueCount || 0 }}</span>
            </div>
            <div class="flex flex-col text-right">
                <span class="opacity-50 uppercase font-bold text-[10px]">{{ $t('results.area') }}</span>
                <span class="font-bold">{{ project.summary?.totalArea || 0 }} m²</span>
            </div>
        </div>

        <div class="flex justify-end gap-1 pt-2 border-t border-surface-50 dark:border-surface-800 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
            <Button v-if="authStore.can('projects', 'edit')" icon="pi pi-pencil" text rounded size="small" @click="$emit('edit', project)" />
            <Button v-if="authStore.can('projects', 'delete')" icon="pi pi-trash" text rounded severity="danger" size="small" @click="$emit('delete', project)" />
        </div>
      </div>
    </template>
  </div>
</template>