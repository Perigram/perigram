<template>
    <div class="flex flex-col gap-6 py-4">
        <!-- Queue selector and actions -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
            <div class="flex flex-1 items-center gap-3 min-w-0">
                <Select
                    v-if="currentQueueId"
                    v-model="currentQueueId"
                    :options="queues"
                    option-label="name"
                    option-value="_id"
                    :placeholder="$t('queues.selectCassette')"
                    class="w-full sm:w-80"
                >
                    <template #value="slotProps">
                        <div v-if="currentQueue" class="flex items-center gap-3">
                            <span class="font-bold truncate">{{ currentQueue.name }}</span>
                            <Tag
                                :value="$t(`queue.status.${currentQueue.status}`)"
                                :severity="getStatusSeverity(currentQueue.status)"
                                class="text-[10px] uppercase"
                            />
                        </div>
                    </template>
                    <template #option="slotProps">
                        <div class="flex items-center justify-between w-full gap-4">
                            <span class="font-medium truncate">{{ slotProps.option.name }}</span>
                            <Tag
                                :value="$t(`queue.status.${slotProps.option.status}`)"
                                :severity="getStatusSeverity(slotProps.option.status)"
                                class="text-[9px] uppercase"
                            />
                        </div>
                    </template>
                </Select>
            </div>
            
            <Button
                :label="$t('queue.create')"
                icon="pi pi-plus"
                @click="createNewQueue"
                class="flex-shrink-0"
            />
        </div>

        <!-- Current queue editor -->
        <div v-if="currentQueue" class="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <QueueEditor
                :queue="currentQueue"
                :project-slug="slug"
                @updated="refreshQueues"
            />
        </div>

        <!-- Empty state -->
        <div
            v-else-if="queues.length === 0"
            class="text-center py-20 px-6 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)] mx-1"
        >
            <i class="pi pi-inbox text-6xl text-[var(--p-text-muted-color)] mb-4 opacity-30 block"></i>
            <p class="text-lg text-[var(--p-text-secondary-color)] mb-6">{{ $t('queue.empty') }}</p>
            <Button
                :label="$t('queue.createFirst')"
                icon="pi pi-plus"
                @click="createNewQueue"
                size="large"
            />
        </div>
    </div>
</template>

<script setup>
    import { ref, computed, watch, onMounted } from 'vue'
    import { useRoute } from 'vue-router'
    import { useQueuesStore } from '~/stores/queues'
    import { storeToRefs } from 'pinia'
    import QueueEditor from '~/components/QueueEditor.vue'
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

    const queuesStore = useQueuesStore()
    const { queues } = storeToRefs(queuesStore)
    const currentQueueId = ref(null)
    const currentQueue = computed(() => queues.value.find((q) => q._id === currentQueueId.value))

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

    watch(currentQueueId, async (newId) => {
        if (newId) {
            await queuesStore.getQueue(newId)
        }
    })

    onMounted(async () => {
        await refreshQueues()
        if (queues.value.length > 0) {
            currentQueueId.value = queues.value[queues.value.length - 1]._id
        }
    })

    const refreshQueues = async () => {
        await queuesStore.fetchQueues(slug)
    }

    const createNewQueue = async () => {
        const newQueue = await queuesStore.createQueue(slug, {
            name: `${t('queue.title')} ${queues.value.length + 1}`,
        })
        currentQueueId.value = newQueue._id
        await refreshQueues()
    }
</script>

