<template>
    <div class="flex flex-col gap-6 py-4">
        <!-- New Queue Action (Mobile/Top) -->
        <div class="flex justify-end px-1" v-if="queues.length > 0">
            <div class="flex flex-wrap justify-end gap-2">
                <Button
                    :label="$t('nesting.manageWarehouseStock')"
                    icon="pi pi-building"
                    size="small"
                    text
                    @click="goToWarehouses"
                />
                <Button
                    :label="$t('queue.create')"
                    icon="pi pi-plus"
                    size="small"
                    text
                    @click="createNewQueue"
                />
            </div>
        </div>

        <!-- Current queue editor -->
        <div v-if="currentQueue" class="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <QueueEditor
                :queue="currentQueue"
                :queues="queues"
                :project-slug="slug"
                @updated="refreshQueues"
                @select-queue="currentQueueId = $event"
            />
        </div>

        <!-- Empty state -->
        <StateBlock v-else-if="queues.length === 0" :message="$t('queue.empty')" icon="pi pi-inbox">
            <template #actions>
                <Button
                    :label="$t('queue.createFirst')"
                    icon="pi pi-plus"
                    @click="createNewQueue"
                    size="large"
                />
                <Button
                    :label="$t('nesting.manageWarehouseStock')"
                    icon="pi pi-building"
                    severity="secondary"
                    outlined
                    @click="goToWarehouses"
                    size="large"
                />
            </template>
        </StateBlock>
    </div>
</template>

<script setup>
    import { ref, computed, watch, onMounted } from 'vue'
    import { useRoute } from 'vue-router'
    import { useQueuesStore } from '~/stores/queues'
    import { storeToRefs } from 'pinia'
    import QueueEditor from '~/components/QueueEditor.vue'
    import Button from 'primevue/button'
    import StateBlock from '~/components/shared/StateBlock.vue'

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

    const goToWarehouses = () => navigateTo('/warehouses')
</script>
