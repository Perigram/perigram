<script setup>
/**
 * ProjectCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { useAuthStore } from '~/stores/auth';
import EntityCard from '~/components/shared/EntityCard.vue';

const props = defineProps({
  project: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = () => {
    emit('view', props.project);
};
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="project" entity-type="project" :variant="variant">
        <!-- Card body -->
        <template v-if="variant === 'card'">
            <Divider />
            <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col">
                    <small class="text-muted-color">Queues</small>
                    <span class="font-semibold">{{ project.summary?.queueCount || 0 }}</span>
                </div>
                <div class="flex flex-col">
                    <small class="text-muted-color">Total Area</small>
                    <span class="font-semibold">{{ project.summary?.totalArea || 0 }} m²</span>
                </div>
            </div>
        </template>

        <!-- Card footer -->
        <template #footer v-if="variant === 'card'">
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('projects', 'edit')" icon="pi pi-pencil" text rounded size="small" aria-label="Edit" @click="$emit('edit', project)" />
                <Button v-if="authStore.can('projects', 'delete')" icon="pi pi-trash" text rounded size="small" severity="danger" aria-label="Delete" @click="$emit('delete', project)" />
            </div>
        </template>
    </EntityCard>
  </div>
</template>
