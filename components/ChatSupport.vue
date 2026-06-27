<template>
    <div class="fixed bottom-0 right-0 z-[1000] flex justify-end items-end p-4 md:p-6 pointer-events-none">
        <div 
            v-if="supportDialog"
            class="w-full sm:w-[var(--ck-support-chat-width)] h-support-chat max-h-[80vh] bg-content border border-content-border rounded-ui shadow-lg flex flex-col overflow-hidden pointer-events-auto animate-in slide-in-from-bottom-4 duration-normal"
        >
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b border-content-border bg-content">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-contrast">
                        <i class="pi pi-comment text-sm"></i>
                    </div>
                    <h2 class="m-0 text-base font-bold">{{ chatTitle }}</h2>
                </div>
                <Button
                    icon="pi pi-times"
                    severity="secondary"
                    text
                    rounded
                    size="small"
                    @click="closeChat"
                />
            </div>

            <!-- Messages -->
            <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-content custom-scrollbar">
                <template
                    v-for="message in messagesList"
                    :key="message._id"
                >
                    <!-- Date Separator -->
                    <div v-if="message.day" class="flex items-center gap-4 my-2">
                        <div class="flex-1 h-px bg-content-border"></div>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-text-muted bg-content px-2 py-0.5 rounded-full border border-content-border">
                            {{ message.day }}
                        </span>
                        <div class="flex-1 h-px bg-content-border"></div>
                    </div>

                    <!-- Message Bubble -->
                    <div 
                        class="max-w-[var(--ck-support-chat-message-max)] flex flex-col gap-1"
                        :class="isOwnMessage(message) ? 'ml-auto items-end' : 'mr-auto items-start'"
                    >
                        <div 
                            class="px-4 py-2 rounded-ui text-sm shadow-sm"
                            :class="isOwnMessage(message)
                                ? 'bg-primary text-primary-contrast rounded-tr-none' 
                                : 'bg-content border border-content-border rounded-tl-none'"
                        >
                            <p class="m-0 leading-relaxed break-words">
                                <SupportMessageContent :message="message" />
                            </p>
                        </div>
                        <span class="text-[10px] text-text-muted px-1">{{ formatTime(message.timestamp) }}</span>
                    </div>
                </template>
            </div>

            <!-- Input Area -->
            <div class="p-4 border-t border-content-border bg-content">
                <div v-if="entityComposerVisible" class="mb-2 grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] gap-2">
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
                <div class="flex items-end gap-2 bg-content p-2 rounded-ui border border-content-border focus-within:border-primary transition-colors">
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
import { ref, onMounted, onBeforeUnmount, unref, computed, nextTick, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { useI18n } from 'vue-i18n'
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue'
import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState'

const { t } = useI18n()
const supportDialog = useSupportDialog()
const chatTarget = useSupportChatTarget()

const message = ref('')
const messages = ref([])
const isLoading = ref(false)
const eventSource = ref(null)
const messagesContainer = ref(null)
const currentUserId = ref(null)
const entityComposerVisible = ref(false)
const entityDraft = ref({ type: 'project', id: '' })
const entityRefs = ref([])

const entityTypeOptions = computed(() => [
    { label: t('common.project'), value: 'project' },
    { label: t('queue.title'), value: 'queue' },
    { label: t('support.entityTypes.sheet'), value: 'sheet' },
    { label: t('support.entityTypes.material'), value: 'material' },
    { label: t('common.user'), value: 'user' }
])

const chatTitle = computed(() => chatTarget.value?.name
    ? chatTarget.value.name
    : (chatTarget.value?.userId ? chatTarget.value.userId : t('support.chatTitle')))

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
            body: {
                message: message.value,
                recipientUserId: chatTarget.value?.userId || null,
                entityRefs: entityRefs.value
            }
        })
        message.value = ''
        entityRefs.value = []
    } catch (error) {
        console.error('Failed to send message:', error)
    } finally {
        isLoading.value = false
    }
}

const connect = () => {
    if (unref(eventSource)) {
        unref(eventSource).close()
    }
    messages.value = []
    const params = new URLSearchParams()
    if (chatTarget.value?.userId) params.set('recipientUserId', chatTarget.value.userId)
    const url = params.toString() ? `/api/support/messages?${params.toString()}` : '/api/support/messages'
    eventSource.value = new EventSource(url)

    unref(eventSource).onmessage = async (event) => {
        try {
            const parsed = JSON.parse(event.data)
            if (parsed.type === 'initial') {
                messages.value = parsed.data
                currentUserId.value = parsed.currentUserId || currentUserId.value
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
}

onMounted(() => {
    connect()
})
onBeforeUnmount(() => {
    if (unref(eventSource)) {
        unref(eventSource).close()
    }
})

watch(chatTarget, () => {
    if (supportDialog.value) connect()
}, { deep: true })

watch(supportDialog, (isOpen) => {
    if (isOpen) connect()
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

const insertEntityRef = () => {
    const id = entityDraft.value.id.trim()
    const type = entityDraft.value.type
    if (!id || !type) return
    const token = `{{entity:${type}:${id}}}`
    message.value = message.value ? `${message.value} ${token}` : token
    if (!entityRefs.value.some(ref => ref.type === type && ref.id === id)) {
        entityRefs.value.push({ type, id })
    }
    entityDraft.value.id = ''
}

const isOwnMessage = (chatMessage) => {
    if (chatMessage.senderUserId && currentUserId.value) {
        return chatMessage.senderUserId === currentUserId.value
    }
    return chatMessage.sender === 'user'
}

const closeChat = () => {
    supportDialog.value = false
    chatTarget.value = null
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
