<template>
  <div class="flex flex-col gap-8">
    <ActionToolbar :title="$t('features.requisitions')" :subtitle="$t('requisition.subtitle') || 'Track material orders and fulfillment status.'">
      <template #actions>
        <Button v-if="authStore.can('requisitions', 'create')" :label="$t('common.create')" icon="pi pi-plus" @click="$emit('create')" />
      </template>
    </ActionToolbar>

    <ResponsiveGrid v-if="requisitions.length">
        <RequisitionCard 
            v-for="requisition in requisitions" 
            :key="requisition._id" 
            :requisition="requisition" 
            variant="card"
            @view="viewDetails"
            @edit="openEditDialog"
            @delete="confirmDelete"
        />
    </ResponsiveGrid>

    <StateBlock v-if="!loading && requisitions.length === 0" :message="$t('requisition.noRequisitions')" icon="pi pi-shopping-cart">
      <template #actions>
        <Button v-if="authStore.can('requisitions', 'create')" :label="$t('requisition.newRequisition')" icon="pi pi-plus" text @click="$emit('create')" />
      </template>
    </StateBlock>
  </div>
</template>

<script setup>
import { useAuthStore } from '~/stores/auth';
import RequisitionCard from '~/components/entities/Requisition/RequisitionCard.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({
    requisitions: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'edit', 'delete', 'create']);
const authStore = useAuthStore();

const viewDetails = (req) => emit('view', req);
const openEditDialog = (req) => emit('edit', req);
const confirmDelete = (req) => emit('delete', req);
</script>
