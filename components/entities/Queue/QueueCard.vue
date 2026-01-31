<script setup>
/**
 * Queue View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import { useAuthStore } from '~/stores/auth';
import { useIdentity } from '~/composables/useBlocks';
import EntityStatus from '../shared/EntityStatus.vue';
import LineageBreadcrumbs from '../shared/LineageBreadcrumbs.vue';

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
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-list"></i>
        <span>{{ name }}</span>
        <EntityStatus :entity="queue" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card @click="handleCardClick">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <small>#{{ queue.identity?.queueNumber }}</small>
                    <span>{{ name }}</span>
                </div>
                <EntityStatus :entity="queue" variant="inline" />
            </div>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick">
        <template #header>
            <div class="p-2">
                <LineageBreadcrumbs v-if="queue.lineage" :lineage="queue.lineage" />
            </div>
        </template>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <div class="flex flex-col">
                    <small>#{{ queue.identity?.queueNumber }}</small>
                    <span>{{ name }}</span>
                </div>
                <EntityStatus :entity="queue" variant="inline" />
            </div>
        </template>
        <template #content>
            <Divider />
            <div class="grid grid-cols-2">
                <div class="flex flex-col">
                    <small>Job Items</small>
                    <span>{{ queue.job?.items?.length || 0 }}</span>
                </div>
                <div class="flex flex-col">
                    <small>Nesting Runs</small>
                    <span>{{ queue.summary?.runCount || 0 }}</span>
                </div>
            </div>
        </template>
        <template #footer>
            <Divider />
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('queues', 'edit')" icon="pi pi-pencil" text @click="$emit('edit', queue)" />
                <Button v-if="authStore.can('queues', 'delete')" icon="pi pi-trash" text severity="danger" @click="$emit('delete', queue)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>