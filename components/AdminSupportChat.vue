<template>
    <div class="flex flex-col h-full">
        <!-- Header -->
        <Panel>
            <template #header>
                <div class="flex items-center justify-between w-full">
                    <div class="flex flex-col">
                        <h2 class="m-0 text-section-heading">{{ $t('admin.supportChat') }}</h2>
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
            <div ref="messagesContainer" class="h-[calc(var(--ck-support-chat-admin-height)-7rem)] overflow-y-auto p-4 flex flex-col gap-4">
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
                            class="max-w-[var(--ck-support-chat-admin-message-max)] flex flex-col gap-1"
                            :class="message.sender === 'support' ? 'ml-auto items-end' : 'mr-auto items-start'"
                        >
                            <Panel 
                                :class="message.sender === 'support' ? 'card-active' : ''"
                            >
                                <p class="m-0 break-words">
                                    <SupportMessageContent :message="message" />
                                </p>
                            </Panel>
                            <small>{{ formatTime(message.timestamp) }}</small>
                        </div>
                    </template>
                </template>
            </div>

            <template #footer>
                <Divider />
                <div v-if="entityComposerVisible" class="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] gap-2 p-2">
                    <Select
                        v-model="entityDraft.type"
                        :options="entityTypeOptions"
                        option-label="label"
                        option-value="value"
                        size="small"
                        class="min-w-0"
                        :aria-label="$t('support.entityType')"
                    />
                    <InputText
                        v-model="entityDraft.id"
                        size="small"
                        :placeholder="$t('support.entityId')"
                        class="min-w-0"
                        @keydown.enter.prevent="insertEntityRef"
                    />
                    <Button
                        icon="pi pi-plus"
                        size="small"
                        :aria-label="$t('support.addEntity')"
                        :disabled="!entityDraft.type || !entityDraft.id.trim()"
                        @click="insertEntityRef"
                    />
                </div>
                <div class="flex items-end gap-2 p-2">
                    <Button
                        icon="pi pi-link"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        :aria-label="$t('support.addEntity')"
                        @click="entityComposerVisible = !entityComposerVisible"
                    />
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
import { useConnections } from '~/composables/useConnections.js';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import Select from '~/components/shared/EntitySelect.vue';
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue';

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
const entityComposerVisible = ref(false)
const entityDraft = ref({ type: 'project', id: '' })
const entityRefs = ref([])
let unsubscribeConversation = null
const entityTypeOptions = computed(() => [
    { label: t('common.project'), value: 'project' },
    { label: t('queue.title'), value: 'queue' },
    { label: t('support.entityTypes.sheet'), value: 'sheet' },
    { label: t('support.entityTypes.material'), value: 'material' },
    { label: t('common.user'), value: 'user' }
])
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
const connectToChat = async () => {
    try {
        loading.value = true
        error.value = null
        isConnected.value = false
        messages.value = []

        const snapshot = await $fetch(`/api/support/admin/${props.userId}`)
        messages.value = snapshot?.data || []
        isConnected.value = true
        loading.value = false
        await nextTick()
        scrollToBottom()
    } catch (err) {
        console.error('Error connecting to chat:', err)
        error.value = t('admin.failedToConnect')
        isConnected.value = false
        loading.value = false
    }
}

const subscribeConversation = () => {
    unsubscribeConversation?.()
    unsubscribeConversation = null
    if (!props.userId) return
    unsubscribeConversation = useConnections().subscribe(`conversation:support:${props.userId}`, (payload) => {
        if (payload?.type !== 'message') return
        messages.value.push(payload.message)
        nextTick().then(scrollToBottom)
    })
}

const sendMessage = async () => {
    if (!newMessage.value.trim() || !isConnected.value) return

    try {
        const messageData = {
            message: newMessage.value,
            entityRefs: entityRefs.value,
        }

        await $fetch(`/api/support/admin/${props.userId}`, {
            method: 'POST',
            body: messageData
        })

        newMessage.value = ''
        entityRefs.value = []

        await nextTick()
        scrollToBottom()
    } catch (error) {
        console.error('Error sending message:', error)
        error.value = t('admin.failedToSend')
    }
}

const insertEntityRef = () => {
    const id = entityDraft.value.id.trim()
    const type = entityDraft.value.type
    if (!id || !type) return
    const token = `{{entity:${type}:${id}}}`
    newMessage.value = newMessage.value ? `${newMessage.value} ${token}` : token
    if (!entityRefs.value.some(ref => ref.type === type && ref.id === id)) {
        entityRefs.value.push({ type, id })
    }
    entityDraft.value.id = ''
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
        subscribeConversation()
    }
})

onUnmounted(() => {
    unsubscribeConversation?.()
    unsubscribeConversation = null
})
</script>
