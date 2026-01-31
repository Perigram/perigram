<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-col">
      <h2 class="m-0">{{ $t('remnants.title') }}</h2>
      <small>{{ $t('remnants.subtitle') }}</small>
    </div>

    <div class="grid-hub">
        <RemnantCard 
            v-for="remnant in remnants" 
            :key="remnant._id" 
            :remnant="remnant" 
            variant="card"
            @click="viewDetails(remnant)"
        />
    </div>

    <div v-if="!loading && remnants.length === 0" class="flex flex-col items-center py-20">
        <i class="pi pi-box text-4xl"></i>
        <p>{{ $t('remnants.noRemnants') }}</p>
    </div>
  </div>
</template>

<script setup>
import RemnantCard from '~/components/entities/Remnant/RemnantCard.vue';

const props = defineProps({
    remnants: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view']);
const viewDetails = (rem) => emit('view', rem);
</script>