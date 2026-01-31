<script setup>
/**
 * Project View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import { useAuthStore } from '~/stores/auth';
import { useIdentity } from '~/composables/useBlocks';
import EntityStatus from '../shared/EntityStatus.vue';
import LineageBreadcrumbs from '../shared/LineageBreadcrumbs.vue';

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
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-folder"></i>
        <span>{{ name }}</span>
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card @click="handleCardClick">
        <template #content>
            <div class="flex items-center justify-between gap-4">
                <div class="flex flex-col flex-1">
                    <span>{{ name }}</span>
                    <small>{{ slug }}</small>
                </div>
                <EntityStatus :entity="project" variant="inline" />
            </div>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick">
        <template #header>
            <LineageBreadcrumbs v-if="project.lineage" :lineage="project.lineage" />
        </template>
        <template #title>
            <div class="flex justify-between items-center">
                <span>{{ name }}</span>
                <EntityStatus :entity="project" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ slug }}</small>
        </template>
        <template #content>
            <Divider />
            <div class="grid grid-cols-2">
                <div class="flex flex-col">
                    <small>Queues</small>
                    <span>{{ project.summary?.queueCount || 0 }}</span>
                </div>
                <div class="flex flex-col">
                    <small>Total Area</small>
                    <span>{{ project.summary?.totalArea || 0 }} m²</span>
                </div>
            </div>
        </template>
        <template #footer>
            <Divider />
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('projects', 'edit')" icon="pi pi-pencil" text @click="$emit('edit', project)" />
                <Button v-if="authStore.can('projects', 'delete')" icon="pi pi-trash" text severity="danger" @click="$emit('delete', project)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>
