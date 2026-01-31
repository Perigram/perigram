<template>
    <Tag severity="info">
        <div class="flex items-center gap-2">
            <i class="pi pi-wallet"></i>
            <span>{{ $t('profile.balance') }}: {{ credits }}</span>
        </div>
    </Tag>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, unref } from 'vue'
import Tag from 'primevue/tag'

const credits = ref(0)
const eventSource = ref(null)

onMounted(() => {
    eventSource.value = new EventSource('/api/user/balance')

    unref(eventSource).onmessage = (event) => {
        try {
            const parsed = JSON.parse(event.data)
            if (parsed.type === 'initial' || parsed.type === 'newBalance') {
                credits.value = parsed.data.balance
            }
        } catch (e) {
            console.error('Error parsing SSE message:', e)
        }
    }

    unref(eventSource).onerror = (err) => {
        console.error('SSE connection error:', err)
    }
})

onBeforeUnmount(() => {
    if (unref(eventSource)) {
        unref(eventSource).close()
    }
})
</script>

<style scoped>
</style>
