<template>
    <div
        class="chat-host"
        :class="embedded
            ? 'flex h-full min-h-0 w-full items-stretch justify-stretch p-0'
            : 'fixed inset-0 z-50 flex items-stretch justify-stretch p-0 pointer-events-none md:inset-auto md:bottom-0 md:right-0 md:items-end md:justify-end md:p-6'"
    >
        <div
            v-if="supportDialog || embedded"
            :class="[
                embedded
                    ? fullPage
                        ? 'chat-page flex h-full min-h-0 w-full flex-col overflow-hidden pointer-events-auto'
                        : 'flex h-full min-h-0 w-full flex-col overflow-hidden pointer-events-auto'
                    : 'flex h-dvh w-full flex-col overflow-hidden bg-content shadow-overlay pointer-events-auto md:h-support-chat md:w-support-chat md:rounded-ui',
                fullPage && activeConversation ? 'chat-page--thread' : ''
            ]"
        >
            <aside
                v-if="!activeConversation || fullPage"
                class="chat-inbox flex min-h-0 flex-col overflow-hidden"
                :class="fullPage ? 'chat-inbox--rail border-r border-chrome-border' : 'flex-1'"
            >
                <div class="flex shrink-0 items-center justify-end gap-1 px-2 pt-2">
                    <Button
                        icon="pi pi-user-plus"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        :aria-label="$t('support.openChat')"
                        @click="toggleNewChat"
                    />
                    <Button
                        icon="pi pi-users"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        :aria-label="$t('support.newGroup')"
                        @click="openGroupDialog"
                    />
                </div>
                <div v-if="newChatVisible" class="border-b border-chrome-border p-3">
                    <Select
                        v-model="newChatUserId"
                        :options="newChatUserOptions"
                        option-label="label"
                        option-value="value"
                        entity-type="user"
                        filter
                        size="small"
                        class="w-full"
                        :loading="newChatUsersLoading"
                        :placeholder="$t('common.user')"
                        :aria-label="$t('common.user')"
                        @update:model-value="openNewChatUser"
                    />
                </div>
                <StateBlock
                    v-if="!displayConversations.length && !newChatVisible"
                    class="m-3"
                    :message="$t('support.noConversations')"
                    icon="pi pi-comments"
                />
                <div v-else class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 md:p-3">
                    <template v-for="section in conversationSections" :key="section.key">
                        <span class="px-2 pt-2 pb-1 text-label text-muted-color">{{ section.label }}</span>
                        <button
                            v-for="conversation in section.conversations"
                            :key="conversation.conversationKey"
                            type="button"
                            class="flex min-w-0 items-center gap-2 rounded-ui p-2 text-left transition-colors hover:bg-subtle md:gap-3"
                            :class="{ 'bg-subtle': isActiveConversation(conversation) }"
                            @click="openConversation(conversation)"
                        >
                            <div class="relative shrink-0">
                                <Avatar
                                    v-if="conversation.conversationKind === 'group'"
                                    icon="pi pi-users"
                                    shape="circle"
                                    size="normal"
                                    class="bg-primary text-primary-contrast"
                                />
                                <Avatar
                                    v-else
                                    :image="conversationAvatar(conversation)"
                                    :label="conversationLabel(conversation).charAt(0).toUpperCase()"
                                    shape="circle"
                                    size="normal"
                                    class="bg-primary text-primary-contrast [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                                />
                                <span
                                    v-if="conversation.conversationKind === 'direct' && participantOnline(conversation)"
                                    class="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-ui bg-status-success"
                                    :aria-label="$t('support.online')"
                                />
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="flex min-w-0 items-center gap-2">
                                    <span class="truncate text-label">{{ conversationLabel(conversation) }}</span>
                                    <small
                                        v-if="conversation.conversationKind === 'group'"
                                        class="shrink-0 text-muted-color text-supporting"
                                    >
                                        {{ $t('support.membersCount', { count: (conversation.participants || []).length }) }}
                                    </small>
                                </div>
                                <small class="block truncate text-muted-color">
                                    <SupportMessageContent
                                        v-if="conversation.lastMessage"
                                        :message="conversationPreviewMessage(conversation)"
                                        :viewer-user-id="currentUserId"
                                    />
                                    <template v-else>{{ $t('support.noMessages') }}</template>
                                </small>
                            </div>
                            <small v-if="conversation.timestamp" class="shrink-0 text-muted-color">{{ shortTime(conversation.timestamp) }}</small>
                        </button>
                    </template>
                </div>
            </aside>

            <div v-if="fullPage && !activeConversation" class="chat-empty min-h-0 flex-1 items-center justify-center">
                <StateBlock :message="$t('support.selectConversation')" icon="pi pi-comments" />
            </div>

            <section v-if="activeConversation" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <header class="flex shrink-0 items-center gap-2 border-b border-chrome-border px-3 py-3 md:gap-3 md:px-4">
                    <Button
                        icon="pi pi-arrow-left"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        :class="fullPage ? 'chat-back' : ''"
                        :aria-label="$t('common.back')"
                        @click="showInbox"
                    />
                    <Avatar
                        v-if="activeConversation.conversationKind === 'group'"
                        icon="pi pi-users"
                        shape="circle"
                        class="shrink-0 bg-primary text-primary-contrast"
                    />
                    <Avatar
                        v-else
                        :image="conversationAvatar(activeConversation)"
                        :label="conversationLabel(activeConversation).charAt(0).toUpperCase()"
                        shape="circle"
                        class="shrink-0 bg-primary text-primary-contrast [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                    />
                    <div class="min-w-0 flex-1">
                        <h2 class="m-0 truncate text-section-heading">{{ conversationLabel(activeConversation) }}</h2>
                        <small v-if="conversationSubtitle" class="block truncate text-muted-color text-supporting">
                            {{ conversationSubtitle }}
                        </small>
                    </div>
                    <div class="flex shrink-0 items-center gap-1">
                        <Button
                            v-if="activeConversation.conversationKind !== 'support'"
                            icon="pi pi-phone"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('call.start')"
                            @click="startCall"
                        />
                        <Button
                            v-if="canDeleteActiveGroup"
                            icon="pi pi-trash"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('common.delete')"
                            @click="requestDeleteGroup"
                        />
                        <Button
                            v-if="!embedded"
                            icon="pi pi-external-link"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('common.open')"
                            @click="openChatsPage"
                        />
                        <Button
                            v-if="!embedded"
                            icon="pi pi-times"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('common.close')"
                            @click="closeChat"
                        />
                    </div>
                </header>
                <div
                    v-if="incomingCall"
                    class="mx-3 mt-3 flex items-center justify-between gap-3 rounded-ui bg-subtle p-3 md:mx-4 md:mt-4"
                >
                    <span class="min-w-0 truncate text-body">
                        {{ $t('call.incoming', { name: incomingCall.fromName || '' }) }}
                    </span>
                    <Button :label="$t('call.join')" icon="pi pi-phone" size="small" @click="joinIncomingCall" />
                </div>
                <div ref="messagesContainer" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3 md:p-4 md:gap-4">
                    <template
                        v-for="messageItem in messagesList"
                        :key="messageItem._id"
                    >
                        <Divider v-if="messageItem.day" align="center">
                            <span class="text-supporting">{{ messageItem.day }}</span>
                        </Divider>

                        <div
                            class="flex max-w-support-chat-message flex-col gap-1"
                            :class="isOwnMessage(messageItem) ? 'ml-auto items-end' : 'mr-auto items-start'"
                        >
                            <div
                                class="rounded-ui px-4 py-2 text-body"
                                :class="isOwnMessage(messageItem)
                                    ? 'bg-primary text-primary-contrast'
                                    : 'bg-subtle'"
                            >
                                <p class="m-0 break-words text-body">
                                    <SupportMessageContent :message="messageItem" :viewer-user-id="currentUserId" />
                                </p>
                            </div>
                            <span class="px-1 text-muted-color text-supporting">{{ formatTime(messageItem.timestamp) }}</span>
                        </div>
                    </template>
                </div>

                <div class="flex flex-col gap-2 border-t border-chrome-border p-3 md:p-4">
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
                            @update:model-value="loadEntityOptions"
                        />
                        <Select
                            v-model="entityDraft.id"
                            :options="entityOptions"
                            option-label="label"
                            option-value="value"
                            :entity-type="entityDraft.type"
                            filter
                            size="small"
                            class="min-w-0"
                            :loading="entityOptionsLoading"
                            :placeholder="$t('support.entityId')"
                            :aria-label="$t('support.entityId')"
                        />
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
                        class="rounded-ui bg-subtle p-2 text-muted-color text-body"
                    >
                        <SupportMessageContent :message="draftPreviewMessage" :viewer-user-id="currentUserId" />
                    </div>
                    <div v-if="entityRefs.length" class="mb-2 flex flex-wrap gap-2">
                        <div
                            v-for="ref in entityRefs"
                            :key="`${ref.type}-${ref.id}`"
                            class="inline-flex max-w-full items-center gap-1 rounded-ui bg-subtle px-2 py-1"
                        >
                            <EntityInlineRef
                                :type="ref.type"
                                :id="ref.id"
                                :entity="ref.entity || null"
                                :fetch="!ref.entity"
                            />
                            <Button
                                icon="pi pi-times"
                                text
                                rounded
                                size="small"
                                :aria-label="$t('common.delete')"
                                @click="removeEntityRef(ref)"
                            />
                        </div>
                    </div>
                    <div v-if="recipientLimitedRefs.length" class="mb-2 flex flex-col gap-1 text-status-warning text-supporting">
                        <small
                            v-for="ref in recipientLimitedRefs"
                            :key="`${ref.type}-${ref.id}`"
                            class="inline-flex min-w-0 items-center gap-1"
                        >
                            <i class="pi pi-exclamation-triangle shrink-0"></i>
                            <span class="min-w-0 truncate">
                                {{ $t('support.recipientChatOnlyWarning', { label: ref.label || ref.id }) }}
                            </span>
                        </small>
                    </div>
                    <div class="flex items-end gap-2">
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
                            class="min-w-0 flex-1"
                            v-model="message"
                            @input="handleTypingInput"
                            @keydown="handleKeyDown"
                            rows="1"
                            autoResize
                        />
                        <Button
                            icon="pi pi-send"
                            @click="sendMessage"
                            :disabled="(!message.trim() && !entityRefs.length) || isLoading"
                            rounded
                            size="small"
                            class="flex-shrink-0"
                            :aria-label="$t('support.send')"
                        />
                    </div>
                </div>
            </section>
        </div>
        <StandardDialog
            v-model:visible="callDialog"
            :header="$t('call.title')"
            size="full"
            :show-default-footer="false"
        >
            <div class="flex h-support-chat flex-col">
                <CallPanel v-if="callDialog && callRoom" :key="callRoom" :room="callRoom" @closed="callDialog = false" />
            </div>
        </StandardDialog>
        <StandardDialog
            v-model:visible="groupDialog"
            size="sm"
            :show-default-footer="true"
            :save-label="$t('support.groupCreate')"
            :cancel-label="$t('common.cancel')"
            :loading="groupSaving"
            @save="createGroup"
            @cancel="groupDialog = false"
        >
            <template #header>
                <span>{{ $t('support.newGroup') }}</span>
            </template>
            <div class="flex flex-col gap-3">
                <InputText
                    v-model="groupName"
                    :placeholder="$t('support.groupName')"
                    :aria-label="$t('support.groupName')"
                />
                <EntityMultiSelect
                    v-model="groupMemberIds"
                    :options="newChatUsers"
                    option-label="label"
                    option-value="value"
                    entity-type="user"
                    filter
                    :loading="newChatUsersLoading"
                    :placeholder="$t('support.selectMembers')"
                    :aria-label="$t('support.selectMembers')"
                    class="w-full"
                />
            </div>
        </StandardDialog>
        <ConfirmDialog />
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import Avatar from 'primevue/avatar'
import Divider from 'primevue/divider'
import Button from 'primevue/button'
import ConfirmDialog from 'primevue/confirmdialog'
import InputText from 'primevue/inputtext'
import Select from '~/components/shared/EntitySelect.vue'
import EntityMultiSelect from '~/components/shared/EntityMultiSelect.vue'
import Textarea from 'primevue/textarea'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue'
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue'
import StateBlock from '~/components/shared/StateBlock.vue'
import StandardDialog from '~/components/shared/StandardDialog.vue'
import CallPanel from '~/components/calls/CallPanel.vue'
import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState'
import { useConnections } from '~/composables/useConnections.js'
import { useEnterExit, enterOnce } from '~/composables/useMotion.js'
import { useAuthStore } from '~/stores/auth'
import { useSupportChatStore } from '~/stores/supportChat'

