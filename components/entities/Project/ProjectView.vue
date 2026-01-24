<script setup>
/**
 * Project View Component - v24 Standardized
 */
import EntityStatus from '../shared/EntityStatus.vue';

const props = defineProps({
  project: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card, full
});

const { name, slug } = useIdentity(props.project);
const { lineage } = useLineage(props.project);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline View -->
    <template v-if="variant === 'inline'">
      <NuxtLink :to="`/project/${slug}`" class="font-bold text-primary hover:underline">
        {{ name }}
      </NuxtLink>
      <EntityStatus :entity="project" variant="inline" />
    </template>

    <!-- Compact View -->
    <template v-else-if="variant === 'compact'">
      <div class="flex flex-col">
        <span class="font-bold">{{ name }}</span>
        <span class="text-xs text-surface-500">{{ slug }}</span>
      </div>
      <EntityStatus :entity="project" variant="compact" />
    </template>

    <!-- Card View -->
    <template v-else-if="variant === 'card'">
      <div class="block-header">
        <NuxtLink :to="`/project/${slug}`" class="block-title hover:text-primary transition-colors">
          {{ name }}
        </NuxtLink>
        <EntityStatus :entity="project" variant="inline" />
      </div>
      
      <div class="flex-grow my-4">
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div class="flex flex-col">
            <span class="text-surface-400 uppercase text-[10px] font-bold tracking-wider">Queues</span>
            <span class="font-medium">{{ project.summary?.queueCount || 0 }}</span>
          </div>
          <div class="flex flex-col text-right">
            <span class="text-surface-400 uppercase text-[10px] font-bold tracking-wider">Total Area</span>
            <span class="font-medium">{{ project.summary?.totalArea?.toFixed(2) || 0 }} m²</span>
          </div>
        </div>
      </div>

      <div class="mt-auto">
        <ProgressBar :value="project.summary?.progress || 0" style="height: 6px" />
      </div>
    </template>

    <!-- Full View -->
    <template v-else-if="variant === 'full'">
      <div class="flex items-center justify-between border-b pb-6 mb-6">
        <div>
          <h1 class="text-3xl font-black text-surface-900">{{ name }}</h1>
          <p class="text-surface-500 mt-1">{{ slug }}</p>
        </div>
        <EntityStatus :entity="project" variant="full" />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <!-- Stats Sidebar -->
        <div class="col-span-1 flex flex-col gap-4">
          <div class="p-4 border rounded-xl bg-surface-50">
            <h3 class="text-xs font-bold text-surface-400 uppercase mb-3">Project Metrics</h3>
            <div class="flex flex-col gap-4">
              <div class="flex justify-between items-center">
                <span class="text-sm">Total Area</span>
                <span class="font-bold">{{ project.summary?.totalArea?.toFixed(2) }} m²</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm">Queues</span>
                <span class="font-bold">{{ project.summary?.queueCount }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Content Slot -->
        <div class="col-span-2">
          <slot />
        </div>
      </div>
    </template>
  </div>
</template>
