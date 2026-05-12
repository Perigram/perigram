<script setup>
/**
 * RequisitionCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { useAuthStore } from '~/stores/auth';
import EntityCard from '~/components/shared/EntityCard.vue';

const props = defineProps({
  requisition: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = () => {
    emit('view', props.requisition);
};
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="requisition" entity-type="requisition" :variant="variant">
      <template v-if="variant === 'card'">
        <Divider />
        <div class="flex justify-between items-center">
            <small>{{ $t('requisition.items') }}</small>
            <span>{{ requisition.data?.items?.length || 0 }}</span>
        </div>
      </template>
      <template #footer v-if="variant === 'card'">
        <div class="flex justify-end gap-2" @click.stop>
            <Button v-if="authStore.can('requisitions', 'edit')" icon="pi pi-pencil" text rounded size="small" @click="emit('edit', requisition)" />
            <Button v-if="authStore.can('requisitions', 'delete')" icon="pi pi-trash" text rounded size="small" severity="danger" @click="emit('delete', requisition)" />
        </div>
      </template>
    </EntityCard>
  </div>
</template>