const props = defineProps({
    embedded: {
        type: Boolean,
        default: false
    },
    fullPage: { type: Boolean, default: false },
    conversationKey: { type: String, default: '' },
    openCallInPane: { type: Boolean, default: false }
})

const emit = defineEmits(['open-call'])

const { t } = useI18n()
const confirm = useConfirm()
const toast = useToast()
const supportDialog = useSupportDialog()
const chatTarget = useSupportChatTarget()
const authStore = useAuthStore()
const supportChatStore = useSupportChatStore()

const message = ref('')
const messages = ref([])
const isLoading = ref(false)
const messagesContainer = ref(null)
const currentUserId = ref(authStore.userData?.id || authStore.userData?.userId || null)
let unsubscribeConversation = null
let conversationLoadToken = 0
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
const groupDialog = ref(false)
const groupName = ref('')
const groupMemberIds = ref([])
const groupSaving = ref(false)
const typingName = ref('')
const typingIndicatorRef = ref(null)
let typingResetTimer = null
let typingSendTimer = null

const typingActive = computed(() => Boolean(typingName.value))
useEnterExit(typingIndicatorRef, typingActive, { y: 4, duration: 0.15 })
const callRoom = ref('')
const callDialog = ref(false)
const incomingCall = ref(null)
let incomingCallTimer = null

