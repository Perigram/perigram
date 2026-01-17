<template>
    <div class="flex flex-col h-full bg-[var(--p-content-background)]">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-[var(--p-content-border-color)]">
            <div class="flex flex-col">
                <h2 class="m-0 text-base font-bold text-[var(--p-text-color)]">{{ $t('admin.supportChat') }}</h2>
                <span class="text-[10px] font-black uppercase tracking-widest text-[var(--p-text-muted-color)]">{{ $t('admin.userId') }}: {{ userId.slice(-8) }}</span>
            </div>
            <Button
                icon="pi pi-arrow-left"
                @click="$emit('back')"
                text
                rounded
                class="md:hidden"
            />
        </div>

        <!-- Messages Area -->
        <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[var(--p-surface-50)] custom-scrollbar">
            <div v-if="loading" class="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                <ProgressSpinner style="width: 40px; height: 40px" strokeWidth="4" />
                <p class="text-xs font-bold uppercase tracking-widest">{{ $t('admin.loadingMessages') }}</p>
            </div>
            <div v-else-if="messages.length === 0" class="flex flex-col items-center justify-center py-20 opacity-40">
                <p class="text-sm font-medium">{{ $t('admin.noMessages') }}</p>
            </div>
            <template v-else>
                <template v-for="message in messagesList" :key="message._id">
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
                        class="max-w-[80%] flex flex-col gap-1"
                        :class="message.sender === 'support' ? 'ml-auto items-end' : 'mr-auto items-start'"
                    >
                        <div 
                            class="px-4 py-2 rounded-2xl text-sm shadow-sm"
                            :class="message.sender === 'support' 
                                ? 'bg-[var(--p-primary-color)] text-white rounded-tr-none' 
                                : 'bg-[var(--p-content-background)] text-[var(--p-text-color)] border border-[var(--p-content-border-color)] rounded-tl-none'"
                        >
                            <p class="m-0 leading-relaxed break-words">{{ message.message }}</p>
                        </div>
                        <span class="text-[10px] text-[var(--p-text-muted-color)] px-1">{{ formatTime(message.timestamp) }}</span>
                    </div>
                </template>
            </template>
        </div>

        <!-- Footer / Input Area -->
        <div class="p-4 border-t border-[var(--p-content-border-color)]">
            <div class="flex items-end gap-2 bg-[var(--p-surface-50)] p-2 rounded-xl border border-[var(--p-content-border-color)] focus-within:border-[var(--p-primary-color)] transition-colors">
                <Textarea 
                    :placeholder="$t('admin.typeMessage')" 
                    class="flex-1 !bg-transparent !border-none !shadow-none !ring-0 text-sm py-1 custom-scrollbar" 
                    v-model="newMessage"
                    @keydown="handleKeyDown" 
                    :disabled="!isConnected"
                    rows="1"
                    autoResize
                />
                <Button 
                    icon="pi pi-send"
                    :disabled="!newMessage.trim() || !isConnected" 
                    @click="sendMessage"
                    rounded
                    size="small"
                    class="flex-shrink-0"
                />
            </div>
            
            <div v-if="error" class="mt-3 flex items-center justify-between bg-red-50 p-2 rounded-lg border border-red-100">
                <span class="text-xs text-red-600 font-medium">{{ error }}</span>
                <Button :label="$t('admin.retry')" text size="small" severity="danger" class="py-1" @click="connectToChat" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import ProgressSpinner from 'primevue/progressspinner';

const { t } = useI18n();
const props = defineProps({
    userId: {
        type: String,
        required: true,
    },
});

const messages = ref([])
const newMessage = ref('')
const loading = ref(true)
const error = ref(null)
const isConnected = ref(false)
const messagesContainer = ref(null)
let eventSource = null
const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendMessage()
    }
}

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
const connectToChat = () => {
    try {
        loading.value = true
        error.value = null
        isConnected.value = false
        messages.value = []

        eventSource = new EventSource(`/api/support/admin/${props.userId}`)

        eventSource.onopen = () => {
            isConnected.value = true
        }

        eventSource.onmessage = async (event) => {
            const data = JSON.parse(event.data)
            switch (data.type) {
                case 'initial':
                    messages.value = data.data
                    loading.value = false
                    await nextTick()
                    scrollToBottom()
                    break
                case 'newMessages':
                    messages.value.push(...data.data)
                    await nextTick()
                    scrollToBottom()
                    break
                case 'heartbeat':
                    break
            }
        }

        eventSource.onerror = (error) => {
            console.error('EventSource error:', error)
            isConnected.value = false
            error.value = t('admin.connectionFailed')
            loading.value = false
        }
    } catch (err) {
        console.error('Error connecting to chat:', err)
        error.value = t('admin.failedToConnect')
        loading.value = false
    }

    scrollToBottom()
}

const sendMessage = async () => {
    if (!newMessage.value.trim() || !isConnected.value) return

    try {
        const messageData = {
            message: newMessage.value,
        }

        await $fetch(`/api/support/admin/${props.userId}`, {
            method: 'POST',
            body: messageData
        })

        newMessage.value = ''

        await nextTick()
        scrollToBottom()
    } catch (error) {
        console.error('Error sending message:', error)
        error.value = t('admin.failedToSend')
    }
}

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


onMounted(() => {
    if (props.userId) {
        connectToChat()
    }
})

onUnmounted(() => {
    if (eventSource) {
        eventSource.close()
    }
})
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