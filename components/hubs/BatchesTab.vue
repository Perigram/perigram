<template>
  <div class="flex flex-col gap-8">
    <div class="flex justify-between items-center">
      <div class="flex flex-col">
        <h2 class="m-0">{{ $t('piles.title') }}</h2>
        <small>{{ $t('piles.subtitle') }}</small>
      </div>
      <Button v-if="authStore.isManufacturer" :label="$t('common.create')" icon="pi pi-plus" @click="$emit('create')" />
    </div>

    <div class="grid-hub">
        <PileCard 
            v-for="pile in batches" 
            :key="pile._id" 
            :pile="pile" 
            variant="card"
            @view="viewDetails"
        />
    </div>
    
    <div v-if="!loading && batches.length === 0" class="flex flex-col items-center py-20">
        <i class="pi pi-database text-4xl"></i>
        <p>{{ $t('piles.noPiles') }}</p>
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from '~/stores/auth';
import PileCard from '~/components/entities/MaterialPile/PileCard.vue';

const props = defineProps({
    batches: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'create']);
const authStore = useAuthStore();

const viewDetails = (pile) => emit('view', pile);
</script>