const startCall = async () => {
    if (!activeConversationKey.value) return
    try {
        const invite = await $fetch('/api/livekit/invite', {
            method: 'POST',
            body: { conversationKey: activeConversationKey.value }
        })
        openCallSurface(invite.room)
    } catch (error) {
        console.error('Failed to start call:', error)
    }
}

// Pane-hosted chats open calls as workspace tabs instead of the floating
// dialog; drawer and mobile surfaces keep the dialog.
const openCallSurface = (room = '') => {
    if (!room) return
    if (props.openCallInPane) {
        emit('open-call', {
            room,
            conversationKey: activeConversationKey.value || '',
            label: conversationLabel(activeConversation.value)
        })
        return
    }
    callRoom.value = room
    callDialog.value = true
}

const joinIncomingCall = () => {
    if (!incomingCall.value?.room) return
    const room = incomingCall.value.room
    incomingCall.value = null
    if (incomingCallTimer) clearTimeout(incomingCallTimer)
    openCallSurface(room)
}

const receiveCallInvite = (payload) => {
    if (!payload?.room || payload.from === currentUserId.value) return
    incomingCall.value = { room: payload.room, fromName: payload.fromName || '' }
    if (incomingCallTimer) clearTimeout(incomingCallTimer)
    incomingCallTimer = setTimeout(() => {
        incomingCall.value = null
    }, 30000)
}

