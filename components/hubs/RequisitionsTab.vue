<template>
  <div class="flex flex-col gap-8">
    <div class="flex justify-between items-center">
      <div class="flex flex-col">
        <h2 class="m-0">{{ $t('features.requisitions') }}</h2>
        <small>{{ $t('requisition.subtitle') || 'Track material orders and fulfillment status.' }}</small>
      </div>
      <Button v-if="authStore.can('requisitions', 'create')" :label="$t('common.create')" icon="pi pi-plus" @click="$emit('create')" />
    </div>

    <div class="grid-hub">
        <RequisitionCard 
            v-for="requisition in requisitions" 
            :key="requisition._id" 
            :requisition="requisition" 
            variant="card"
            @view="viewDetails"
            @edit="openEditDialog"
            @delete="confirmDelete"
        />
    </div>

    <div v-if="!loading && requisitions.length === 0" class="flex flex-col items-center py-20">
        <i class="pi pi-shopping-cart text-4xl"></i>
        <p>{{ $t('requisition.noRequisitions') }}</p>
        <Button v-if="authStore.can('requisitions', 'create')" :label="$t('requisition.newRequisition')" icon="pi pi-plus" text @click="$emit('create')" />
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from '~/stores/auth';
import RequisitionCard from '~/components/entities/Requisition/RequisitionCard.vue';

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
