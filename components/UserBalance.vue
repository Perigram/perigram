<template>
    <Tag severity="info" class="user-balance">
        {{ $t('profile.balance') }}: {{ credits }}
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
.user-balance {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
}
</style>