const messagePreviewVisible = computed(() => Boolean(message.value.includes('{{entity:')))
const draftPreviewMessage = computed(() => ({
    message: message.value.includes('{{entity:') ? message.value : '',
    entityRefs: entityRefs.value
}))
const activeRecipientUserId = computed(() => activeConversation.value?.conversationKind === 'direct' ? participantUserId(activeConversation.value) : '')
const recipientLimitedRefs = computed(() => entityRefs.value.filter(ref => ref.recipientHasAccess === false))
const localizedEntityTypeLabel = (type) => {
    const candidates = [
        `support.entityTypeLabels.${type}`,
        `entities.${type}`,
        `common.${type}`
    ]
    for (const key of candidates) {
        const translated = t(key)
        if (translated !== key) return translated
    }
    return type
}

const newChatUserOptions = computed(() => newChatUsers.value)

const displayConversations = computed(() => supportChatStore.conversations
    .filter(conversation => conversation.conversationKind === 'direct' || conversation.conversationKind === 'group'))

const conversationSections = computed(() => {
    const direct = []
    const group = []
    for (const conversation of displayConversations.value) {
        (conversation.conversationKind === 'group' ? group : direct).push(conversation)
    }
    return [
        { key: 'direct', label: t('support.sectionDirect'), conversations: direct },
        { key: 'group', label: t('support.sectionGroups'), conversations: group }
    ].filter(section => section.conversations.length)
})

