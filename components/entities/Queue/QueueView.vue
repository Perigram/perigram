<script setup>
/**
 * Queue View Component - v24 Standardized
 */
import EntityStatus from '../shared/EntityStatus.vue';

const props = defineProps({
  queue: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card, full
});

const { name } = useIdentity(props.queue);
const { state } = useStatus(props.queue);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline View -->
    <template v-if="variant === 'inline'">
      <span class="font-medium">#{{ queue.identity?.queueNumber }} {{ name }}</span>
      <EntityStatus :entity="queue" variant="inline" />
    </template>

    <!-- Compact View -->
    <template v-else-if="variant === 'compact'">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded bg-surface-100 flex items-center justify-center font-bold text-xs">
          #{{ queue.identity?.queueNumber }}
        </div>
        <div class="flex flex-col">
          <span class="font-bold text-sm">{{ name }}</span>
          <span class="text-[10px] text-surface-400 uppercase tracking-tight">{{ state }}</span>
        </div>
      </div>
      <i class="pi pi-chevron-right text-surface-300"></i>
    </template>

    <!-- Card View -->
    <template v-else-if="variant === 'card'">
      <div class="block-header">
        <div class="flex items-center gap-2">
          <span class="text-xs font-black px-1.5 py-0.5 rounded bg-surface-900 text-white">
            #{{ queue.identity?.queueNumber }}
          </span>
          <span class="font-bold text-surface-800">{{ name }}</span>
        </div>
        <EntityStatus :entity="queue" variant="inline" />
      </div>

      <div class="my-4 flex flex-col gap-2">
        <div class="flex justify-between text-xs">
          <span class="text-surface-500">Items to Cut</span>
          <span class="font-bold">{{ queue.job?.items?.length || 0 }}</span>
        </div>
        <div class="flex justify-between text-xs">
          <span class="text-surface-500">Material Sources</span>
          <span class="font-bold">{{ queue.job?.materialPool?.length || 0 }}</span>
        </div>
      </div>

      <div class="mt-auto pt-4 border-t flex gap-2">
        <Button label="Nesting" icon="pi pi-box" size="small" outlined class="flex-1" />
        <Button icon="pi pi-ellipsis-v" size="small" text plain />
      </div>
    </template>

    <!-- Full View -->
    <template v-else-if="variant === 'full'">
      <div class="flex items-center justify-between mb-8">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-surface-900 text-white flex items-center justify-center text-xl font-black">
            {{ queue.identity?.queueNumber }}
          </div>
          <div>
            <h2 class="text-2xl font-bold text-surface-900">{{ name }}</h2>
            <div class="lineage-crumbs mt-1">
              <span class="lineage-crumb">Project</span>
              <span class="lineage-crumb">{{ queue.lineage?.projectId }}</span>
            </div>
          </div>
        </div>
        <EntityStatus :entity="queue" variant="full" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Job List -->
        <div class="flex flex-col gap-4">
          <h3 class="text-sm font-black uppercase tracking-widest text-surface-400">Cutting Items</h3>
          <div class="flex flex-col gap-2">
            <div v-for="(item, idx) in queue.job?.items" :key="idx" class="p-3 border rounded-lg flex justify-between items-center">
              <div class="flex flex-col">
                <span class="text-sm font-bold">{{ item.id }}</span>
                <span class="text-[10px] text-surface-400 uppercase">{{ item.type }}</span>
              </div>
              <Badge :value="`x${item.quantity}`" severity="secondary" />
            </div>
          </div>
        </div>

        <!-- Material Pool -->
        <div class="flex flex-col gap-4">
          <h3 class="text-sm font-black uppercase tracking-widest text-surface-400">Material Pool</h3>
          <div class="flex flex-col gap-2">
            <div v-for="(pool, idx) in queue.job?.materialPool" :key="idx" class="p-3 border border-dashed rounded-lg flex justify-between items-center">
              <div class="flex flex-col">
                <span class="text-sm font-medium italic">{{ pool.type }}</span>
                <span v-if="pool.id" class="text-[10px] text-surface-400">{{ pool.id }}</span>
              </div>
              <i class="pi pi-database text-surface-300"></i>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
