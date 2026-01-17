<template>
    <div class="flex flex-col gap-6 py-4">
        <!-- Batch selector and actions -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
            <div class="flex flex-1 items-center gap-3 min-w-0">
                <Select
                    v-if="currentBatchId"
                    v-model="currentBatchId"
                    :options="batches"
                    option-label="name"
                    option-value="_id"
                    :placeholder="$t('batches.selectCassette')"
                    class="w-full sm:w-80"
                >
                    <template #value="slotProps">
                        <div v-if="currentBatch" class="flex items-center gap-3">
                            <span class="font-bold truncate">{{ currentBatch.name }}</span>
                            <Tag
                                :value="$t(`batch.batchStatus.${currentBatch.status}`)"
                                :severity="getStatusSeverity(currentBatch.status)"
                                class="text-[10px] uppercase"
                            />
                        </div>
                    </template>
                    <template #option="slotProps">
                        <div class="flex items-center justify-between w-full gap-4">
                            <span class="font-medium truncate">{{ slotProps.option.name }}</span>
                            <Tag
                                :value="$t(`batch.batchStatus.${slotProps.option.status}`)"
                                :severity="getStatusSeverity(slotProps.option.status)"
                                class="text-[9px] uppercase"
                            />
                        </div>
                    </template>
                </Select>
            </div>
            
            <Button
                :label="$t('batch.create')"
                icon="pi pi-plus"
                @click="createNewBatch"
                class="flex-shrink-0"
            />
        </div>

        <!-- Current batch editor -->
        <div v-if="currentBatch" class="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <BatchEditor
                :batch="currentBatch"
                :project-slug="slug"
                @updated="refreshBatches"
            />
        </div>

        <!-- Empty state -->
        <div
            v-else-if="batches.length === 0"
            class="text-center py-20 px-6 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)] mx-1"
        >
            <i class="pi pi-inbox text-6xl text-[var(--p-text-muted-color)] mb-4 opacity-30 block"></i>
            <p class="text-lg text-[var(--p-text-secondary-color)] mb-6">{{ $t('batch.empty') }}</p>
            <Button
                :label="$t('batch.createFirst')"
                icon="pi pi-plus"
                @click="createNewBatch"
                size="large"
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
    import Tag from 'primevue/tag'

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

    const getStatusSeverity = (status) => {
        const map = {
            'DRAFT': 'info',
            'READY': 'info',
            'NESTING': 'warning',
            'NESTED': 'success',
            'COMPLETE': 'success',
            'FAILED': 'danger'
        };
        return map[status] || 'info';
    };

    watch(currentBatchId, async (newId) => {
        if (newId) {
            await batchesStore.getBatch(newId)
        }
    })

    onMounted(async () => {
        await refreshBatches()
        if (batches.value.length > 0) {
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

