<template>
  <Button class="user-balance" severity="secondary" >
        <span class="user-balance__label">Balance:</span>
        <span class="user-balance__count">{{ credits }}</span>
  </Button>
</template>

<script setup>
import { ref } from 'vue'

import Button from 'primevue/button'

const credits = ref('')
const eventSource = ref(null)

onMounted(() => {
    eventSource.value = new EventSource('/api/user/balance')

    unref(eventSource).onmessage = (event) => {
        try {
            const parsed = JSON.parse(event.data)
            if (parsed.type === 'initial') {
                credits.value = parsed.data.balance
            } else if (parsed.type === 'newBalance') {
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

<style lang="scss" scoped>
</style>
