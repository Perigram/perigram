<template>
    <div class="min-h-0 py-4">
        <!-- Current queue editor -->
        <div v-if="currentQueue" class="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <QueueEditor
                :queue="currentQueue"
                :queues="queues"
                :project-slug="slug"
                @updated="refreshQueues"
                @select-queue="currentQueueId = $event"
                @create-queue="createNewQueue"
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

</script>
