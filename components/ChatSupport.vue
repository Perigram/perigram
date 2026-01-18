<template>
    <div class="fixed bottom-0 right-0 z-[1000] flex justify-end items-end p-4 md:p-6 pointer-events-none">
        <div 
            v-if="supportDialog"
            class="w-full sm:w-[400px] h-[500px] max-h-[80vh] bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto animate-in slide-in-from-bottom-4 duration-300"
        >
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b border-[var(--p-content-border-color)] bg-[var(--p-content-background)]">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-[var(--p-primary-color)] flex items-center justify-center text-[var(--p-primary-contrast-color)]">
                        <i class="pi pi-comment text-sm"></i>
                    </div>
                    <h2 class="m-0 text-base font-bold text-[var(--p-text-color)]">{{ $t('support.chatTitle') }}</h2>
                </div>
                <Button
                    icon="pi pi-times"
                    severity="secondary"
                    text
                    rounded
                    size="small"
                    @click="supportDialog = false"
                />
            </div>

            <!-- Messages -->
            <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[var(--p-surface-50)] custom-scrollbar">
                <template
                    v-for="message in messagesList"
                    :key="message._id"
                >
                    <!-- Date Separator -->
                    <div v-if="message.day" class="flex items-center gap-4 my-2">
                        <div class="flex-1 h-px bg-[var(--p-content-border-color)]"></div>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-[var(--p-text-muted-color)] bg-[var(--p-content-background)] px-2 py-0.5 rounded-full border border-[var(--p-content-border-color)]">
                            {{ message.day }}
                        </span>
                        <div class="flex-1 h-px bg-[var(--p-content-border-color)]"></div>
                    </div>

                    <!-- Message Bubble -->
                    <div 
                        class="max-w-[85%] flex flex-col gap-1"
                        :class="message.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'"
                    >
                        <div 
                            class="px-4 py-2 rounded-2xl text-sm shadow-sm"
                            :class="message.sender === 'user' 
                                ? 'bg-[var(--p-primary-color)] text-[var(--p-primary-contrast-color)] rounded-tr-none' 
                                : 'bg-[var(--p-content-background)] text-[var(--p-text-color)] border border-[var(--p-content-border-color)] rounded-tl-none'"
                        >
                            <p class="m-0 leading-relaxed break-words">{{ message.message }}</p>
                        </div>
                        <span class="text-[10px] text-[var(--p-text-muted-color)] px-1">{{ formatTime(message.timestamp) }}</span>
                    </div>
                </template>
            </div>

            <!-- Input Area -->
            <div class="p-4 border-t border-[var(--p-content-border-color)] bg-[var(--p-content-background)]">
                <div class="flex items-end gap-2 bg-[var(--p-surface-50)] p-2 rounded-xl border border-[var(--p-content-border-color)] focus-within:border-[var(--p-primary-color)] transition-colors">
                    <Textarea
                        :placeholder="$t('support.typeMessage')"
                        class="flex-1 !bg-transparent !border-none !shadow-none !ring-0 text-sm py-1 custom-scrollbar"
                        v-model="message"
                        @keydown="handleKeyDown"
                        rows="1"
                        autoResize
                    />
                    <Button
                        icon="pi pi-send"
                        @click="sendMessage"
                        :disabled="!message.trim() || isLoading"
                        rounded
                        size="small"
                        class="flex-shrink-0"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, unref, computed, nextTick } from 'vue'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import { useSupportDialog } from '~/composables/useModalState'

const supportDialog = useSupportDialog()

const message = ref('')
const messages = ref([])
const isLoading = ref(false)
const eventSource = ref(null)
const messagesContainer = ref(null)

const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendMessage()
    }
}

const sendMessage = async () => {
    if (!message.value.trim()) return
    
    isLoading.value = true

    try {
        await $fetch('/api/support/messages', {
            method: 'POST',
            body: { message: message.value }
        })
        message.value = ''
    } catch (error) {
        console.error('Failed to send message:', error)
    } finally {
        isLoading.value = false
    }
}

onMounted(() => {
    eventSource.value = new EventSource('/api/support/messages')

    unref(eventSource).onmessage = async (event) => {
        try {
            const parsed = JSON.parse(event.data)
            if (parsed.type === 'initial') {
                messages.value = parsed.data
            } else if (parsed.type === 'newMessages') {
                messages.value.push(...parsed.data)
            }
        } catch (e) {
            console.error('Error parsing SSE message:', e)
        } finally {
            await nextTick()
            scrollToBottom()
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

const formatTime = (timestamp, withoutTime) => {
    const date = new Date(timestamp)
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return withoutTime ? date.toLocaleDateString() : `${time}`
}
const messagesList = computed(() => {
    const usedDates = []
    const getDay = (timestamp) => {
        const date = new Date(timestamp)
        const dateStr = date.toLocaleDateString()
        if(usedDates.includes(dateStr)) {
            return
        }
        usedDates.push(dateStr)
        return dateStr
    }
    return messages.value.map(message => {
        return {
            ...message,
            day: getDay(message.timestamp)
        }
    })
})
const scrollToBottom = async () => {
    await nextTick()

    if (messagesContainer.value) {
        const element = messagesContainer.value
        element.scrollTo({
            top: element.scrollHeight,
            behavior: 'smooth'
        })
    }
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--p-content-border-color);
    border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--p-primary-color);
}
</style>

