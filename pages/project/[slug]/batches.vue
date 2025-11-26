<template>
    <div>
        <!-- Current batch being edited -->
        <BatchEditor 
            v-if="currentBatch" 
            :batch="currentBatch"
            @close="currentBatch = null"
            @saved="refreshBatches"
        />
        
        <!-- Accordion with other batches -->
        <Accordion v-if="!currentBatch && batches.length > 0" class="mt-4">
            <AccordionTab 
                v-for="batch in batches" 
                :key="batch._id"
                :header="`${batch.name || 'Batch ' + batch.batchNumber} - ${batch.status}`"
            >
                <div class="flex justify-end gap-2 mb-3">
                    <Button 
                        label="Edit"
                        icon="pi pi-pencil"
                        @click="currentBatch = batch"
                    />
                    <Button 
                        label="Delete"
                        icon="pi pi-trash"
                        severity="danger"
                        @click="deleteBatch(batch)"
                    />
                </div>
                <p>Created: {{ formatDate(batch.createdAt) }}</p>
                <p>Entries: {{ batch.entries?.length || 0 }}</p>
            </AccordionTab>
        </Accordion>
        
        <!-- Empty state -->
        <div v-if="!currentBatch && batches.length === 0" class="text-center p-10">
            <p>{{ $t('batch.empty') }}</p>
        </div>
        
        <!-- Create button -->
        <Button 
            v-if="!currentBatch"
            :label="$t('batch.create')" 
            icon="pi pi-plus" 
            @click="createNewBatch"
            class="mt-4"
        />
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { batchesStore } from '~/composables/batches';
import BatchEditor from '~/components/BatchEditor.vue';
import Button from 'primevue/button';
import Accordion from 'primevue/accordion';
import AccordionTab from 'primevue/accordiontab';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const router = useRouter();
const slug = route.params.slug;

const currentBatch = ref(null);
const batches = computed(() => batchesStore.getters.batches.value);

onMounted(async () => {
  await refreshBatches();
});

const refreshBatches = async () => {
  await batchesStore.actions.fetchBatches(slug);
  // Auto-open first batch if exists
  if (!currentBatch.value && batches.value.length > 0) {
    currentBatch.value = batches.value[0];
  }
};

const createNewBatch = async () => {
  const newBatch = await batchesStore.actions.createBatch(slug, {
    name: `Batch ${batches.value.length + 1}`
  });
  currentBatch.value = newBatch;
  await refreshBatches();
};

const deleteBatch = async (batch) => {
  if (confirm(`Delete ${batch.name}?`)) {
    await batchesStore.actions.deleteBatch(batch._id);
    await refreshBatches();
  }
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString();
};
</script>