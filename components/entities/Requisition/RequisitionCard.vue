<script setup>
/**
 * RequisitionCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { useAuthStore } from '~/stores/auth';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const REQUISITION_FIELDS = [
    { path: 'data.items.length', i18n: 'requisition.items' },
    { path: 'data.totalPrice', i18n: 'common.subtotal', prefix: '$' }
];

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
        <DataBlock :entity="requisition" :fields="REQUISITION_FIELDS" />
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
