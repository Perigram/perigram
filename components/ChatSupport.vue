<template>
    <div class="fixed inset-0 z-[1000] flex items-stretch justify-stretch p-0 pointer-events-none md:inset-auto md:bottom-0 md:right-0 md:items-end md:justify-end md:p-6">
        <div
            v-if="supportDialog"
            class="flex h-[100dvh] max-h-none w-full flex-col overflow-hidden border-0 bg-content shadow-lg pointer-events-auto animate-in slide-in-from-bottom-4 duration-normal md:h-support-chat md:max-h-[80vh] md:w-[var(--ck-support-chat-width)] md:rounded-ui md:border md:border-content-border"
        >
            <div class="flex items-center justify-between p-4 border-b border-content-border bg-content">
                <div class="flex min-w-0 items-center gap-2">
                    <Button
                        v-if="activeConversation"
                        icon="pi pi-arrow-left"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        :aria-label="$t('common.back')"
                        @click="showInbox"
                    />
                    <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-contrast">
                        <i class="pi pi-comment text-sm"></i>
                    </div>
                    <h2 class="m-0 truncate text-base font-bold">{{ chatTitle }}</h2>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                    <Button
                        v-if="!activeConversation"
                        icon="pi pi-user-plus"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        :aria-label="$t('support.openChat')"
                        @click="toggleNewChat"
                    />
                    <Button
                        icon="pi pi-times"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        :aria-label="$t('common.close')"
                        @click="closeChat"
                    />
                </div>
            </div>

            <div v-if="!activeConversation" class="flex-1 overflow-y-auto p-2 md:p-3">
                <div v-if="newChatVisible" class="mb-2">
                    <Select
                        v-model="newChatUserId"
                        :options="newChatUserOptions"
                        option-label="label"
                        option-value="value"
                        filter
                        size="small"
                        class="w-full"
                        :loading="newChatUsersLoading"
                        :placeholder="$t('common.user')"
                        :aria-label="$t('common.user')"
                        @update:model-value="openNewChatUser"
                    >
                        <template #option="{ option }">
                            <div class="flex min-w-0 flex-col">
                                <span class="truncate">{{ option.label }}</span>
                                <small class="truncate text-muted-color">{{ option.value }}</small>
                            </div>
                        </template>
                    </Select>
                </div>
                <div class="flex flex-col gap-2">
                    <button
                        v-for="conversation in displayConversations"
                        :key="conversation.conversationKey"
                        type="button"
                        class="flex min-w-0 items-center gap-2 rounded-ui border border-content-border bg-content p-3 text-left transition-colors hover:border-primary md:gap-3"
                        @click="openConversation(conversation)"
                    >
                        <Avatar
                            :label="conversationLabel(conversation).charAt(0).toUpperCase()"
                            shape="circle"
                            size="normal"
                            class="shrink-0 bg-primary text-primary-contrast"
                        />
                        <div class="min-w-0 flex-1">
                            <div class="flex min-w-0 items-center gap-2">
                                <span class="truncate font-medium">{{ conversationLabel(conversation) }}</span>
                            </div>
                            <small class="block truncate text-muted-color">
                                <SupportMessageContent
                                    v-if="conversation.lastMessage"
                                    :message="conversationPreviewMessage(conversation)"
                                />
                                <template v-else>{{ $t('support.noMessages') }}</template>
                            </small>
                        </div>
                        <small v-if="conversation.timestamp" class="shrink-0 text-muted-color">{{ shortTime(conversation.timestamp) }}</small>
                    </button>
                </div>
            </div>

            <template v-else>
                <div ref="messagesContainer" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3 bg-content custom-scrollbar md:p-4 md:gap-4">
                    <template
                        v-for="messageItem in messagesList"
                        :key="messageItem._id"
                    >
                        <div v-if="messageItem.day" class="flex items-center gap-4 my-2">
                            <div class="flex-1 h-px bg-content-border"></div>
                            <span class="text-[10px] font-bold uppercase tracking-widest text-text-muted bg-content px-2 py-0.5 rounded-full border border-content-border">
                                {{ messageItem.day }}
                            </span>
                            <div class="flex-1 h-px bg-content-border"></div>
                        </div>

                        <div
                            class="max-w-[var(--ck-support-chat-message-max)] flex flex-col gap-1"
                            :class="isOwnMessage(messageItem) ? 'ml-auto items-end' : 'mr-auto items-start'"
                        >
                            <div
                                class="px-4 py-2 rounded-ui text-sm shadow-sm"
                                :class="isOwnMessage(messageItem)
                                    ? 'bg-primary text-primary-contrast rounded-tr-none'
                                    : 'bg-content border border-content-border rounded-tl-none'"
                            >
                                <p class="m-0 leading-relaxed break-words">
                                    <SupportMessageContent :message="messageItem" />
                                </p>
                            </div>
                            <span class="text-[10px] text-text-muted px-1">{{ formatTime(messageItem.timestamp) }}</span>
                        </div>
                    </template>
                </div>

                <div class="p-3 border-t border-content-border bg-content md:p-4">
                    <div v-if="entityComposerVisible" class="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto]">
                        <Select
                            v-model="entityDraft.type"
                            :options="entityTypeOptions"
                            option-label="label"
                            option-value="value"
                            size="small"
                            class="col-span-2 min-w-0 md:col-span-1"
                            :aria-label="$t('support.entityType')"
                            @update:model-value="loadEntityOptions"
                        />
                        <Select
                            v-model="entityDraft.id"
                            :options="entityOptions"
                            option-label="label"
                            option-value="value"
                            filter
                            size="small"
                            class="min-w-0"
                            :loading="entityOptionsLoading"
                            :placeholder="$t('support.entityId')"
                            :aria-label="$t('support.entityId')"
                        >
                            <template #option="{ option }">
                                <div class="flex min-w-0 flex-col">
                                    <span class="truncate">{{ option.label }}</span>
                                    <small class="truncate text-muted-color">{{ option.value }}</small>
                                </div>
                            </template>
                        </Select>
                        <Button
                            icon="pi pi-plus"
                            size="small"
                            :aria-label="$t('support.addEntity')"
                            :disabled="!entityDraft.type || !entityDraft.id"
                            @click="insertEntityRef"
                        />
                    </div>
                    <div
                        v-if="messagePreviewVisible"
                        class="mb-2 rounded-ui border border-content-border bg-content p-2 text-sm text-muted-color"
                    >
                        <SupportMessageContent :message="draftPreviewMessage" />
                    </div>
                    <div class="flex items-end gap-2 bg-content p-2 rounded-ui border border-content-border focus-within:border-primary transition-colors">
                        <Button
                            icon="pi pi-link"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('support.addEntity')"
                            @click="toggleEntityComposer"
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
                            :aria-label="$t('support.send')"
                        />
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, unref, computed, nextTick, watch } from 'vue'
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { useI18n } from 'vue-i18n'
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue'
import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState'
import { useAuthStore } from '~/stores/auth'
import { useSupportChatStore } from '~/stores/supportChat'

