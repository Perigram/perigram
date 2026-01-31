<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-col">
      <h2 class="m-0">{{ $t('sheets.title') }}</h2>
      <small>{{ $t('sheets.subtitle') }}</small>
    </div>

    <div class="grid-hub">
        <SheetCard 
            v-for="sheet in sheets" 
            :key="sheet._id" 
            :sheet="sheet" 
            variant="card"
            @click="viewDetails(sheet)"
        />
    </div>

    <div v-if="!loading && sheets.length === 0" class="flex flex-col items-center py-20">
        <i class="pi pi-file text-4xl"></i>
        <p>{{ $t('sheets.noSheets') }}</p>
    </div>
  </div>
</template>

<script setup>
import SheetCard from '~/components/entities/Sheet/SheetCard.vue';

const props = defineProps({
    sheets: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view']);
const viewDetails = (sh) => emit('view', sh);
</script>
