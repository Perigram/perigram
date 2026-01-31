<template>
    <div class="flex flex-col h-full">
        <!-- Header -->
        <Panel>
            <template #header>
                <div class="flex items-center justify-between w-full">
                    <div class="flex flex-col">
                        <h2 class="m-0 text-base">{{ $t('admin.supportChat') }}</h2>
                        <small>{{ $t('admin.userId') }}: {{ userId.slice(-8) }}</small>
                    </div>
                    <Button
                        icon="pi pi-arrow-left"
                        @click="$emit('back')"
                        text
                        class="md:hidden"
                    />
                </div>
            </template>

            <!-- Messages Area -->
            <div ref="messagesContainer" class="h-[calc(100vh-300px)] overflow-y-auto p-4 flex flex-col gap-4">
                <div v-if="loading" class="flex flex-col items-center justify-center py-20 gap-4">
                    <ProgressSpinner />
                    <p>{{ $t('admin.loadingMessages') }}</p>
                </div>
                <div v-else-if="messages.length === 0" class="flex flex-col items-center justify-center py-20">
                    <p>{{ $t('admin.noMessages') }}</p>
                </div>
                <template v-else>
                    <template v-for="message in messagesList" :key="message._id">
                        <!-- Date Separator -->
                        <div v-if="message.day">
                            <Divider>
                                <small>{{ message.day }}</small>
                            </Divider>
                        </div>
                        <!-- Message Bubble -->
                        <div 
                            class="max-w-[80%] flex flex-col gap-1"
                            :class="message.sender === 'support' ? 'ml-auto items-end' : 'mr-auto items-start'"
                        >
                            <Card 
                                :class="message.sender === 'support' ? 'card-active' : ''"
                            >
                                <template #content>
                                    <p class="m-0 break-words">{{ message.message }}</p>
                                </template>
                            </Card>
                            <small>{{ formatTime(message.timestamp) }}</small>
                        </div>
                    </template>
                </template>
            </div>

            <template #footer>
                <Divider />
                <div class="flex items-end gap-2 p-2">
                    <Textarea 
                        :placeholder="$t('admin.typeMessage')" 
                        class="flex-1 !bg-transparent !border-none !shadow-none !ring-0 py-1" 
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
                    />
                </div>
                
                <div v-if="error" class="mt-3 flex flex-col gap-4">
                    <Message severity="error">{{ error }}</Message>
                    <Button :label="$t('admin.retry')" text severity="danger" @click="connectToChat" />
                </div>
            </template>
        </Panel>
    </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import Panel from 'primevue/panel';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
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