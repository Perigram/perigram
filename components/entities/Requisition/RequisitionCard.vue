<script setup>
/**
 * RequisitionCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
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
const { t } = useI18n();

const handleCardClick = () => {
    emit('view', props.requisition);
};

const statusActions = computed(() => {
    if (!authStore.can('requisitions', 'delete')) return [];
    return [{
        label: t('common.delete'),
        icon: 'pi pi-trash',
        severity: 'danger',
        display: 'menu',
        command: () => emit('delete', props.requisition)
    }];
});
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="requisition" entity-type="requisition" :variant="variant" :status-actions="statusActions">
      <template v-if="variant === 'card'">
        <Divider />
        <DataBlock :entity="requisition" :fields="REQUISITION_FIELDS" />
      </template>
      <template #footer v-if="variant === 'card'">
        <div class="flex justify-end gap-2" @click.stop>
            <Button v-if="authStore.can('requisitions', 'edit')" icon="pi pi-pencil" text rounded size="small" @click="emit('edit', requisition)" />
        </div>
      </template>
    </EntityCard>
  </div>
</template>
