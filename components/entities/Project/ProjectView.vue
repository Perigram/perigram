<script setup>
/**
 * Project View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';
import LineageView from '../shared/LineageView.vue';
import { useAuthStore } from '~/stores/auth';

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
      <div class="flex items-center gap-2">
        <NuxtLink :to="`/project/${slug}`" class="font-bold">{{ name }}</NuxtLink>
        <EntityStatus :entity="project" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card @click="handleCardClick" class="cursor-pointer">
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col">
              <span class="font-bold">{{ name }}</span>
              <small>{{ slug }}</small>
            </div>
            <EntityStatus :entity="project" variant="inline" />
          </div>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick" class="cursor-pointer">
        <template #title>
          <div class="flex flex-col gap-2">
            <LineageView v-if="project.lineage" :lineage="project.lineage" />
            <div class="flex justify-between items-start">
              <span class="font-bold">{{ name }}</span>
              <EntityStatus :entity="project" variant="full" />
            </div>
          </div>
        </template>
        <template #subtitle>{{ slug }}</template>
        <template #content>
          <div class="flex flex-col gap-2">
            <div class="flex justify-between">
                <span>Queues: {{ project.summary?.queueCount || 0 }}</span>
                <span>Area: {{ project.summary?.totalArea || 0 }} m²</span>
            </div>
          </div>
        </template>
        <template #footer>
            <div class="flex justify-end gap-1" @click.stop>
                <Button v-if="authStore.can('projects', 'edit')" icon="pi pi-pencil" text rounded @click="$emit('edit', project)" />
                <Button v-if="authStore.can('projects', 'delete')" icon="pi pi-trash" text rounded severity="danger" @click="$emit('delete', project)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>