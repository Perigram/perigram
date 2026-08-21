<template>
    <div class="h-full min-h-0 overflow-hidden">
        <!-- Current queue editor -->
        <div v-if="currentQueue" class="h-full min-h-0">
            <QueueEditor
                :queue="currentQueue"
                :queues="queues"
                :project-slug="slug"
                @updated="refreshQueues"
                @select-queue="currentQueueId = $event"
                @create-queue="createNewQueue"
                @queue-deleted="handleQueueDeleted"
            />
        </div>

        <!-- Empty state -->
        <div v-else-if="queues.length === 0" class="flex h-full min-h-0 items-center justify-center p-4">
            <StateBlock :message="$t(canCreateQueue ? 'queue.empty' : 'queue.readOnlyEmpty')" icon="pi pi-inbox">
                <template v-if="canCreateQueue" #actions>
                    <Button
                        :label="$t('queue.createFirst')"
                        icon="pi pi-plus"
                        @click="createNewQueue"
                        size="large"
                    />
                </template>
            </StateBlock>
        </div>
    </div>
</template>

<script setup>
    import { ref, computed, watch, onMounted } from 'vue'
    import { useRoute } from 'vue-router'
    import { useQueuesStore } from '~/stores/queues'
    import { useAuthStore } from '~/stores/auth'
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
    const authStore = useAuthStore()
    const { queues } = storeToRefs(queuesStore)
    const currentQueueId = ref(null)
    const currentQueue = computed(() => queues.value.find((q) => q._id === currentQueueId.value))
    const canCreateQueue = computed(() => authStore.can('queues', 'create'))

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
        if (!canCreateQueue.value) return
        const newQueue = await queuesStore.createQueue(slug, {
            name: `${t('queue.title')} ${queues.value.length + 1}`,
        })
        currentQueueId.value = newQueue._id
        await refreshQueues()
    }

    const handleQueueDeleted = async (deletedQueueId) => {
        await refreshQueues()
        if (currentQueueId.value === deletedQueueId) {
            currentQueueId.value = queues.value[queues.value.length - 1]?._id || null
        }
    }

</script>