const { t } = useI18n()
const supportDialog = useSupportDialog()
const chatTarget = useSupportChatTarget()
const authStore = useAuthStore()
const supportChatStore = useSupportChatStore()

const message = ref('')
const messages = ref([])
const isLoading = ref(false)
const eventSource = ref(null)
const messagesContainer = ref(null)
const currentUserId = ref(authStore.userData?.id || authStore.userData?.userId || null)
const entityComposerVisible = ref(false)
const entityDraft = ref({ type: 'project', id: '' })
const entityRefs = ref([])
const entityOptions = ref([])
const entityOptionsLoading = ref(false)
const entityTypeOptions = ref([])
const activeConversation = ref(null)
const newChatVisible = ref(false)
const newChatUserId = ref('')
const newChatUsers = ref([])
const newChatUsersLoading = ref(false)

const messagePreviewVisible = computed(() => Boolean(message.value.trim() && (message.value.includes('{{entity:') || entityRefs.value.length)))
const draftPreviewMessage = computed(() => ({
    message: message.value,
    entityRefs: entityRefs.value
}))

const listedDirectUserIds = computed(() => new Set(displayConversations.value
    .filter(conversation => conversation.conversationKind === 'direct')
    .map(participantUserId)
    .filter(Boolean)))

const newChatUserOptions = computed(() => newChatUsers.value.filter(option => option.value !== currentUserId.value && !listedDirectUserIds.value.has(option.value)))

