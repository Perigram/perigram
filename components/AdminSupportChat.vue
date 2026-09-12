<template>
    <div class="flex h-full min-h-0 flex-col">
        <div class="p-4">
            <ActionToolbar :title="$t('admin.supportChat')" :subtitle="`${$t('admin.userId')}: ${userId.slice(-8)}`">
                <template #actions>
                    <Button
                        icon="pi pi-arrow-left"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        class="md:hidden"
                        :aria-label="$t('common.back')"
                        @click="$emit('back')"
                    />
                </template>
            </ActionToolbar>
        </div>

        <div ref="messagesContainer" class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <StateBlock v-if="loading" state="loading" :message="$t('admin.loadingMessages')" />
            <StateBlock v-else-if="messages.length === 0" :message="$t('admin.noMessages')" icon="pi pi-comments" />
            <template v-else>
                <template v-for="message in messagesList" :key="message._id">
                    <Divider v-if="message.day" align="center">
                        <span class="text-supporting">{{ message.day }}</span>
                    </Divider>
                    <div
                        class="flex max-w-support-chat-admin-message flex-col gap-1"
                        :class="message.sender === 'support' ? 'ml-auto items-end' : 'mr-auto items-start'"
                    >
                        <div
                            class="rounded-ui px-4 py-2 text-body"
                            :class="message.sender === 'support'
                                ? 'bg-primary text-primary-contrast'
                                : 'bg-subtle'"
                        >
                            <p class="m-0 break-words text-body">
                                <SupportMessageContent :message="message" />
                            </p>
                        </div>
                        <span class="px-1 text-muted-color text-supporting">{{ formatTime(message.timestamp) }}</span>
                    </div>
                </template>
            </template>
        </div>

        <div class="flex flex-col gap-2 p-4">
            <div
                v-show="typingName"
                ref="typingIndicatorRef"
                class="px-1 text-muted-color text-supporting opacity-0"
            >
                {{ $t('support.typing', { name: typingName }) }}
            </div>
            <div v-if="entityComposerVisible" class="flex flex-col gap-2 md:flex-row md:items-center">
                <Select
                    v-model="entityDraft.type"
                    :options="entityTypeOptions"
                    option-label="label"
                    option-value="value"
                    size="small"
                    class="w-full min-w-0 md:w-48"
                    :aria-label="$t('support.entityType')"
                />
                <InputText
                    v-model="entityDraft.id"
                    size="small"
                    :placeholder="$t('support.entityId')"
                    class="w-full min-w-0 md:flex-1"
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
            <div class="flex items-end gap-2">
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
                    v-model="newMessage"
                    class="min-w-0 flex-1"
                    :placeholder="$t('admin.typeMessage')"
                    rows="1"
                    auto-resize
                    :disabled="!isConnected"
                    @input="handleTypingInput"
                    @keydown="handleKeyDown"
                />
                <Button
                    icon="pi pi-send"
                    rounded
                    size="small"
                    class="shrink-0"
                    :aria-label="$t('admin.send')"
                    :disabled="!newMessage.trim() || !isConnected"
                    @click="sendMessage"
                />
            </div>

            <div v-if="error" class="flex flex-col gap-3">
                <Message severity="error">{{ error }}</Message>
                <Button :label="$t('admin.retry')" text severity="danger" @click="connectToChat" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import Select from '~/components/shared/EntitySelect.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue';
import { useConnections } from '~/composables/useConnections.js';
import { useEnterExit, enterOnce } from '~/composables/useMotion.js';

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
const typingName = ref('')
const typingIndicatorRef = ref(null)
const currentUserId = ref(null)
let unsubscribeConversation = null
let typingResetTimer = null
let typingSendTimer = null

const typingActive = computed(() => Boolean(typingName.value))
useEnterExit(typingIndicatorRef, typingActive, { y: 4, duration: 0.15 })

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

const handleTypingInput = () => {
    if (typingSendTimer) return
    typingSendTimer = setTimeout(() => {
        typingSendTimer = null
        if (!newMessage.value.trim()) return
        $fetch('/api/support/typing', {
            method: 'POST',
            body: { conversationKey: `support:${props.userId}` }
        }).catch(() => {})
    }, 1500)
}

const receiveTyping = (payload) => {
    if (!payload?.userId || payload.userId === currentUserId.value) return
    typingName.value = payload.name || ''
    if (typingResetTimer) clearTimeout(typingResetTimer)
    typingResetTimer = setTimeout(() => {
        typingName.value = ''
    }, 3000)
}

const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
    return messages.value.map(message => ({
        ...message,
        day: getDay(message.timestamp)
    }))
})
const connectToChat = async () => {
    try {
        loading.value = true
        error.value = null
        isConnected.value = false
        messages.value = []

        const snapshot = await $fetch(`/api/support/admin/${props.userId}`)
        messages.value = snapshot?.data || []
        currentUserId.value = snapshot?.currentUserId || null
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
        if (payload?.type === 'typing') {
            receiveTyping(payload)
            return
        }
        if (payload?.type !== 'message') return
        messages.value.push(payload.message)
        nextTick().then(scrollToBottom)
    })
}

watch(() => messages.value.length, (newLength, oldLength) => {
    if (!newLength || !oldLength || newLength <= oldLength) return
    nextTick(() => {
        if (messagesContainer.value?.lastElementChild) {
            enterOnce(messagesContainer.value.lastElementChild)
        }
    })
})

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
    if (typingResetTimer) clearTimeout(typingResetTimer)
    if (typingSendTimer) clearTimeout(typingSendTimer)
})
</script>
