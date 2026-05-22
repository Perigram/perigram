<script setup>
/**
 * PileCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import MaterialSummary from '~/components/entities/MaterialPile/MaterialSummary.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  pile: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = () => {
    emit('view', props.pile);
};
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="pile" entity-type="material_pile" :variant="variant" :show-status="false">
      <template v-if="variant === 'card'">
        <Divider />
        <MaterialSummary :pile="pile" />
      </template>
      <template #footer v-if="variant === 'card'">
        <div class="flex justify-end gap-2" @click.stop>
            <Button v-if="authStore.can('materials', 'edit')" icon="pi pi-pencil" text rounded size="small" @click="emit('edit', pile)" />
            <Button v-if="authStore.can('materials', 'read')" icon="pi pi-search" text rounded size="small" @click="emit('view', pile)" />
        </div>
      </template>
    </EntityCard>
  </div>
</template>