const displayConversations = computed(() => {
    const support = supportChatStore.supportConversation || {
        conversationKey: currentSupportConversationKey.value,
        conversationKind: 'support',
        participant: { identity: { name: t('support.chatTitle') } },
        lastMessage: '',
        unreadCount: 0
    }
    const others = supportChatStore.conversations.filter(item => item.conversationKey !== support.conversationKey)
    return [support, ...others]
})

const currentSupportConversationKey = computed(() => currentUserId.value ? `support:${currentUserId.value}` : 'support')

const chatTitle = computed(() => activeConversation.value ? conversationLabel(activeConversation.value) : t('support.chatTitle'))

const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendMessage()
    }
}

const sendMessage = async () => {
    if (!message.value.trim() || !activeConversation.value) return

    isLoading.value = true

    try {
        await $fetch('/api/support/messages', {
            method: 'POST',
            body: {
                message: message.value,
                recipientUserId: activeConversation.value.conversationKind === 'direct' ? participantUserId(activeConversation.value) : null,
                entityRefs: entityRefs.value
            }
        })
        message.value = ''
        entityRefs.value = []
        await supportChatStore.refresh()
    } catch (error) {
        console.error('Failed to send message:', error)
    } finally {
        isLoading.value = false
    }
}

const connect = async () => {
    if (!activeConversation.value) return
    if (unref(eventSource)) {
        unref(eventSource).close()
    }
    messages.value = []
    const params = new URLSearchParams()
    const recipientUserId = activeConversation.value.conversationKind === 'direct' ? participantUserId(activeConversation.value) : null
    if (recipientUserId) params.set('recipientUserId', recipientUserId)
    const url = params.toString() ? `/api/support/messages?${params.toString()}` : '/api/support/messages'
    eventSource.value = new EventSource(url)

    unref(eventSource).onmessage = async (event) => {
        try {
            const parsed = JSON.parse(event.data)
            if (parsed.type === 'initial') {
                messages.value = parsed.data
                currentUserId.value = parsed.currentUserId || currentUserId.value
                if (parsed.conversation?.kind && activeConversation.value) {
                    activeConversation.value.conversationKey = parsed.conversation.conversationKey || activeConversation.value.conversationKey
                    activeConversation.value.conversationKind = parsed.conversation.kind
                }
            } else if (parsed.type === 'newMessages') {
                messages.value.push(...parsed.data)
            }
            await supportChatStore.markRead(activeConversation.value.conversationKey)
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
    if (authStore.userIsSet) supportChatStore.connect()
    loadEntityTypes()
    if (chatTarget.value?.userId) openDirectTarget()
})
onBeforeUnmount(() => {
    if (unref(eventSource)) {
        unref(eventSource).close()
    }
})

watch(chatTarget, () => {
    if (supportDialog.value && chatTarget.value?.userId) openDirectTarget()
}, { deep: true })

watch(supportDialog, (isOpen) => {
    if (isOpen && chatTarget.value?.userId) openDirectTarget()
})

watch(activeConversation, () => {
    if (supportDialog.value && activeConversation.value) connect()
})

const formatTime = (timestamp, withoutTime) => {
    const date = new Date(timestamp)
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return withoutTime ? date.toLocaleDateString() : `${time}`
}

const shortTime = (timestamp) => {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString()
}

const messagesList = computed(() => {
    const usedDates = []
    const getDay = (timestamp) => {
        const date = new Date(timestamp)
        const dateStr = date.toLocaleDateString()
        if (usedDates.includes(dateStr)) {
            return
        }
        usedDates.push(dateStr)
        return dateStr
    }
    return messages.value.map(messageItem => {
        return {
            ...messageItem,
            day: getDay(messageItem.timestamp)
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

const toggleEntityComposer = async () => {
    entityComposerVisible.value = !entityComposerVisible.value
    if (entityComposerVisible.value) {
        if (!entityTypeOptions.value.length) await loadEntityTypes()
        await loadEntityOptions()
    }
}

const loadEntityTypes = async () => {
    try {
        const types = await $fetch('/api/support/entity-types')
        entityTypeOptions.value = (types || []).map(type => ({
            label: type.labelKey ? t(type.labelKey) : (type.label || type.value),
            value: type.value
        }))
        if (!entityDraft.value.type && entityTypeOptions.value[0]) {
            entityDraft.value.type = entityTypeOptions.value[0].value
        }
    } catch (error) {
        console.error('Failed to load support entity types:', error)
        entityTypeOptions.value = []
    }
}

const loadEntityOptions = async () => {
    if (!entityDraft.value.type) return
    entityOptionsLoading.value = true
    entityDraft.value.id = ''
    try {
        entityOptions.value = await $fetch('/api/support/entity-options', {
            query: { type: entityDraft.value.type }
        })
    } catch (error) {
        console.error('Failed to load entity options:', error)
        entityOptions.value = []
    } finally {
        entityOptionsLoading.value = false
    }
}

const insertEntityRef = () => {
    const selected = entityOptions.value.find(option => option.value === entityDraft.value.id)
    if (!selected) return
    const token = `{{entity:${selected.type}:${selected.value}}}`
    message.value = message.value ? `${message.value} ${token}` : token
    if (!entityRefs.value.some(ref => ref.type === selected.type && ref.id === selected.value)) {
        entityRefs.value.push({ type: selected.type, id: selected.value, label: selected.label })
    }
    entityDraft.value.id = ''
}

const toggleNewChat = async () => {
    newChatVisible.value = !newChatVisible.value
    if (newChatVisible.value) await loadNewChatUsers()
}

const loadNewChatUsers = async () => {
    newChatUsersLoading.value = true
    try {
        newChatUsers.value = await $fetch('/api/support/entity-options', {
            query: { type: 'user' }
        })
    } catch (error) {
        console.error('Failed to load chat users:', error)
        newChatUsers.value = []
    } finally {
        newChatUsersLoading.value = false
    }
}

const openNewChatUser = (userId) => {
    if (!userId) return
    const option = newChatUsers.value.find(item => item.value === userId)
    activeConversation.value = {
        conversationKey: directConversationKey(currentUserId.value, userId),
        conversationKind: 'direct',
        participants: [currentUserId.value, userId].filter(Boolean),
        lastMessage: '',
        entityRefs: [],
        participant: option?.entity || {
            _id: userId,
            identity: { name: option?.label || userId },
            data: {}
        }
    }
    newChatUserId.value = ''
    newChatVisible.value = false
}

const isOwnMessage = (chatMessage) => {
    if (chatMessage.senderUserId && currentUserId.value) {
        return chatMessage.senderUserId === currentUserId.value
    }
    return chatMessage.sender === 'user'
}

const openConversation = async (conversation) => {
    activeConversation.value = conversation
    await supportChatStore.markRead(conversation.conversationKey)
}

const showInbox = () => {
    activeConversation.value = null
    chatTarget.value = null
    if (unref(eventSource)) {
        unref(eventSource).close()
        eventSource.value = null
    }
}

const closeChat = () => {
    supportDialog.value = false
    showInbox()
}

const openDirectTarget = () => {
    if (!chatTarget.value?.userId) return
    activeConversation.value = {
        conversationKey: directConversationKey(currentUserId.value, chatTarget.value.userId),
        conversationKind: 'direct',
        participants: [currentUserId.value, chatTarget.value.userId].filter(Boolean),
        participant: {
            _id: chatTarget.value.userId,
            identity: { name: chatTarget.value.name || chatTarget.value.userId },
            data: {}
        }
    }
}

const conversationLabel = (conversation) => {
    return conversation?.participant?.identity?.name
        || conversation?.participant?.name
        || (conversation?.conversationKind === 'support' ? t('support.chatTitle') : t('common.user'))
}

const conversationPreviewMessage = (conversation) => ({
    message: conversation.lastMessage || '',
    entityRefs: conversation.entityRefs || []
})

const participantUserId = (conversation) => {
    return conversation?.participant?._id?.toString?.()
        || conversation?.participant?.id?.toString?.()
        || conversation?.participants?.find(item => item !== currentUserId.value)
        || ''
}

const directConversationKey = (left, right) => {
    if (!left || !right) return `direct:${right}`
    return `direct:${[left, right].map(String).sort().join(':')}`
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
