<template>
    <div
        v-if="visible"
        data-testid="offline-outbox-badge"
        class="fixed left-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-8 z-[997]"
    >
        <Button
            size="small"
            :severity="failedCount ? 'danger' : (online ? 'secondary' : 'warn')"
            outlined
            :aria-label="label"
            @click="togglePanel"
        >
            <i :class="['pi mr-1', icon]" />
            <span>{{ label }}</span>
        </Button>
        <Popover ref="panel">
            <div class="flex w-80 max-h-72 flex-col gap-2 overflow-auto">
                <div
                    v-for="op in outbox.operations"
                    :key="op.id"
                    class="flex flex-col gap-1 rounded-ui bg-subtle p-2 text-body"
                >
                    <div class="flex items-center justify-between gap-2">
                        <span class="truncate text-label">{{ op.method }} {{ shortPath(op.url) }}</span>
                        <i
                            :class="['pi', op.status === 'failed' ? 'pi-exclamation-circle text-status-danger' : 'pi-cloud-upload']"
                            :title="op.status === 'failed' ? (op.lastError || '') : t('outbox.pending')"
                        />
                    </div>
                    <div v-if="op.status === 'failed'" class="text-supporting text-status-danger truncate">{{ op.lastError }}</div>
                    <div class="flex justify-end gap-1">
                        <Button
                            v-if="op.status === 'failed'"
                            size="small"
                            text
                            :label="t('outbox.retry')"
                            @click="outbox.retry(op.id)"
                        />
                        <Button
                            size="small"
                            text
                            severity="danger"
                            :label="t('outbox.discard')"
                            @click="outbox.discard(op.id)"
                        />
                    </div>
                </div>
            </div>
        </Popover>
    </div>
</template>

<script setup>
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import Button from 'primevue/button'
    import Popover from 'primevue/popover'
    import { useOutboxStore } from '~/stores/outbox'

    const { t } = useI18n()
    const outbox = useOutboxStore()
    const panel = ref()

    const pendingCount = computed(() => outbox.pendingOperations.length)
    const failedCount = computed(() => outbox.failedOperations.length)
    const online = computed(() => outbox.online)

    const visible = computed(() => !online.value || outbox.syncing || pendingCount.value > 0 || failedCount.value > 0)

    const label = computed(() => {
        if (outbox.syncing) return t('outbox.syncing')
        if (!online.value) return t('outbox.offline')
        if (failedCount.value) return t('outbox.failed', { count: failedCount.value })
        return t('outbox.pending', { count: pendingCount.value })
    })

    const icon = computed(() => {
        if (outbox.syncing) return 'pi-spin pi-spinner'
        if (!online.value) return 'pi-cloud-lock'
        return failedCount.value ? 'pi-exclamation-triangle' : 'pi-cloud-upload'
    })

    const shortPath = (url = '') => url.replace(/^\/api\//, '')

    const togglePanel = (event) => panel.value?.toggle(event)
</script>
