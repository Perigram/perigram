<template>
    <div class="flex flex-col gap-6 py-4">
        <!-- New Queue Action (Mobile/Top) -->
        <div class="flex justify-end px-1" v-if="queues.length > 0">
            <Button
                :label="$t('queue.create')"
                icon="pi pi-plus"
                size="small"
                text
                @click="createNewQueue"
            />
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

