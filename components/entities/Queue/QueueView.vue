<script setup>
/**
 * Queue View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';
import LineageView from '../shared/LineageView.vue';
import { useAuthStore } from '~/stores/auth';

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
      <div class="flex items-center gap-2">
        <span class="opacity-50 font-bold">#{{ queue.identity?.queueNumber }}</span>
        <span class="font-bold">{{ name }}</span>
        <EntityStatus :entity="queue" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card @click="handleCardClick" class="cursor-pointer">
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <span class="opacity-30 font-black">#{{ queue.identity?.queueNumber }}</span>
              <span class="font-bold">{{ name }}</span>
            </div>
            <EntityStatus :entity="queue" variant="inline" />
          </div>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick" class="cursor-pointer">
        <template #title>
          <div class="flex flex-col gap-2">
            <LineageView v-if="queue.lineage" :lineage="queue.lineage" />
            <div class="flex justify-between items-start gap-4">
              <span class="font-bold text-lg">#{{ queue.identity?.queueNumber }} {{ name }}</span>
              <EntityStatus :entity="queue" variant="full" />
            </div>
          </div>
        </template>
        <template #content>
          <div class="flex flex-col gap-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col">
                <small class="font-bold opacity-40">Job Items</small>
                <span class="text-xl font-bold">{{ queue.job?.items?.length || 0 }}</span>
              </div>
              <div class="flex flex-col">
                <small class="font-bold opacity-40">Runs</small>
                <span class="text-xl font-bold">{{ queue.summary?.runCount || 0 }}</span>
              </div>
            </div>
          </div>
        </template>
        <template #footer>
            <div class="flex justify-end gap-1" @click.stop>
                <Button v-if="authStore.can('queues', 'edit')" icon="pi pi-pencil" text rounded @click="$emit('edit', queue)" />
                <Button v-if="authStore.can('queues', 'delete')" icon="pi pi-trash" text rounded severity="danger" @click="$emit('delete', queue)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>