const isActiveConversation = (conversation) => activeConversation.value?.conversationKey === conversation.conversationKey

const conversationSubtitle = computed(() => {
    const conversation = activeConversation.value
    if (!conversation) return ''
    if (conversation.conversationKind === 'group') {
        return t('support.membersCount', { count: (conversation.participants || []).length })
    }
    if (conversation.conversationKind === 'direct' && participantOnline(conversation)) {
        return t('support.online')
    }
    return ''
})

const canDeleteActiveGroup = computed(() => {
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'group') return false
    if (conversation.groupCreatorId && String(conversation.groupCreatorId) === String(currentUserId.value)) return true
    const organizationId = String(authStore.organizationData?._id || authStore.userData?.organizationId || '')
    return (authStore.userData?.memberships || []).some(membership => (
        String(membership?.organizationId) === organizationId && membership?.owner === true
    ))
})

const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendMessage()
    }
}

const handleTypingInput = () => {
    if (!activeConversationKey.value || typingSendTimer) return
    typingSendTimer = setTimeout(() => {
        typingSendTimer = null
        const conversationKey = activeConversationKey.value
        if (!conversationKey || !message.value.trim()) return
        $fetch('/api/support/typing', {
            method: 'POST',
            body: { conversationKey }
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

const sendMessage = async () => {
    if ((!message.value.trim() && !entityRefs.value.length) || !activeConversation.value) return

    isLoading.value = true

    try {
        const payloadEntityRefs = entityRefs.value.map(ref => ({
            type: ref.type,
            id: ref.id,
            label: ref.label
        }))
        await $fetch('/api/support/messages', {
            method: 'POST',
            body: {
                message: message.value,
                recipientUserId: activeConversation.value.conversationKind === 'direct' ? participantUserId(activeConversation.value) : null,
                conversationKey: activeConversation.value.conversationKind === 'group' ? activeConversation.value.conversationKey : null,
                entityRefs: payloadEntityRefs
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

const { onlineUserIds } = useConnections()

const participantOnline = (conversation) => {
    const participant = conversation?.conversationKind === 'direct'
        ? participantUserId(conversation)
        : null
    return Boolean(participant && onlineUserIds.value.has(participant))
}

const activeConversationKey = computed(() => activeConversation.value?.conversationKey || null)

const loadConversation = async () => {
    if (!activeConversation.value) return
    const token = ++conversationLoadToken
    messages.value = []
    const isGroup = activeConversation.value.conversationKind === 'group'
    const recipientUserId = isGroup ? null : participantUserId(activeConversation.value)
    try {
        const snapshot = await $fetch('/api/support/messages', {
            query: isGroup
                ? { conversationKey: activeConversation.value.conversationKey }
                : (recipientUserId ? { recipientUserId } : {})
        })
        if (token !== conversationLoadToken) return
        messages.value = snapshot?.data || []
        currentUserId.value = snapshot?.currentUserId || currentUserId.value
        if (snapshot?.conversation?.kind && activeConversation.value) {
            activeConversation.value.conversationKey = snapshot.conversation.conversationKey || activeConversation.value.conversationKey
            activeConversation.value.conversationKind = snapshot.conversation.kind
            if (snapshot.conversation.name && !activeConversation.value.groupName) {
                activeConversation.value.groupName = snapshot.conversation.name
            }
        }
        await supportChatStore.markRead(activeConversation.value.conversationKey)
    } catch (error) {
        console.error('Failed to load conversation:', error)
    } finally {
        if (token === conversationLoadToken) {
            await nextTick()
            scrollToBottom()
        }
    }
}

watch(
    [activeConversationKey, supportDialog, () => props.embedded],
    ([key, dialogOpen, embedded]) => {
        if (unsubscribeConversation) {
            unsubscribeConversation()
            unsubscribeConversation = null
        }
        if (!key || !(dialogOpen || embedded)) return
        unsubscribeConversation = useConnections().subscribe(`conversation:${key}`, (payload) => {
            if (payload?.type === 'typing') {
                receiveTyping(payload)
                return
            }
            if (payload?.type === 'call') {
                receiveCallInvite(payload)
                return
            }
            if (payload?.type !== 'message') return
            messages.value.push(payload.message)
            supportChatStore.markRead(key)
            nextTick().then(scrollToBottom)
        })
        loadConversation()
    }
)

watch(() => messages.value.length, (newLength, oldLength) => {
    if (!newLength || !oldLength || newLength <= oldLength) return
    nextTick().then(() => {
        if (messagesContainer.value?.lastElementChild) {
            enterOnce(messagesContainer.value.lastElementChild)
        }
    })
})

onMounted(() => {
    if (authStore.userIsSet) supportChatStore.connect()
    loadEntityTypes()
    if (chatTarget.value?.userId) openDirectTarget()
})
onBeforeUnmount(() => {
    if (unsubscribeConversation) {
        unsubscribeConversation()
        unsubscribeConversation = null
    }
    if (typingResetTimer) clearTimeout(typingResetTimer)
    if (typingSendTimer) clearTimeout(typingSendTimer)
    if (incomingCallTimer) clearTimeout(incomingCallTimer)
})

watch(chatTarget, () => {
    if (supportDialog.value && chatTarget.value?.userId) openDirectTarget()
}, { deep: true })

watch(supportDialog, (isOpen) => {
    if (isOpen && chatTarget.value?.userId) openDirectTarget()
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
            label: type.labelKey ? t(type.labelKey) : localizedEntityTypeLabel(type.value),
            value: type.value
        }))
        const currentTypeAvailable = entityTypeOptions.value.some(option => option.value === entityDraft.value.type)
        entityDraft.value.type = currentTypeAvailable ? entityDraft.value.type : (entityTypeOptions.value[0]?.value || '')
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
            query: {
                type: entityDraft.value.type,
                recipientUserId: activeRecipientUserId.value || undefined
            }
        })
    } catch (error) {
        console.error('Failed to load entity options:', error)
        entityOptions.value = []
    } finally {
        entityOptionsLoading.value = false
    }
}

const hydrateEntityRefs = async (refs = []) => {
    const hydrated = []
    for (const ref of refs) {
        if (!ref?.type || !ref?.id) continue
        try {
            const options = await $fetch('/api/support/entity-options', {
                query: {
                    type: ref.type,
                    q: ref.id,
                    recipientUserId: activeRecipientUserId.value || undefined
                }
            })
            const option = (options || []).find(item => item.value === ref.id)
            hydrated.push({
                ...ref,
                label: option?.label || ref.label || ref.id,
                entity: option?.entity || ref.entity || null,
                recipientHasAccess: option?.recipientHasAccess
            })
        } catch (error) {
            console.error('Failed to hydrate chat entity ref:', error)
            hydrated.push(ref)
        }
    }
    return hydrated
}

const insertEntityRef = () => {
    const selected = entityOptions.value.find(option => option.value === entityDraft.value.id)
    if (!selected) return
    if (!entityRefs.value.some(ref => ref.type === selected.type && ref.id === selected.value)) {
        entityRefs.value.push({
            type: selected.type,
            id: selected.value,
            label: selected.label,
            entity: selected.entity || null,
            recipientHasAccess: selected.recipientHasAccess
        })
    }
    entityDraft.value.id = ''
}

const removeEntityRef = (targetRef) => {
    entityRefs.value = entityRefs.value.filter(ref => !(ref.type === targetRef.type && ref.id === targetRef.id))
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

const openGroupDialog = async () => {
    groupName.value = ''
    groupMemberIds.value = []
    groupDialog.value = true
    if (!newChatUsers.value.length) await loadNewChatUsers()
}

const createGroup = async () => {
    const name = groupName.value.trim()
    if (!name) return
    groupSaving.value = true
    try {
        const group = await $fetch('/api/support/groups', {
            method: 'POST',
            body: { name, participantIds: groupMemberIds.value }
        })
        groupDialog.value = false
        await supportChatStore.refresh()
        openGroupConversation(`group:${group._id}`)
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 })
    } finally {
        groupSaving.value = false
    }
}

const openGroupConversation = (conversationKey) => {
    const summary = supportChatStore.conversations.find(item => item.conversationKey === conversationKey)
    if (!summary) return
    activeConversation.value = summary
    supportChatStore.markRead(conversationKey)
}

// Embedded call surfaces pin this chat to one conversation through the
// `conversation-key` prop: it resolves from the inbox summaries and falls
// back to a synthesized thread (the message snapshot fills kind/name).
// Navigating back releases the pin so inbox refreshes do not reopen it.
let conversationKeyTarget = ''
watch(() => props.conversationKey, (key) => {
    conversationKeyTarget = key || ''
}, { immediate: true })
watch([() => props.conversationKey, () => supportChatStore.conversations], ([key]) => {
    if (!key || !props.embedded || conversationKeyTarget !== key) return
    const current = activeConversation.value
    // Pin only while nothing is open or the current thread is a synthesized
    // stub: once resolved (or after the user navigated elsewhere in this
    // rail), inbox refreshes must not yank the view back.
    if (!current || (!current.resolved && current.conversationKey === key)) {
        openConversationByKey(key)
    }
}, { immediate: true })

// Function declaration: the immediate watcher below runs during setup and
// must be able to call this before its textual position.
function openConversationByKey(key) {
    const summary = supportChatStore.conversations.find(item => item.conversationKey === key)
    if (summary) {
        activeConversation.value = { ...summary, resolved: true }
        supportChatStore.markRead(key)
        return
    }
    if (key.startsWith('group:')) {
        activeConversation.value = {
            conversationKey: key,
            conversationKind: 'group',
            participants: [],
            lastMessage: '',
            entityRefs: []
        }
        return
    }
    if (key.startsWith('direct:')) {
        activeConversation.value = {
            conversationKey: key,
            conversationKind: 'direct',
            participants: key.split(':').slice(1),
            lastMessage: '',
            entityRefs: []
        }
    }
}

const requestDeleteGroup = () => {
    confirm.require({
        message: t('support.groupDeleteConfirm'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: deleteActiveGroup
    })
}

const deleteActiveGroup = async () => {
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'group') return
    try {
        await $fetch(`/api/support/groups/${encodeURIComponent(String(conversation.groupId || conversation.conversationKey.slice('group:'.length)))}`, { method: 'DELETE' })
        showInbox()
        await supportChatStore.refresh()
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 })
    }
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
    conversationKeyTarget = ''
}

const closeChat = () => {
    showInbox()
    if (!props.embedded) supportDialog.value = false
}

const openChatsPage = () => {
    closeChat()
    navigateTo('/chats')
}

const openDirectTarget = async () => {
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
    const draftRefs = (chatTarget.value.draftEntityRefs || [])
        .filter(ref => ref?.type && ref?.id)
        .map(ref => ({
            type: ref.type,
            id: ref.id,
            label: ref.label || ref.id,
            entity: ref.entity || null
        }));
    entityRefs.value = await hydrateEntityRefs(draftRefs);
}

const conversationLabel = (conversation) => {
    if (conversation?.conversationKind === 'group') {
        return conversation?.groupName || t('support.sectionGroups')
    }
    return conversation?.participant?.identity?.name
        || conversation?.participant?.name
        || (conversation?.conversationKind === 'support' ? t('support.chatTitle') : t('common.user'))
}

const conversationAvatar = (conversation) => conversation?.participant?.avatarUrl
    || conversation?.participant?.data?.avatarUrl
    || ''

const conversationPreviewMessage = (conversation) => ({
    message: conversation.lastMessage || '',
    entityRefs: conversation.entityRefs || [],
    senderUserId: conversation.senderUserId || ''
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
/*
 * Container-driven layout: the two-pane chats split responds to the chat
 * surface's own width, not the viewport, so the workspace tab behaves in
 * narrow or split panes — below 44rem the thread takes the full surface
 * (mobile-like column), above it the inbox rail sits beside it. The
 * container is the host wrapper because a container query cannot restyle
 * the container element itself: the row direction belongs to .chat-page,
 * one level inside.
 */
.chat-host {
  container-type: inline-size;
}

.chat-page--thread .chat-inbox--rail {
  display: none;
}

.chat-empty {
  display: none;
}

@container (min-width: 44rem) {
  .chat-page {
    flex-direction: row;
  }

  .chat-inbox--rail {
    flex: none;
    width: 20rem;
  }

  .chat-page--thread .chat-inbox--rail {
    display: flex;
  }

  .chat-page--thread .chat-back {
    display: none;
  }

  .chat-empty {
    display: flex;
  }
}
</style>
