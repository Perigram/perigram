<template>
  <div class="flex flex-col gap-8">
    <div class="flex justify-between items-center">
      <div class="flex flex-col">
        <h2 class="m-0">{{ $t('piles.title') }}</h2>
        <small>{{ $t('piles.subtitle') }}</small>
      </div>
      <Button v-if="authStore.can('materials', 'create')" :label="$t('common.create')" icon="pi pi-plus" @click="$emit('create')" />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <PileCard 
            v-for="pile in piles" 
            :key="pile._id" 
            :pile="pile" 
            variant="card"
            @view="viewDetails"
        />
    </div>
    
    <div v-if="!loading && piles.length === 0" class="flex flex-col items-center py-20 opacity-50">
        <i class="pi pi-database text-4xl mb-4"></i>
        <p>{{ $t('piles.noPiles') }}</p>
    </div>
  </div>
</template>

<script setup>
/**
 * PilesTab - v24 Standardized
 */
import Button from 'primevue/button';
import PileCard from '~/components/entities/MaterialPile/PileCard.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
    piles: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'create']);
const authStore = useAuthStore();

const viewDetails = (pile) => emit('view', pile);
</script>