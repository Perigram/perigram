<template>
    <div class="p-4">
        <!-- Batch selector and actions -->
        <div class="flex items-center gap-3 mb-4">
            <Select
                v-if="currentBatchId"
                v-model="currentBatchId"
                :options="batches"
                option-label="name"
                option-value="_id"
                :placeholder="$t('batches.selectCassette')"
                class=""
            >
                <template #value="slotProps">
                    <div class="flex items-center gap-2">
                        <span>
                            {{ currentBatch.name }}
                        </span>
                        <Tag
                            :value="currentBatch.status"
                            severity="info"
                            class="ml-2"
                        />
                    </div>
                </template>
                <template #option="slotProps">
                    <div class="flex items-center gap-2">
                        <span>
                            {{ slotProps.option.name }}
                        </span>
                        <Tag
                            :value="slotProps.option.status"
                            severity="info"
                            class="ml-2"
                        />
                    </div>
                </template>
            </Select>
            <Button
                :label="$t('batch.create')"
                icon="pi pi-plus"
                @click="createNewBatch"
            />
        </div>

        <!-- Current batch editor -->
        <BatchEditor
            v-if="currentBatch"
            :batch="currentBatch"
            @saved="refreshBatches"
        />

        <!-- Empty state -->
        <div
            v-if="!currentBatch && batches.length === 0"
            class="text-center p-10"
        >
            <p>{{ $t('batch.empty') }}</p>
            <Button
                :label="$t('batch.createFirst')"
                icon="pi pi-plus"
                @click="createNewBatch"
                class="mt-4"
            />
        </div>
    </div>
</template>

<script setup>
    import { ref, computed, watch, onMounted } from 'vue'
    import { useRoute } from 'vue-router'
    import { useBatchesStore } from '~/stores/batches'
    import { storeToRefs } from 'pinia'
    import BatchEditor from '~/components/BatchEditor.vue'
    import Button from 'primevue/button'
    import Select from 'primevue/select'

    definePageMeta({
        layout: 'app',
        middleware: 'auth',
    })

    const { t } = useI18n()
    const route = useRoute()
    const slug = route.params.slug

    const batchesStore = useBatchesStore()
    const { batches } = storeToRefs(batchesStore)
    const currentBatchId = ref(null)
    const currentBatch = computed(() => batches.value.find((b) => b._id === currentBatchId.value))

    watch(currentBatchId, async (newId) => {
        if (newId) {
            // Fetch full batch details if needed
            const fullBatch = await batchesStore.getBatch(newId)
            if (fullBatch) {
                // Update in store
                await refreshBatches()
            }
        }
    })

    onMounted(async () => {
        await refreshBatches()
        // Auto-select first batch if exists
        if (batches.value.length > 0) {
	//last batch
            currentBatchId.value = batches.value[batches.value.length - 1]._id
        }
    })

    const refreshBatches = async () => {
        await batchesStore.fetchBatches(slug)
    }

    const createNewBatch = async () => {
        const newBatch = await batchesStore.createBatch(slug, {
            name: `${t('batch.title')} ${batches.value.length + 1}`,
        })
        currentBatchId.value = newBatch._id
        await refreshBatches()
    }
</script>

