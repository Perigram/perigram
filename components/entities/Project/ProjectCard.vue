<script setup>
/**
 * ProjectCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { useAuthStore } from '~/stores/auth';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import StandardCard from '~/components/shared/StandardCard.vue';

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
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-folder"></i>
        <IdentityBlock :entity="project" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <div class="flex items-center justify-between gap-4">
            <IdentityBlock :entity="project" variant="compact" />
            <EntityStatus :entity="project" entity-type="project" variant="inline" />
        </div>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #header>
            <TraceChain :entity="project" />
        </template>
        <template #title>
            <div class="flex justify-between items-start gap-4">
                <IdentityBlock :entity="project" />
                <EntityStatus :entity="project" entity-type="project" variant="inline" />
            </div>
        </template>
        
        <Divider />
        <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col">
                <small>Queues</small>
                <span>{{ project.summary?.queueCount || 0 }}</span>
            </div>
            <div class="flex flex-col">
                <small>Total Area</small>
                <span>{{ project.summary?.totalArea || 0 }} m²</span>
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('projects', 'edit')" icon="pi pi-pencil" text rounded aria-label="Edit" @click="$emit('edit', project)" />
                <Button v-if="authStore.can('projects', 'delete')" icon="pi pi-trash" text rounded severity="danger" aria-label="Delete" @click="$emit('delete', project)" />
            </div>
        </template>
      </StandardCard>
    </template>
  </div>
</template>
