import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import { assistantMentioned } from '~/shared/assistant-mention.js'
import { conversationKeyForRoom } from '#shared/call-rooms.js'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { stripInstanceTokens } from '#shared/instance-tokens.js'
import { collectActionInputFields, initialPromptValue, promptData, promptedFields } from '~/components/generated/action-inputs.js'
import { isGeneratedSurfaceAction } from '~/utils/action-visibility.js'
import { generatedActionLabel } from '~/utils/generated-labels.js'
import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState'
import { useConnections } from '~/composables/useConnections.js'
import { usePayloadUpload } from '~/composables/usePayloadUpload.js'
import { useInstancesStore } from '~/stores/instances'
import { useRegistryStore } from '~/stores/registry'
import { detailRouteForInstance } from '~/components/generated/instance-detail-routing.js'
import { openInstanceChat } from '~/utils/instance-chat.js'
import { useEntityPopup } from '~/composables/useEntityPopup'
import { openChatInWorkspaceTab } from '~/utils/chat-workspace-open.js'
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js'
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js'
import { resolveSourceFilters } from '~/utils/generated-screen-source.js'
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js'
import { useEnterExit, enterOnce } from '~/composables/useMotion.js'
import { useFileTypeView } from '~/composables/useFileTypeView.js'
import { instanceRecordTitle } from '~/utils/instance-shape.js'
import { generatedEntityLabel } from '~/utils/generated-labels.js'
import { useChatFileUpload } from '~/composables/useChatFileUpload.js'
import { useDirectoryUserSearch } from '~/composables/useDirectoryUserSearch.js'
import {
    chatFileChildCandidates,
    chatFileAccept,
    chatFileCandidatesForFile,
    chatAttachmentKind,
    chatAttachmentUrl,
    chatVoiceFileCandidate
} from '~/utils/chat-file-targets.js'
import { useAuthStore } from '~/stores/auth'
import { useSupportChatStore } from '~/stores/supportChat'
import { useAgentBotsStore } from '~/stores/agentBots'
import { useCallsStore } from '~/stores/calls'
import { useCallRouting } from '~/composables/useCallRouting.js'
import { useVoiceRecorder } from '~/components/chat/useVoiceRecorder.js'

// The chat column's state core: history, realtime reconcile, composer,
// staging, strip, calls, dialogs — one thread object shared by the chat
// component family.
export function useChatThread(props, emit) {

const { t, te } = useI18n()
const confirm = useConfirm()
const toast = useToast()
const supportDialog = useSupportDialog()
const chatTarget = useSupportChatTarget()
const { open: openEntityPopup, openable: entityPopupOpenable } = useEntityPopup()
const authStore = useAuthStore()
const supportChatStore = useSupportChatStore()

const message = ref('')
const messages = ref([])
const messagesContainer = ref(null)
const MESSAGES_PAGE_SIZE = 50
const hasMoreMessages = ref(false)
const loadingOlder = ref(false)
const currentUserId = ref(authStore.userData?.id || authStore.userData?.userId || null)
let unsubscribeConversation = null
let conversationLoadToken = 0
const instanceRefs = ref([])
const attachmentPicker = ref(null)
const pendingCreateAction = ref(null)
const createPromptVisible = ref(false)
const createPromptValues = reactive({})
const createPromptOptions = reactive({})
// File creators ride the generic prompt: the `file` control uploads to
// the files bucket and the construct path mints a file instance.
const { uploadingPayloadField, setPayloadInputEl, payloadInputEl, uploadPayloadFile, pendingPayloadUpload } = usePayloadUpload(
  createPromptValues,
  { onError: error => toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message, life: 8000 }) }
)
const executingCreate = ref(false)
const activeConversation = ref(null)
// The organization AI: the panel button lives in the inbox header; when a
// group or instance thread is open the panel joins the AI to exactly that
// conversation.
const agentBots = useAgentBotsStore()
const botPanelVisible = ref(false)
const botPanelConversationKey = computed(() => {
    const conversation = activeConversation.value
    if (!conversation || !['group', 'instance'].includes(conversation.conversationKind)) return ''
    return conversation.conversationKey || ''
})
const isBotDirectRow = (conversation) => {
    if (conversation?.conversationKind !== 'direct' || !agentBots.ai?.id) return false
    return String(participantUserId(conversation)) === String(agentBots.ai.id)
}
const isDirectWithBot = computed(() => isBotDirectRow(activeConversation.value))
// A 1:1 room with the assistant: a two-participant group, a draft, or a
// direct thread.
const isAiChatRow = (conversation) => {
    if (conversation?.conversationKind !== 'group') return false
    const assistantId = agentBots.ai?.id
    if (!assistantId) return false
    const participants = (conversation.participants || []).map(String)
    return participants.length === 2 && participants.includes(String(assistantId))
}
const isAiOnlyRoom = computed(() => {
    const conversation = activeConversation.value
    if (!conversation) return false
    if (conversation.agentDraft || isDirectWithBot.value) return true
    return isAiChatRow(conversation)
})
// Instance thread view: the children toggle beside the title switches
// between messages linked to the instance itself and the composed subtree
// view (the server default). The composer link target is the latest child
// chip by default and falls back to the composed instance when nothing is
// selected.
const includeChildren = ref(true)
const composerInstance = ref(null)
let composerInstanceTouched = false
// Reply state: quoted target for the next send, transient swipe arming, and
// the anchored scroll highlight after jumping to a quoted message.
const replyTo = ref(null)
const swipeArmed = ref(new Set())
const highlightKey = ref('')
const loadingAnchor = ref(false)
const instances = useInstancesStore()
const registry = useRegistryStore()
const newChatDialog = ref(false)
const newChatUsers = ref([])
const newChatUsersLoading = ref(false)
const groupDialog = ref(false)
const groupName = ref('')
const groupMemberIds = ref([])
const groupSaving = ref(false)
const typingName = ref('')
const typingIndicatorRef = ref(null)
// The agent's live run while it works (server `bot_activity` /
// `bot_stream` events): `{ userId, name, steps, answer }` or null, the
// steps being the run's chronology so far. The persisted message replaces
// it.
const agentActivity = ref(null)
// The run's suspended question (server `bot_question` / `bot_question_end`
// events): `{ question, options }` while the run waits for the room's
// answer — rendered at the composer, options send as one-tap replies.
const agentQuestion = ref(null)
const sendAgentAnswer = (option) => {
    if (!agentQuestion.value) return
    message.value = String(option)
    sendMessage()
}
// The live run's pre-step presence: the assistant rides the typing
// line (owner direction — SPEC agent access) until the run has steps
// or an answer to show; after that the activity block is the presence.
const agentTypingName = computed(() => {
    const activity = agentActivity.value
    if (!activity || (activity.steps || []).length || activity.answer) return ''
    return activity.name || t('support.bots.title')
})
const receiveAgentActivity = (payload, mutate) => {
    if (!agentActivity.value || agentActivity.value.userId !== payload.userId) {
        agentActivity.value = { userId: payload.userId, name: payload.name || '', steps: [], answer: '' }
    }
    mutate(agentActivity.value)
    // A live run never yanks the transcript to the bottom while it works:
    // the room reads at its own pace until the reply lands.
}
// The composer's stop control: a run live in this room can be ended early;
// the answer produced so far is what stays.
const agentRunLive = computed(() => Boolean(agentActivity.value || agentQuestion.value))
// Between the stop click and the run's true end, the aborting run's last
// reconcile events would resurrect the stream card — once the room says
// stop, bot events are ignored until the run ends (stream end or the
// persisted message).
const agentStopping = ref(false)
const stopAgentRun = async () => {
    const key = activeConversation.value?.conversationKey
    if (!key) return
    agentActivity.value = null
    agentQuestion.value = null
    agentStopping.value = true
    await $fetch('/api/agent-bots/stop', { method: 'POST', body: { conversationKey: key } }).catch(() => {})
}
let typingResetTimer = null
let typingSendTimer = null

const typingActive = computed(() => Boolean(typingName.value || agentTypingName.value))
useEnterExit(typingIndicatorRef, typingActive, { y: 4, duration: 0.15 })
const callRoom = ref('')
const callDialog = ref(false)
const callHeaderLabel = computed(() => {
    if (!callDialog.value || !callRoom.value || !activeConversation.value) return t('call.title')
    return conversationKeyForRoom(callRoom.value) === activeConversation.value.conversationKey
        ? conversationLabel(activeConversation.value)
        : t('call.title')
})
// The call line machine owns ringing: invites for the open conversation come
// from the shared calls store, so accepting or declining anywhere clears the
// ring in every surface (the old local banner kept ringing after an accept
// elsewhere). The ongoing-room banner also survives joining and leaving.
const callsStore = useCallsStore()
const { isMobileViewport, openCallInWorkspaceTab } = useCallRouting()
const ongoingCallRoom = computed(() => callsStore.activeRoomForConversation(activeConversationKey.value || ''))
const conversationInvite = computed(() => callsStore.incoming.find(invite => (
    invite.conversationKey && invite.conversationKey === activeConversationKey.value
)) || null)
const joinOngoingCall = () => {
    const room = ongoingCallRoom.value?.room
    if (room) openCallSurface(room)
}
const joinConversationCall = () => {
    const invite = conversationInvite.value
    if (!invite?.room) return
    callsStore.dismissIncoming(invite.room)
    openCallSurface(invite.room)
}

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

// The conversation is an execution point: the room picks the model its
// AI runs on, chosen from what the org's chat endpoints actually serve —
// the profile pins the endpoint, the row stores both. A direct chat with
// the AI is the same point through a profile-only row (no membership
// needed); blank falls back to the org chat route.
const roomAI = computed(() => {
    const conversation = activeConversation.value;
    if (!conversation || !agentBots.canChat || !agentBots.ai) return null;
    // A draft carries the model choice on the conversation object itself;
    // it travels to the room when the first send materializes it.
    if (conversation.agentDraft) {
        return { ...agentBots.ai, subscribed: true, profile: conversation.profile || '', model: conversation.model || '' };
    }
    if (['group', 'instance'].includes(conversation.conversationKind)) {
        return agentBots.ai.subscribed ? agentBots.ai : null;
    }
    if (conversation.conversationKind === 'direct') {
        return String(agentBots.ai.id) === String(participantUserId(conversation)) ? agentBots.ai : null;
    }
    return null;
});
// Rows pair profile+model; the NUL separator keeps one primitive value for
// the select while both travel to the row.
const MODEL_ROW_SEPARATOR = '\u0000';
const modelRowValue = (profile, model) => `${profile || ''}${MODEL_ROW_SEPARATOR}${model || ''}`;
// The room's model rows: what the chat endpoints actually serve, or each
// profile's own configured model when the listing is unavailable. A row
// stored on the subscription that the listing no longer carries stays
// offered, so a pin never renders blank.
const conversationModelRows = computed(() => {
    const base = agentBots.chatModels.length
        ? agentBots.chatModels
        : agentBots.chatProfiles.filter(row => row.model).map(row => ({ profile: row.id, model: row.model }));
    const rows = [...base];
    const pin = roomAI.value;
    if (pin?.model && !rows.some(row => row.profile === (pin.profile || '') && row.model === pin.model)) {
        rows.push({ profile: pin.profile || '', model: pin.model });
    }
    return rows.map(row => ({
        label: row.model,
        value: modelRowValue(row.profile, row.model),
        model: row.model,
        profile: row.profile || ''
    }));
});
const conversationModelOptions = computed(() => conversationModelRows.value);
// The select shows while the room calls its AI: always in the AI's own
// chats, in multi-human rooms only while the draft names the assistant
// (the shared wake gate).
const modelSelectVisible = computed(() => {
    if (!activeConversation.value || !roomAI.value || !conversationModelOptions.value.length) return false
    if (isAiOnlyRoom.value) return true
    return assistantMentioned(message.value, roomAI.value.name)
});
// The select never sits blank: the room's pin when it carries a model,
// else the model the org chat route would actually serve.
const conversationModel = computed(() => {
    const pin = roomAI.value;
    if (pin?.model) return modelRowValue(pin.profile, pin.model);
    const rows = conversationModelRows.value;
    const effective = agentBots.chatRouteModel
        ? rows.find(row => row.model === agentBots.chatRouteModel) || { profile: '', model: agentBots.chatRouteModel }
        : rows[0];
    return effective ? modelRowValue(effective.profile, effective.model) : '';
});
const setConversationModel = async (pin) => {
    const conversation = activeConversation.value
    if (!conversation) return
    const [profile, model] = String(pin || '').split(MODEL_ROW_SEPARATOR)
    // A draft's model choice is local state until the room exists; the
    // first send carries it into the created room.
    if (conversation.agentDraft) {
        activeConversation.value = { ...conversation, profile: profile || '', model: model || '' }
        return
    }
    if (!conversation.conversationKey || !roomAI.value) return
    await agentBots.setConversationProfile(conversation.conversationKey, profile || '', model || '')
}

// Pane-hosted chats open calls as workspace tabs; mobile surfaces keep the
// full-screen dialog; every other surface routes through the shared call
// routing (home workspace tab, floating window fallback).
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
    if (isMobileViewport()) {
        callRoom.value = room
        callDialog.value = true
        return
    }
    openCallInWorkspaceTab(room)
}

const messagePreviewVisible = computed(() => Boolean(message.value.includes('{{instance:')))
const draftPreviewMessage = computed(() => ({
    message: message.value.includes('{{instance:') ? message.value : '',
    instanceRefs: instanceRefs.value
}))
const activeRecipientUserId = computed(() => activeConversation.value?.conversationKind === 'direct' ? participantUserId(activeConversation.value) : '')
const recipientLimitedRefs = computed(() => instanceRefs.value.filter(ref => ref.recipientHasAccess === false))
const localizedTypeIdLabel = (type) => {
    const candidates = [
        `support.typeIdLabels.${type}`,
        `instances.${type}`,
        `common.${type}`
    ]
    for (const key of candidates) {
        const translated = t(key)
        if (translated !== key) return translated
    }
    // The served type's own name is the last named fallback — the raw type
    // id is code-only and never renders (the no-technical-ids rule).
    return registry.typeRecord(type)?.name || t('common.unnamed')
}


// Folder chips scope the flat inbox (SPEC): All, Personal (person and
// group chats), and one chip per organization with instance chats.
// Instance rows join the organization row rooting their parentKey chain
// — the same ancestry the server ships; rows whose lineage carries no
// organization chat row belong to the active organization (the inbox
// query is org-scoped server-side).
const selectedFolder = ref('all')
const orgRootOf = (conversation) => {
    const guard = new Set()
    let current = conversation
    while (current?.conversationKind === 'instance' && !guard.has(current.conversationKey)) {
        guard.add(current.conversationKey)
        if (current.typeId === 'organization') return current
        current = supportChatStore.conversations.find(item => item.conversationKey === current.parentKey) || null
    }
    return null
}
const folderKeyOf = (conversation) => {
    if (conversation.conversationKind !== 'instance') return 'personal'
    const root = orgRootOf(conversation)
    if (root) return root.conversationKey
    const organizationId = String(authStore.organizationData?._id || authStore.userData?.organizationId || '')
    return `instance:organization:${organizationId}`
}
// Archived conversations live behind the inbox header toggle; the default
// list hides them.
const showArchived = ref(false)

// The header search: a plain client-side filter over the rail's rows —
// title and last message, case-insensitive.
const inboxSearch = ref('')
const searchHit = (conversation) => {
    const query = inboxSearch.value.trim().toLowerCase()
    if (!query) return true
    return conversationLabel(conversation).toLowerCase().includes(query)
        || String(conversation.lastMessage || '').toLowerCase().includes(query)
}

// Rows in play for the current archive view, before folder and search
// narrow them — the folder strip derives from this set so searching never
// reshapes the chips.
const scopeConversations = computed(() => supportChatStore.conversations
    .filter(conversation => {
        if (Boolean(conversation.archived) !== showArchived.value) return false
        return ['direct', 'group'].includes(conversation.conversationKind)
            || conversation.conversationKind === 'instance'
    }))

const orgFolders = computed(() => {
    const folders = new Map()
    for (const conversation of [...scopeConversations.value].sort(byLatestActivity)) {
        if (conversation.conversationKind !== 'instance') continue
        const key = folderKeyOf(conversation)
        if (folders.has(key)) continue
        const root = orgRootOf(conversation)
        folders.set(key, {
            key,
            label: root
                ? conversationLabel(root)
                : (authStore.organizationData?.identity?.name || localizedTypeIdLabel('organization')),
            icon: instances.iconFor('organization')
        })
    }
    return [...folders.values()]
})

const inboxFolders = computed(() => [
    { key: 'all', label: t('support.folderAll') },
    ...(orgFolders.value.length ? [{ key: 'personal', label: t('support.folderPersonal') }] : []),
    ...orgFolders.value
])

const folderHit = (conversation) => {
    if (selectedFolder.value === 'all') return true
    return folderKeyOf(conversation) === selectedFolder.value
}

const displayConversations = computed(() => scopeConversations.value
    .filter(folderHit)
    .filter(searchHit))

// One unified inbox: person, group, and instance chats share a single
// flat list; pinned rows lead, everything else follows the latest
// activity.
const byLatestActivity = (left, right) => {
    if (Boolean(right.pinned) !== Boolean(left.pinned)) return right.pinned ? 1 : -1
    const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0
    const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0
    return rightTime - leftTime
}
const conversationSections = computed(() => [...displayConversations.value].sort(byLatestActivity))



const isActiveConversation = (conversation) => activeConversation.value?.conversationKey === conversation.conversationKey

const instanceConversationIcon = (conversation) => (
    instances.iconFor(conversation?.typeId)
)

// The instance thread title links into the instance surface: the generated
// detail route when the process manifest exposes one.
// The instance thread's lineage record drives the header breadcrumbs
// (TraceChain resolves the ancestry and names; unreadable instances simply
// render no chain).
const chatInstanceRecord = ref(null)
watch([() => activeConversation.value?.conversationKey, () => activeConversation.value?.instanceId], async () => {
    chatInstanceRecord.value = null
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'instance' || !conversation.instanceId) return
    chatInstanceRecord.value = await instances.resolveReadableReference(
        conversation.typeId,
        String(conversation.instanceId),
        { silent: true }
    )
}, { immediate: true })

const groupParticipantIds = computed(() => (
    (activeConversation.value?.participants || []).map(String).filter(Boolean)
))

// Group members: an overlapping avatar stack in the header (resolved once
// through the readable-reference seam) and the full member list as a popup
// of user chips.
const membersList = ref(null)
const toggleMembersList = (event) => {
    membersList.value?.toggle(event)
}
const groupParticipants = ref([])
watch(groupParticipantIds, async (ids) => {
    if (!ids.length) {
        groupParticipants.value = []
        return
    }
    groupParticipants.value = await Promise.all(ids.map(async (id) => {
        const record = await instances.resolveReadableReference('user', String(id), { silent: true })
        return {
        searchTypeOptions,
        scrollToBottomFromControl,
        waitingMessages,
        atBottom,
        closeSearch,
        toggleSearch,
        searchParticipants,
        seenByRows,
        messageSeen,
        searchVisible,
        userNames,
        ownCursorAtOpen,
        readCursors,
            id: String(id),
            name: record?.name || record?.identity?.name || '',
            avatarUrl: record?.fields?.avatarUrl || record?.data?.avatarUrl || '',
            bot: Boolean(record?.fields?.bot || record?.data?.bot)
        }
    }))
}, { immediate: true })

const conversationSubtitle = computed(() => {
    const conversation = activeConversation.value
    if (!conversation) return ''
    if (conversation.conversationKind === 'direct' && participantOnline(conversation)) {
        return t('support.online')
    }
    return ''
})

const canDeleteActiveGroup = computed(() => {
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'group' || !conversation?.conversationKey) return false
    if (conversation.groupCreatorId && String(conversation.groupCreatorId) === String(currentUserId.value)) return true
    const organizationId = String(authStore.organizationData?._id || authStore.userData?.organizationId || '')
    return (authStore.userData?.memberships || []).some(membership => (
        String(membership?.organizationId) === organizationId && membership?.owner === true
    ))
})

// The composer field sits inside the composer's own rounded surface: the
// Textarea's input chrome (border, fill, focus ring) goes transparent so
// the surface owns the visual. Inline pt outranks every stylesheet rule —
// the app.vue bottom-bar adaptation precedent.
const composerTextareaPt = {
    root: { style: { background: 'transparent', borderColor: 'transparent', boxShadow: 'none' } }
}

// The assistant address is the multi-human room's wake gate.
const composerField = ref(null)
const mentionState = ref(null)
const MENTION_ROWS_MAX = 8
const mentionCandidates = computed(() => {
    const rows = []
    const ai = roomAI.value
    if (ai?.name) rows.push({ id: String(ai.id), name: ai.name, avatarUrl: ai.avatarUrl || '', bot: true })
    for (const member of groupParticipants.value) {
        if (!member.name) continue
        if (String(member.id) === String(currentUserId.value)) continue
        if (ai && String(member.id) === String(ai.id)) continue
        rows.push({ ...member, bot: false })
    }
    return rows
})
const mentionRows = computed(() => {
    const state = mentionState.value
    if (!state) return []
    const query = state.query.trim().toLowerCase()
    return mentionCandidates.value
        .filter(row => row.name.toLowerCase().includes(query))
        .slice(0, MENTION_ROWS_MAX)
})
const composerCaret = () => {
    const el = composerField.value?.$el
    return Number.isFinite(el?.selectionStart) ? el.selectionStart : message.value.length
}
const updateMention = () => {
    const caret = composerCaret()
    const token = message.value.slice(0, caret).match(/(^|\s)@([\p{L}\p{N}_ .-]*)$/u)
    mentionState.value = token
        ? { start: caret - token[2].length - 1, query: token[2], index: 0 }
        : null
}
const applyMention = (row) => {
    const state = mentionState.value
    if (!state) return
    const caret = composerCaret()
    const insert = `@${row.name.trim()} `
    message.value = message.value.slice(0, state.start) + insert + message.value.slice(caret)
    mentionState.value = null
    nextTick(() => {
        const el = composerField.value?.$el
        if (!el) return
        el.focus()
        el.setSelectionRange(state.start + insert.length, state.start + insert.length)
    })
}

const handleKeyDown = (event) => {
    if (mentionState.value && mentionRows.value.length) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const count = mentionRows.value.length
            const step = event.key === 'ArrowDown' ? 1 : -1
            mentionState.value.index = (mentionState.value.index + step + count) % count
            return
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            applyMention(mentionRows.value[mentionState.value.index])
            return
        }
        if (event.key === 'Escape') {
            event.preventDefault()
            mentionState.value = null
            return
        }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendMessage()
    }
}

// Clipboard images stage through the same path as picked files (caps,
// instance-chat gating, previews); plain-text paste falls through.
const handleComposerPaste = (event) => {
    const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'))
    if (!files.length) return
    event.preventDefault()
    stageChatFiles(files)
}

const handleTypingInput = () => {
    updateMention()
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

    // -- File uploads (support README, Message Attachments) --
    // Staged files send as one message: `attachments[]` descriptors with a
    // per-file `targetTypeId` in instance chats. Common chats accept any
    // file; instance chats only accept files the composer target's
    // declared file children take (the server re-validates every send).
    const pendingFiles = ref([])
    // Files already riding an in-flight send: they keep the staged-chip
    // anatomy (progress bar included) but cannot be retargeted or removed,
    // and a failed send puts them back at the head of `pendingFiles`.
    const outgoingFiles = ref([])
    const composerStagedRows = computed(() => [
        ...outgoingFiles.value.map(item => ({ ...item, outgoing: true })),
        ...pendingFiles.value
    ])
    const ATTACHMENT_LIMIT = 10
    let pendingFileSeq = 0
    // Bumped whenever the staging strips are cleared wholesale (conversation
    // switch, target change): an in-flight send that later fails must not
    // resurrect its files into a different composer.
    let stagedGeneration = 0

    const { typeById: typeViewById } = useFileTypeView()
const { uploadChatFile } = useChatFileUpload()

    // The effective send target: the drilled child chip, else the composed
    // conversation instance. Upload compatibility follows this target.
    const composerTargetType = computed(() => {
        const conversation = activeConversation.value
        if (conversation?.conversationKind !== 'instance') return null
        return composerInstance.value?.type || conversation.typeId
    })

    const chatFileCandidates = computed(() => (!composerTargetType.value
        ? []
        : chatFileChildCandidates({
            typeRecord: typeViewById(composerTargetType.value),
            typeById: typeViewById
        })))

    // A strict instance target is a loaded non-party type record: person
    // conversations and party-target chats (the organization chat) take
    // plain uploads; strict targets gate files (and voice) on accepting
    // children. The server's materialization rule mirrors this.
    const strictInstanceTarget = computed(() => {
        if (!composerTargetType.value) return false
        const targetRecord = typeViewById(composerTargetType.value)
        return Boolean(targetRecord) && targetRecord.class !== 'party'
    })

    const instanceChatUploadBlocked = computed(() => strictInstanceTarget.value && !chatFileCandidates.value.length)
    const chatUploadEnabled = computed(() => Boolean(activeConversation.value) && !instanceChatUploadBlocked.value)
    const chatFileAcceptAttr = computed(() => (instanceChatUploadBlocked.value ? '' : chatFileAccept(chatFileCandidates.value)))

    // Voice follows the same target rule: person/party chats always
    // record; a strict instance chat records only when a candidate child
    // accepts the mimes MediaRecorder produces.
    const voiceRecordingAllowed = computed(() => !strictInstanceTarget.value
        || Boolean(chatVoiceFileCandidate(chatFileCandidates.value)))

    const voiceTargetTypeId = computed(() => (
        composerTargetType.value ? (chatVoiceFileCandidate(chatFileCandidates.value)?.typeId || '') : ''
    ))

    const pendingFileIcon = (pending) => ({
        image: 'pi pi-image',
        video: 'pi pi-video',
        audio: 'pi pi-microphone',
        file: 'pi pi-file'
    }[pending.kind] || 'pi pi-file')

    const formatFileSize = (size = 0) => {
        if (size < 1024) return `${size} B`
        if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
        return `${(size / (1024 * 1024)).toFixed(1)} MB`
    }

    const setPendingTarget = (key, typeId) => {
        pendingFiles.value = pendingFiles.value.map(item => (
            item.key === key ? { ...item, targetTypeId: typeId || '' } : item
        ))
    }

    // The staged file's target identity: the candidate's served type name
    // (bundle `name`), never a raw backend id.
    const pendingTargetLabel = (pending) => (
        pending.candidates.find(candidate => candidate.typeId === pending.targetTypeId)?.label
        || localizedTypeIdLabel(pending.targetTypeId)
    )

    const removePendingFile = (key) => {
        const pending = pendingFiles.value.find(item => item.key === key)
        if (pending?.url) URL.revokeObjectURL(pending.url)
        pendingFiles.value = pendingFiles.value.filter(item => item.key !== key)
    }

    const clearPendingFiles = () => {
        for (const pending of [...pendingFiles.value, ...outgoingFiles.value]) {
            if (pending.url) URL.revokeObjectURL(pending.url)
        }
        pendingFiles.value = []
        outgoingFiles.value = []
        stagedGeneration++
    }

    const stageChatFiles = (files = []) => {
        if (!files.length || !activeConversation.value) return
        const instanceChat = strictInstanceTarget.value
        for (const file of files) {
            if (pendingFiles.value.length >= ATTACHMENT_LIMIT) {
                toast.add({ severity: 'warn', summary: t('common.warning'), detail: t('support.attachmentLimit', { count: ATTACHMENT_LIMIT }), life: 4000 })
                break
            }
            const kind = chatAttachmentKind(file.type || '')
            if (instanceChat) {
                const candidates = chatFileCandidatesForFile(chatFileCandidates.value, { type: file.type, size: file.size })
                if (!candidates.length) {
                    toast.add({ severity: 'warn', summary: t('common.warning'), detail: t('support.fileNotAccepted', { name: file.name }), life: 6000 })
                    continue
                }
                pendingFiles.value = [...pendingFiles.value, {
                    key: `pending-${++pendingFileSeq}`,
                    file,
                    kind,
                    url: kind === 'image' ? URL.createObjectURL(file) : '',
                    candidates,
                    targetTypeId: candidates.length === 1 ? candidates[0].typeId : ''
                }]
                continue
            }
            pendingFiles.value = [...pendingFiles.value, {
                key: `pending-${++pendingFileSeq}`,
                file,
                kind,
                url: kind === 'image' ? URL.createObjectURL(file) : '',
                candidates: [],
                targetTypeId: ''
            }]
        }
    }

    // Drop area: file drags over the thread stage the dropped set through
    // the composer's own attachment flow. The depth counter rides
    // dragenter/leave (children re-fire both), and only file-carrying
    // drags count — text selections and element drags pass through.
    const filesDragDepth = ref(0)
    const dragHasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files')
    const filesDragging = computed(() => filesDragDepth.value > 0 && chatUploadEnabled.value)
    const onFilesDragEnter = (event) => {
        if (!dragHasFiles(event)) return
        filesDragDepth.value += 1
    }
    const onFilesDragOver = (event) => {
        if (!dragHasFiles(event) || !chatUploadEnabled.value) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
    }
    const onFilesDragLeave = (event) => {
        if (!dragHasFiles(event)) return
        filesDragDepth.value = Math.max(0, filesDragDepth.value - 1)
    }
    const onFilesDrop = (event) => {
        if (!dragHasFiles(event) || !chatUploadEnabled.value) return
        filesDragDepth.value = 0
        event.preventDefault()
        stageChatFiles([...(event.dataTransfer?.files || [])])
    }

    // Ambiguous files (several accepting children, no choice yet) block
    // the send until the sender picks a target type.
    const pendingFilesIncomplete = computed(() => pendingFiles.value
        .some(pending => pending.candidates.length > 1 && !pending.targetTypeId))

    const canSendComposerDraft = computed(() => Boolean(
        message.value.trim()
        || instanceRefs.value.length
        || (pendingFiles.value.length && !pendingFilesIncomplete.value)
    ))

    const uploadPendingFile = async (pending) => {
        const stored = await uploadChatFile(pending.file, {
            onProgress: (ratio) => updatePendingProgress(pending.key, ratio)
        });
        return {
            kind: pending.kind,
            fileId: stored.id,
            mimeType: pending.file.type || 'application/octet-stream',
            name: pending.file.name,
            size: pending.file.size,
            ...(pending.targetTypeId ? { targetTypeId: pending.targetTypeId } : {})
        };
    }

    const updatePendingProgress = (key, ratio) => {
        outgoingFiles.value = outgoingFiles.value.map(item => (
            item.key === key ? { ...item, progress: Math.max(item.progress || 0, ratio) } : item
        ));
    }

// Sends detach their draft at click time and chain: the composer stays
// live (typing, staging, even the next send) while uploads run, nothing
// staged meanwhile is discarded when an earlier send settles, and bodies
// still land in send order. A failed send restores exactly what it took.
let sendChain = Promise.resolve()

// The room a fresh AI thread takes its title from: the first message,
// whitespace-collapsed and clipped (an attachment-only opener keeps the
// assistant's own name — the server's fallback).
const agentChatTitle = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 48)

// Resolve a materialized draft into the real room: the key change drives
// the topic subscription, history load, and AI contact decoration — the
// same path an inbox row open takes. Callers pass the draft snapshot so a
// user who navigated away mid-send is never yanked back.
const resolveAgentDraft = async (draft, groupKey) => {
    if (activeConversation.value !== draft) return
    await supportChatStore.refresh()
    const summary = supportChatStore.conversations.find(item => item.conversationKey === groupKey)
    if (summary) {
        activeConversation.value = { ...summary, resolved: true }
        supportChatStore.markRead(groupKey)
    }
}

const sendMessage = () => {
    if (!canSendComposerDraft.value || !activeConversation.value) return

    const sendingFiles = pendingFiles.value
    const sendingText = message.value
    const sendingRefs = [...instanceRefs.value]
    const sendingReply = replyTo.value
    const sendingComposerInstance = composerInstance.value
    const conversation = activeConversation.value
    const sendingGeneration = stagedGeneration
    pendingFiles.value = []
    message.value = ''
    mentionState.value = null
    instanceRefs.value = []
    replyTo.value = null
    outgoingFiles.value = [...outgoingFiles.value, ...sendingFiles]

    const settleFailure = () => {
        if (stagedGeneration !== sendingGeneration) return
        outgoingFiles.value = outgoingFiles.value.filter(item => !sendingFiles.some(sent => sent.key === item.key))
        pendingFiles.value = [...sendingFiles, ...pendingFiles.value]
        if (!message.value.trim()) message.value = sendingText
        instanceRefs.value = [...sendingRefs, ...instanceRefs.value]
        replyTo.value = replyTo.value || sendingReply
    }

    sendChain = sendChain.then(async () => {
        // Files upload first; a failed upload keeps the staged set intact
        // for retry. A draft AI thread materializes only after its
        // payload is real: the room is created with the first message as
        // its title, and the message lands in it.
        const attachments = []
        for (const pending of sendingFiles) {
            attachments.push(await uploadPendingFile(pending))
        }
        let groupKey = conversation.conversationKind === 'group' ? conversation.conversationKey : null
        let createdAgentChat = null
        if (conversation.agentDraft) {
            createdAgentChat = await agentBots.createChat(
                agentChatTitle(sendingText),
                conversation.profile || '',
                conversation.model || ''
            )
            groupKey = createdAgentChat.conversationKey
        }
        await $fetch('/api/support/messages', {
            method: 'POST',
            body: {
                message: sendingText,
                recipientUserId: conversation.conversationKind === 'direct' ? participantUserId(conversation) : null,
                conversationKey: groupKey,
                instance: conversation.conversationKind === 'instance'
                    ? (sendingComposerInstance || {
                        type: conversation.typeId,
                        id: conversation.instanceId
                    })
                    : null,
                parentMessageId: sendingReply?._id || null,
                instanceRefs: sendingRefs.map(ref => ({
                    type: ref.type,
                    id: ref.id,
                    label: ref.label
                })),
                attachments: attachments.length ? attachments : null
            }
        })
        for (const pending of sendingFiles) {
            if (pending.url) URL.revokeObjectURL(pending.url)
        }
        outgoingFiles.value = outgoingFiles.value.filter(item => !sendingFiles.some(sent => sent.key === item.key))
        if (createdAgentChat) await resolveAgentDraft(conversation, groupKey)
    }).catch(error => {
        settleFailure()
        console.error('Failed to send message:', error)
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 6000 })
    })
    return sendChain
}

const { onlineUserIds } = useConnections()

// Voice messages: MediaRecorder capture uploaded into the `files` bucket
// (the §3 Blob home, like every chat attachment), then sent as a message
// whose attachments are one `{ kind: 'audio', fileId, mimeType,
// durationSeconds }` descriptor — in instance chats with the resolved
// audio child as its targetTypeId.
// Voice capture rides the shared recorder; the send tail stays here with
// the composer's drafts and instance targets.
const {
    voiceRecording, voicePaused, recordingElapsed, voiceRecordingSupported,
    formatRecordingDuration, toggleVoiceRecordingPause, startVoiceRecording,
    cancelVoiceRecording, finishVoiceRecording
} = useVoiceRecorder()
const voiceSending = ref(false)
const stopAndSendVoiceRecording = async () => {
    const captured = await finishVoiceRecording()
    if (!captured || !activeConversation.value) return
    const { blob, mimeType, durationSeconds } = captured
    if (!blob.size) return
    voiceSending.value = true
    // The draft detaches at send start, matching the text composer's
    // sends: text typed while the recording uploads belongs to the next
    // message, and a failed voice send restores it.
    const sendingText = message.value
    const sendingReply = replyTo.value
    const conversation = activeConversation.value
    const sendingComposerInstance = composerInstance.value
    const sendingVoiceTargetTypeId = voiceTargetTypeId.value
    message.value = ''
    replyTo.value = null
    try {
        const recorded = new File(
            [blob],
            `voice-message.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`,
            { type: mimeType }
        )
        const uploaded = await uploadChatFile(recorded)
        let groupKey = conversation.conversationKind === 'group' ? conversation.conversationKey : null
        let createdAgentChat = null
        if (conversation.agentDraft) {
            createdAgentChat = await agentBots.createChat(
                agentChatTitle(sendingText),
                conversation.profile || '',
                conversation.model || ''
            )
            groupKey = createdAgentChat.conversationKey
        }
        await $fetch('/api/support/messages', {
            method: 'POST',
            body: {
                message: sendingText,
                recipientUserId: conversation.conversationKind === 'direct' ? participantUserId(conversation) : null,
                conversationKey: groupKey,
                instance: conversation.conversationKind === 'instance'
                    ? (sendingComposerInstance || {
                        type: conversation.typeId,
                        id: conversation.instanceId
                    })
                    : null,
                parentMessageId: sendingReply?._id || null,
                attachments: [{
                    kind: 'audio',
                    fileId: uploaded.id,
                    mimeType,
                    durationSeconds,
                    ...(sendingVoiceTargetTypeId ? { targetTypeId: sendingVoiceTargetTypeId } : {})
                }]
            }
        })
        if (createdAgentChat) await resolveAgentDraft(conversation, groupKey)
    } catch (error) {
        if (!message.value.trim()) message.value = sendingText
        replyTo.value = replyTo.value || sendingReply
        console.error('Failed to send voice message:', error)
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 })
    } finally {
        voiceSending.value = false
    }
}

// Audio transcription: the action rides audio-only voice messages while a
// provider is configured for the caller organization. The transcript is
// private to the caller (stored per user), so the HTTP response is the only
// delivery — no conversation event carries it to other viewers.
const transcriptionAvailable = ref(false)
const transcribingMessageIds = ref(new Set())

// Audio-only voice messages: their visible text is the viewer's private
// transcript (the service stores it per user, never on the shared body —
// only viewers who pressed transcribe see any), rendering under the player
// on the subtle surface regardless of sender. Kind falls back to the MIME
// derivation — stored descriptors and projected events are not guaranteed
// to carry it.
const isAudioOnlyMessage = (messageItem) => (messageItem.attachments || []).length === 1
    && (messageItem.attachments[0].kind || chatAttachmentKind(messageItem.attachments[0].mimeType || '')) === 'audio'

// The bubble's text: the authored body, or — for audio-only voice messages
// carrying none — the viewer's transcript. Instance tokens strip from
// display (refs attach to the message); a body that is tokens only
// renders no bubble. Reply quotes and inbox previews read the authored
// body alone, so private transcripts never leave the transcribing
// viewer's bubble.
const messageBubbleText = (messageItem) => (isAudioOnlyMessage(messageItem) && !String(messageItem.message || '').trim()
    ? String(messageItem.transcript || '')
    : stripInstanceTokens(String(messageItem.message || '')).trim())

const bubbleContentMessage = (messageItem) => ({
    ...messageItem,
    message: messageBubbleText(messageItem)
})

// The transcribe action rides audio-only voice messages that carry no body
// and no viewer transcript yet.
const canTranscribe = (messageItem) => transcriptionAvailable.value
    && isAudioOnlyMessage(messageItem)
    && !String(messageItem.message || '').trim()
    && !messageItem.transcript

// Reply-quote icon for a quoted message's first attachment, by kind —
// replies to images/files must not wear the voice microphone.
const parentAttachmentIcon = (source = {}) => ({
    image: 'pi pi-image',
    video: 'pi pi-video',
    audio: 'pi pi-microphone',
    file: 'pi pi-file'
}[(source?.attachments || [])[0]?.kind] || 'pi pi-file')

const fetchTranscriptionAvailability = async () => {
    try {
        const status = await $fetch('/api/transcription/config')
        transcriptionAvailable.value = Boolean(status?.available)
    } catch (error) {
        transcriptionAvailable.value = false
    }
}

const replaceMessage = (messageItem) => {
    const id = String(messageItem?._id || '')
    if (!id) return
    const index = messages.value.findIndex(item => String(item._id) === id)
    if (index === -1) return
    messages.value = messages.value.map((item, position) => (position === index ? messageItem : item))
}

const transcribeAudioMessage = async (messageItem) => {
    const id = String(messageItem._id)
    if (transcribingMessageIds.value.has(id)) return
    transcribingMessageIds.value = new Set(transcribingMessageIds.value).add(id)
    try {
        replaceMessage(await $fetch(`/api/support/messages/${encodeURIComponent(id)}/transcribe`, { method: 'POST' }))
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 })
    } finally {
        const pending = new Set(transcribingMessageIds.value)
        pending.delete(id)
        transcribingMessageIds.value = pending
    }
}

const participantOnline = (conversation) => {
    const participant = conversation?.conversationKind === 'direct'
        ? participantUserId(conversation)
        : null
    return Boolean(participant && onlineUserIds.value.has(participant))
}

const activeConversationKey = computed(() => activeConversation.value?.conversationKey || null)

const conversationQuery = (extra = {}) => {
    const conversation = activeConversation.value
    if (conversation.conversationKind === 'instance') {
        return {
            ...extra,
            instance: `${conversation.typeId}:${conversation.instanceId}`,
            includeChildren: includeChildren.value ? 1 : 0
        }
    }
    const isGroup = conversation.conversationKind === 'group'
    const recipientUserId = isGroup ? null : participantUserId(conversation)
    return {
        ...extra,
        ...(isGroup
            ? { conversationKey: conversation.conversationKey }
            : (recipientUserId ? { recipientUserId } : {}))
    }
}

const loadConversation = async () => {
    if (!activeConversation.value) return
    const conversation = activeConversation.value
    const token = ++conversationLoadToken
    // Only a conversation switch clears first; a refresh of the same room
    // keeps the rendered page until the snapshot replaces it, so refetches
    // (dialog toggle, hot remount, instance refresh) and failed fetches
    // never blank the transcript.
    if (messages.value[0]?.conversationKey !== conversation.conversationKey) {
        messages.value = []
        hasMoreMessages.value = false
    }
    try {
        const snapshot = await $fetch('/api/support/messages', {
            query: conversationQuery({ limit: MESSAGES_PAGE_SIZE })
        })
        if (token !== conversationLoadToken) return
        messages.value = snapshot?.data || []
        hasMoreMessages.value = Boolean(snapshot?.hasMore)
        currentUserId.value = snapshot?.currentUserId || currentUserId.value
        if (snapshot?.conversation?.kind && activeConversation.value) {
            const conversation = activeConversation.value
            conversation.conversationKey = snapshot.conversation.conversationKey || conversation.conversationKey
            conversation.conversationKind = snapshot.conversation.kind
            if (snapshot.conversation.kind === 'instance') {
                conversation.typeId = snapshot.conversation.typeId || conversation.typeId
                conversation.instanceId = snapshot.conversation.instanceId || conversation.instanceId
                conversation.instanceName = snapshot.conversation.name || conversation.instanceName
            }
            if (snapshot.conversation.kind === 'group' && snapshot.conversation.name && !conversation.groupName) {
                conversation.groupName = snapshot.conversation.name
            }
        }
        readCursors.value = snapshot.readCursors || []
            ownCursorAtOpen.value = (snapshot.readCursors || [])
                .find(row => String(row.userId) === String(currentUserId.value))?.lastReadAt || null
            for (const row of readCursors.value) resolveUserName(row.userId)
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

// History pagination: `before` rides the timestamp of the oldest loaded
// message; the merged page keeps ascending order and the scroll offset is
// anchored to the previously-oldest content so the reading position holds.
const fetchOlderPage = async () => {
    const oldest = messages.value[0]
    if (!activeConversation.value || !oldest?.timestamp || !hasMoreMessages.value) return null
    const snapshot = await $fetch('/api/support/messages', {
        query: conversationQuery({
            limit: MESSAGES_PAGE_SIZE,
            before: new Date(oldest.timestamp).toISOString()
        })
    })
    const known = new Set(messages.value.map(item => item._id))
    const older = (snapshot?.data || []).filter(item => !known.has(item._id))
    return { older, hasMore: Boolean(snapshot?.hasMore) }
}

const anchorScrollAfterPrepend = (container, previousHeight, previousTop) => {
    if (container) container.scrollTop = container.scrollHeight - previousHeight + previousTop
}

const loadOlderMessages = async () => {
    if (loadingOlder.value || !hasMoreMessages.value) return
    loadingOlder.value = true
    const container = messagesContainer.value
    const previousHeight = container?.scrollHeight || 0
    const previousTop = container?.scrollTop || 0
    try {
        const page = await fetchOlderPage()
        if (!page) return
        if (page.older.length) messages.value = [...page.older, ...messages.value]
        hasMoreMessages.value = page.hasMore
        await nextTick()
        anchorScrollAfterPrepend(container, previousHeight, previousTop)
    } catch (error) {
        console.error('Failed to load earlier messages:', error)
    } finally {
        loadingOlder.value = false
    }
}

const handleMessagesScroll = () => {
    syncScrollPosition()
    const container = messagesContainer.value
    if (!container || !hasMoreMessages.value || loadingOlder.value || loadingAnchor.value) return
    if (container.scrollTop <= 60) loadOlderMessages()
}

// Instance target strip: types at the org root, instances inside a
// type, lineage children inside an instance (the shared containment
// seam).
const effectiveContainment = useEffectiveContainment()
const stripTrail = ref([])
const stripChildrenByKey = ref(new Map())
const stripLoadingKeys = ref(new Set())

const stripTargetKey = computed(() => {
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'instance') return ''
    const deepest = stripTrail.value[stripTrail.value.length - 1]
    return deepest?.key || `${conversation.typeId}:${conversation.instanceId}`
})

// The composed instance is the target whenever no child is drilled; the root
// pill carries the selected state in that case so exactly one target is
// always visibly selected.
const stripRootSelected = computed(() => !stripTrail.value.length && !composerInstance.value)

// Type entries are folders; only instances can be the target.
const isTrailEntrySelected = (entry) => entry.kind !== 'type'
    && Boolean(composerInstance.value)
    && composerInstance.value.type === entry.type
    && String(composerInstance.value.id) === String(entry.id)

const stripChildren = computed(() => stripChildrenByKey.value.get(stripTargetKey.value) || [])

const stripHomeScreen = computed(() => authStore.screenManifest.find(screen => screen.template === 'home') || null)
const stripRootSources = computed(() => {
    const home = stripHomeScreen.value
    if (!home) return []
    return (home.regions || [])
        .map(region => {
            const source = (home.sources || []).find(candidate => candidate.id === region.sourceId) || {}
            if (!source.typeId || source.mode === 'single') return null
            const parentBound = (source.lineageBindings || [])
                .some(binding => binding.childTypeId === source.typeId
                    && binding.parentTypeId !== 'organization')
            if (parentBound) return null
            return source
        })
        .filter(Boolean)
})

async function loadStripChildren(targetKey, targetType, targetInstance = null) {
    if (!targetKey || stripChildrenByKey.value.has(targetKey) || stripLoadingKeys.value.has(targetKey)) return
    stripLoadingKeys.value = new Set([...stripLoadingKeys.value, targetKey])
    try {
        const orgRoot = !stripTrail.value.length && activeConversation.value?.typeId === 'organization'
        if (orgRoot) {
            // One pill per non-empty type; the stashed lists serve the type drill.
            const stash = new Map()
            const typePills = []
            await Promise.all(stripRootSources.value.map(async source => {
                let rows = []
                try {
                    rows = await instances.listInstances(
                        instances.canonicalTypeKey(source.typeId),
                        resolveSourceFilters(source, stripHomeScreen.value || {})
                    )
                } catch {
                    rows = []
                }
                const items = (Array.isArray(rows) ? rows : [])
                    .filter(instance => stripInstanceId(instance))
                    .map(instance => ({
                        key: `${source.typeId}:${stripInstanceId(instance)}`,
                        kind: 'instance',
                        type: source.typeId,
                        id: stripInstanceId(instance),
                        name: stripEntityLabel(instance, source.typeId),
                        entity: instance
                    }))
                if (!items.length) return
                stash.set(`type:${source.typeId}`, items)
                typePills.push({
                    key: `type:${source.typeId}`,
                    kind: 'type',
                    type: source.typeId,
                    id: '',
                    name: localizedTypeIdLabel(source.typeId),
                    entity: null
                })
            }))
            stripChildrenByKey.value = new Map([...stripChildrenByKey.value, ...stash])
            stripChildrenByKey.value = new Map([...stripChildrenByKey.value, [targetKey, typePills]])
            return
        }
        const sources = linkedExplorerChildSources({
            linkedItems: [{ key: targetKey, type: targetType, entity: targetInstance }],
            screens: authStore.screenManifest,
            containment: effectiveContainment()
        })
        const loaded = await Promise.all(sources.map(async source => {
            try {
                const childInstances = await instances.listInstances(
                    instances.canonicalTypeKey(source.typeId),
                    source.filters
                )
                return (Array.isArray(childInstances) ? childInstances : []).map(instance => ({
                    key: `${source.typeId}:${stripInstanceId(instance)}`,
                    kind: 'instance',
                    type: source.typeId,
                    id: stripInstanceId(instance),
                    name: stripEntityLabel(instance, source.typeId),
                    entity: instance
                }))
            } catch {
                return []
            }
        }))
        let merged = loaded.flat()
        const seen = new Set([targetKey])
        merged = merged.filter(item => {
            if (!item.key || item.key === targetKey || seen.has(item.key)) return false
            seen.add(item.key)
            return true
        })
        stripChildrenByKey.value = new Map([...stripChildrenByKey.value, [targetKey, merged]])
    } finally {
        stripLoadingKeys.value = new Set([...stripLoadingKeys.value].filter(key => key !== targetKey))
    }
}

const stripInstanceId = (entity = null) => {
    const value = entity?._id || entity?.id || ''
    return value ? String(value) : ''
}

// Id-equal stored names are stale send-time fallbacks.
const stripDisplayName = (name, id) => (name && name !== String(id) ? name : '')

// Labels ride the shared title resolver (the InstanceInlineRef path).
const stripEntityLabel = (instance = null, typeId = '') =>
    stripDisplayName(instanceRecordTitle(instance, typeViewById(typeId)), stripInstanceId(instance))

watch([activeConversationKey, () => activeConversation.value?.typeId, () => activeConversation.value?.instanceId], ([key]) => {
    if (!key || activeConversation.value?.conversationKind !== 'instance') return
    stripTrail.value = []
    stripChildrenByKey.value = new Map()
    composerInstance.value = null
    composerInstanceTouched = false
    loadStripChildren(
        `${activeConversation.value.typeId}:${activeConversation.value.instanceId}`,
        activeConversation.value.typeId,
        { _id: activeConversation.value.instanceId }
    )
}, { immediate: true })

const isChipSelected = (chip) => chip.kind !== 'type'
    && Boolean(composerInstance.value)
    && composerInstance.value.type === chip.type
    && String(composerInstance.value.id) === String(chip.id ?? (chip.key || '').split(':').slice(1).join(':'))

async function drillStripTo(chip) {
    if (replyTo.value) return
    if (chip.kind !== 'type') {
        composerInstanceTouched = true
        composerInstance.value = { type: chip.type, id: chip.id, name: chip.name }
        // A child target only lands visibly in the composed subtree view; the
        // own-messages filter would hide the sent message entirely.
        if (!includeChildren.value) includeChildren.value = true
    }
    await loadStripChildren(chip.key, chip.type, chip.entity)
    // Only levels with children descend; leaves stay selected in their row.
    const children = stripChildrenByKey.value.get(chip.key) || []
    if (children.length) stripTrail.value = [...stripTrail.value, chip]
}

function truncateStripTrail(index) {
    stripTrail.value = stripTrail.value.slice(0, index + 1)
    const deepest = stripTrail.value[stripTrail.value.length - 1] || null
    composerInstanceTouched = true
    composerInstance.value = deepest && deepest.kind !== 'type'
        ? { type: deepest.type, id: deepest.id, name: deepest.name }
        : null
    // A child target only lands visibly in the composed subtree view; the
    // own-messages filter would hide the sent message entirely.
    if (!includeChildren.value) includeChildren.value = true
}

function resetStripTrail() {
    stripTrail.value = []
    composerInstanceTouched = true
    composerInstance.value = null
}

watch(activeConversationKey, () => {
    replyTo.value = null
    composerInstance.value = null
    composerInstanceTouched = false
})

// Staged files are target-scoped: their child-type choices (and whether
// uploads are accepted at all) follow the composer target, so a target
// switch drops them.
watch(composerTargetType, () => {
    clearPendingFiles()
})

// The children toggle re-queries the thread: the composed subtree view and
// messages linked to the instance itself are different server-side matches.
watch(includeChildren, () => {
    if (activeConversation.value?.conversationKind === 'instance') loadConversation()
})

// While a reply is pending, its instance link is locked to the quoted
// message and cannot be switched until the reply is discarded.
const selectComposerInstance = (chip) => {
    if (replyTo.value) return
    composerInstanceTouched = true
    composerInstance.value = chip
        ? { type: chip.type, id: chip.id, name: chip.name }
        : null
}

// Desktop message menu: reply plus text utilities, PrimeVue-owned. The
// target is a ref: menu models are computeds, and a plain variable would
// never invalidate them, leaving the popup empty.
const messageMenu = ref(null)
const messageMenuTarget = ref(null)
const messageMenuItems = computed(() => {
    const target = messageMenuTarget.value
    if (!target) return []
    const transcribing = transcribingMessageIds.value.has(target._id)
    const items = [{
        label: t('support.reply'),
        icon: 'pi pi-reply',
        command: () => {
            messageMenu.value?.hide?.()
            if (messageMenuTarget.value) openReply(messageMenuTarget.value)
            messageMenuTarget.value = null
        }
    }]
    // Forwarding needs copy to carry: text, attachments, or both (refs-only
    // messages describe their source conversation, not a target's).
    if (String(target.message || '').trim() || (target.attachments || []).length) {
        items.push({
            label: t('support.forward'),
            icon: 'pi pi-share-alt',
            command: () => {
                messageMenu.value?.hide?.()
                openForwardDialog(messageMenuTarget.value)
                messageMenuTarget.value = null
            }
        })
    }
    // Transcription rides the menu like every message action; the pending
    // run stays visible through the in-thread indicator.
    if (canTranscribe(target)) {
        items.push({
            label: t('support.transcribe'),
            icon: transcribing ? undefined : 'pi pi-eye',
            spinner: transcribing,
            disabled: transcribing,
            command: () => {
                messageMenu.value?.hide?.()
                transcribeAudioMessage(messageMenuTarget.value)
                messageMenuTarget.value = null
            }
        })
    }
    // One download entry per attachment, labeled by the full file name.
    for (const attachment of target.attachments || []) {
        const name = attachment.name || attachment.mimeType || attachment.fileId
        items.push({
            label: t('support.download', { name }),
            icon: 'pi pi-download',
            command: () => {
                messageMenu.value?.hide?.()
                const href = chatAttachmentUrl(attachment, { download: true })
                if (href && typeof window !== 'undefined') window.open(href, '_blank')
                messageMenuTarget.value = null
            }
        })
    }
    if (messageMenuTarget.value?.message) {
        items.push({
            label: t('common.copy'),
            icon: 'pi pi-copy',
            command: () => {
                messageMenu.value?.hide?.()
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(String(messageMenuTarget.value.message || '')).catch(() => {})
                }
                messageMenuTarget.value = null
            }
        })
    }
    return items
})

const openMessageMenu = (event, messageItem) => {
    messageMenuTarget.value = messageItem || null
    messageMenu.value?.show(event)
}

// Forwarding (support feature README, Forwarding): the target picker lists
// the inbox's live conversations; picking one posts the server-side forward
// (fresh message from this user carrying the source's text and
// attachments, provenance denormalized as `forwardedFrom`).
const forwardDialog = ref(false)
const forwardTarget = ref(null)
const forwarding = ref(false)
const forwardOptions = computed(() => supportChatStore.conversations
    .filter(conversation => !conversation.archived
        && conversation.conversationKey !== activeConversationKey.value))

const openForwardDialog = (messageItem) => {
    forwardTarget.value = messageItem || null
    forwardDialog.value = true
}

const forwardToConversation = async (conversationKey) => {
    const source = forwardTarget.value
    if (!source || !conversationKey || forwarding.value) return
    forwarding.value = true
    try {
        await $fetch(`/api/support/messages/${encodeURIComponent(String(source._id))}/forward`, {
            method: 'POST',
            body: { conversationKey }
        })
        forwardDialog.value = false
        forwardTarget.value = null
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('support.forwarded'), life: 2000 })
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 6000 })
    } finally {
        forwarding.value = false
    }
}

// The context menu opens from right-click or long-press (contextmenu) and
// drops under the cursor (the shared ContextMenu positions at the event
// point). Media elements overload their native context menu to it —
// media-only messages have no other surface. Other interactive children
// (the reply-quote jump, links, inputs) and text selection keep their
// own behavior.
const MENU_SWALLOW_SELECTOR = 'button, a, video, audio, input, textarea, [data-no-menu]'
const MENU_MEDIA_SELECTOR = 'img, video, audio'
const openMessageMenuFromRow = (event, messageItem, longPress = false) => {
    const target = event?.target
    if (target?.closest?.(MENU_SWALLOW_SELECTOR) && !target.closest(MENU_MEDIA_SELECTOR)) return
    if (!longPress && typeof window !== 'undefined' && String(window.getSelection?.() || '').length) return
    if (longPress) event?.preventDefault?.()
    openMessageMenu(event, messageItem)
}

// Replies quote the target inline in the composer; sending carries the
// parent id and the message payload clears the quote on success. In entity
// views a reply links to the same instance the quoted message belongs to.
const openReply = (messageItem) => {
    replyTo.value = messageItem || null
    if (activeConversation.value?.conversationKind === 'instance') {
        composerInstanceTouched = true
        const link = messageItem?.instanceLink
        composerInstance.value = link?.type && link?.id
            ? { type: link.type, id: link.id, name: link.name || '' }
            : null
    }
}

const lowerInstanceChip = (messageItem) => {
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'instance' || !messageItem.instanceLink?.id) return false
    return !(messageItem.instanceLink.type === conversation.typeId
        && String(messageItem.instanceLink.id) === String(conversation.instanceId))
}

// Message instance links denormalized their label at send time; older
// sends stored the raw instance id as the name — that stale value never
// renders (the no-technical-ids rule): the live label is the stored name
// only when it is not the id, else the localized type label.
const instanceLinkLabel = (link) => (link?.name && link.name !== String(link.id)
    ? link.name
    : localizedTypeIdLabel(link?.type))

const openLowerInstanceChat = (messageItem) => {
    const link = messageItem.instanceLink
    openInstanceChat({ type: link.type, id: String(link.id), name: link.name || '' })
}

const cancelReply = () => {
    replyTo.value = null
}

// Mobile swipe-to-reply: direction-aware (own messages swipe left into the
// open side, opponent messages right), the row follows the finger, and the
// reply icon fades in inside the vacated gap. Release past the threshold
// commits the reply; touch-pan-y keeps vertical scrolling native.
const SWIPE_REPLY_THRESHOLD = 64
const SWIPE_MAX_DRAG = 96
let swipeState = null
const swipeDrag = ref({ id: '', dx: 0 })

const swipeStyle = (messageItem) => (swipeDrag.value.id === messageItem._id && swipeDrag.value.dx
    ? { transform: `translateX(${swipeDrag.value.dx}px)` }
    : undefined)

const swipeIconOpacity = (messageItem) => {
    if (swipeDrag.value.id !== messageItem._id) return 0
    return Math.min(1, Math.abs(swipeDrag.value.dx) / SWIPE_REPLY_THRESHOLD)
}

const clearSwipe = (messageItem) => {
    swipeState = null
    swipeDrag.value = { id: '', dx: 0 }
    swipeArmed.value = new Set([...swipeArmed.value].filter(key => key !== messageItem._id))
}

const onTouchStart = (event, messageItem) => {
    const touch = event.touches?.[0]
    if (!touch) return
    swipeState = {
        key: messageItem._id,
        x: touch.clientX,
        y: touch.clientY,
        // Docked rows swipe toward the thread's open side.
        direction: docksRight(messageItem) ? -1 : 1,
        horizontal: false,
        armed: false
    }
}

const onTouchMove = (event, messageItem) => {
    if (!swipeState || swipeState.key !== messageItem._id) return
    const touch = event.touches?.[0]
    if (!touch) return
    const dx = touch.clientX - swipeState.x
    const dy = touch.clientY - swipeState.y
    // Horizontal intent must be established before the drag takes over, so
    // vertical list scrolling stays native.
    if (!swipeState.horizontal) {
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return
        swipeState.horizontal = true
    }
    const along = dx * swipeState.direction
    if (along <= 0) {
        if (swipeDrag.value.id === messageItem._id) swipeDrag.value = { id: '', dx: 0 }
        if (swipeState.armed) {
            swipeState.armed = false
            swipeArmed.value = new Set([...swipeArmed.value].filter(key => key !== messageItem._id))
        }
        return
    }
    swipeDrag.value = {
        id: messageItem._id,
        dx: Math.min(along, SWIPE_MAX_DRAG) * swipeState.direction
    }
    const armed = along >= SWIPE_REPLY_THRESHOLD
    if (armed !== swipeState.armed) {
        swipeState.armed = armed
        swipeArmed.value = armed
            ? new Set([...swipeArmed.value, messageItem._id])
            : new Set([...swipeArmed.value].filter(key => key !== messageItem._id))
    }
}

const onTouchEnd = (messageItem) => {
    const armed = swipeState?.armed && swipeState.key === messageItem._id
    clearSwipe(messageItem)
    if (armed) openReply(messageItem)
}

const onTouchCancel = (messageItem) => {
    clearSwipe(messageItem)
}

// Jump to a quoted message: scroll+flash when loaded, otherwise walk older
// pages (bounded) while staying anchored to the current reading position.
const scrollToMessage = async (id) => {
    await nextTick()
    const container = messagesContainer.value
    const target = container?.querySelector(`[data-message-id="${CSS.escape(String(id))}"]`)
    if (!target) return false
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightKey.value = String(id)
    setTimeout(() => {
        if (highlightKey.value === String(id)) highlightKey.value = ''
    }, 1600)
    return true
}

const goToMessage = async (id) => {
    if (!id) return
    if (messages.value.some(item => String(item._id) === String(id))) {
        await scrollToMessage(id)
        return
    }
    loadingAnchor.value = true
    try {
        for (let attempt = 0; attempt < 8 && hasMoreMessages.value; attempt++) {
            const container = messagesContainer.value
            const previousHeight = container?.scrollHeight || 0
            const previousTop = container?.scrollTop || 0
            const page = await fetchOlderPage()
            if (!page) break
            if (page.older.length) messages.value = [...page.older, ...messages.value]
            hasMoreMessages.value = page.hasMore
            await nextTick()
            if (messages.value.some(item => String(item._id) === String(id))) break
            anchorScrollAfterPrepend(container, previousHeight, previousTop)
        }
    } finally {
        loadingAnchor.value = false
    }
    await scrollToMessage(id)
}

// Read cursors: server truth on history load, kept live by `read` events.
const readCursors = ref([])
const ownCursorAtOpen = ref(null)
const userNames = ref({})
const searchVisible = ref(false)
const resolveUserName = async (id) => {
    const key = String(id)
    if (!key || userNames.value[key]) return
    const member = groupParticipants.value.find(row => String(row.id) === key)
    if (member?.name) {
        userNames.value = { ...userNames.value, [key]: member.name }
        return
    }
    if (String(agentBots.ai?.id) === key) {
        userNames.value = { ...userNames.value, [key]: agentBots.ai.name }
        return
    }
    const participant = activeConversation.value?.participant
    if (participant && String(participant._id || participant.id) === key) {
        userNames.value = { ...userNames.value, [key]: participant.identity?.name || participant.name || '' }
        return
    }
    if (activeConversation.value?.conversationKind === 'support') {
        userNames.value = { ...userNames.value, [key]: t('support.chatTitle') }
        return
    }
    try {
        const record = await instances.resolveReadableReference('user', key, { silent: true })
        userNames.value = { ...userNames.value, [key]: record?.name || record?.identity?.name || '' }
    } catch {
        userNames.value = { ...userNames.value, [key]: '' }
    }
}
const cursorMap = computed(() => {
    const map = new Map()
    for (const row of readCursors.value) map.set(String(row.userId), row.lastReadAt)
    return map
})
const othersCursors = computed(() => readCursors.value
    .filter(row => String(row.userId) !== String(currentUserId.value)))
const messageSeen = (messageItem) => othersCursors.value
    .some(row => new Date(row.lastReadAt) >= new Date(messageItem.timestamp))
const seenByRows = (messageItem) => othersCursors.value
    .filter(row => new Date(row.lastReadAt) >= new Date(messageItem.timestamp))
    .map(row => ({
        id: row.userId,
        name: userNames.value[String(row.userId)] || t('common.user'),
        at: row.lastReadAt
    }))
watch([readCursors, activeConversationKey], () => {
    for (const row of readCursors.value) resolveUserName(row.userId)
})
// Search panel inputs: the room's participant rows.
const searchParticipants = computed(() => {
    const rows = []
    if (activeConversation.value?.conversationKind === 'group') {
        for (const member of groupParticipants.value) {
            rows.push({ id: String(member.id), label: member.name || userNames.value[String(member.id)] || '' })
        }
        return rows.filter(row => row.label)
    }
    const participant = activeConversation.value?.participant
    if (participant) {
        const id = String(participant._id || participant.id || '')
        if (id) rows.push({ id, label: participant.identity?.name || participant.name || '' })
    }
    for (const messageItem of messages.value) {
        const id = String(messageItem.senderUserId || '')
        if (!id || id === String(currentUserId.value)) continue
        if (!rows.some(row => row.id === id)) {
            rows.push({ id, label: userNames.value[id] || '' })
        }
    }
    for (const row of rows) resolveUserName(row.id)
    return rows.filter(row => row.label)
})
const searchTypeOptions = computed(() => {
    const types = new Map()
    for (const messageItem of messages.value) {
        for (const ref of messageItem.instanceRefs || []) {
            if (ref?.type && !types.has(ref.type)) types.set(ref.type, localizedTypeIdLabel(ref.type))
        }
    }
    return [...types.entries()].map(([type, label]) => ({ type, label }))
})

const toggleSearch = () => {
    searchVisible.value = !searchVisible.value
}
const closeSearch = () => {
    searchVisible.value = false
}
// Scroll-to-end: the floating control shows while reading away from the
// live end and counts the messages waiting below.
const atBottom = ref(true)
const waitingMessages = ref(0)
const syncScrollPosition = () => {
    const element = messagesContainer.value
    if (!element) return
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 80) {
        atBottom.value = true
        waitingMessages.value = 0
    } else {
        atBottom.value = false
    }
}
const scrollToBottomFromControl = () => {
    waitingMessages.value = 0
    scrollToBottom()
}
watch(
    [activeConversationKey, supportDialog, () => props.embedded],
    ([key, dialogOpen, embedded]) => {
        agentActivity.value = null
        mentionState.value = null
        agentQuestion.value = null
        agentStopping.value = false
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
            if (payload?.type === 'read') {
                if (payload.userId && payload.userId !== currentUserId.value) {
                    readCursors.value = [
                        ...readCursors.value.filter(row => String(row.userId) !== String(payload.userId)),
                        { userId: payload.userId, lastReadAt: payload.at }
                    ]
                    resolveUserName(payload.userId)
                }
                return
            }
            if (payload?.type === 'bot_activity') {
                if (!agentStopping.value) {
                    receiveAgentActivity(payload, activity => {
                        activity.steps = Array.isArray(payload.steps) ? payload.steps : []
                    })
                }
                return
            }
            if (payload?.type === 'bot_stream') {
                if (!agentStopping.value) {
                    receiveAgentActivity(payload, activity => { activity.answer = payload.text || '' })
                }
                return
            }
            if (payload?.type === 'bot_question') {
                if (!agentStopping.value) {
                    agentQuestion.value = {
                        question: String(payload.question || ''),
                        options: Array.isArray(payload.options) ? payload.options.map(String) : []
                    }
                }
                return
            }
            if (payload?.type === 'bot_question_end') {
                agentQuestion.value = null
                return
            }
            if (payload?.type === 'bot_stream_end') {
                agentActivity.value = null
                agentQuestion.value = null
                agentStopping.value = false
                return
            }
            // Ringing arrives only through the calls store's `call.invite`
            // subscription — one owner, no second local ring state.
            if (payload?.type !== 'message') return
            // The persisted message supersedes the live run.
            agentActivity.value = null
            agentQuestion.value = null
            agentStopping.value = false
            messages.value.push(payload.message)
            if (!atBottom.value) waitingMessages.value += 1
            supportChatStore.markRead(key)
            nextTick().then(() => {
                if (atBottom.value) scrollToBottom()
            })
        })
        loadConversation()
        // Bot contacts carry this conversation's model rows (the picker
        // above the composer), for subscribed rooms and direct bot chats.
        agentBots.fetchContacts(key)
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
    if (authStore.userIsSet) {
        supportChatStore.connect()
        // The AI contact powers AI-thread presentation (row avatars, the
        // 1:1 detection) — load it beside the inbox, not only on demand.
        agentBots.fetchContacts()
    }
    fetchTranscriptionAvailability()
    if (chatTarget.value?.userId || chatTarget.value?.instanceKey) openDirectTarget()
    else if (chatTarget.value?.conversationKey) openConversationByKey(chatTarget.value.conversationKey)
})
onBeforeUnmount(() => {
    if (railResizeCleanup) {
        railResizeCleanup()
        railResizeCleanup = null
    }
    threadWidthObserver?.disconnect()
    threadWidthObserver = null
    if (unsubscribeConversation) {
        unsubscribeConversation()
        unsubscribeConversation = null
    }
    agentActivity.value = null
    if (typingResetTimer) clearTimeout(typingResetTimer)
    if (typingSendTimer) clearTimeout(typingSendTimer)
    cancelVoiceRecording()
})

// The chat target is consumed at MOUNT by whichever surface appears (drawer,
// popup, /chats route). Reactive re-consumption belongs to the drawer
// instance alone: embedded surfaces (workspace chats tab, /chats route,
// detail panels, popup) already have their own mounted consumption, and a
// reactive watch here would make every mounted instance open the same
// conversation in the main window alongside the popup/drawer.
watch(chatTarget, () => {
    if (props.embedded) return
    if (supportDialog.value && (chatTarget.value?.userId || chatTarget.value?.instanceKey)) openDirectTarget()
}, { deep: true })

watch(supportDialog, (isOpen) => {
    if (props.embedded || !isOpen) return
    if (chatTarget.value?.userId || chatTarget.value?.instanceKey) openDirectTarget()
})

const formatTime = (timestamp, withoutTime) => {
    const date = new Date(timestamp)
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return withoutTime ? date.toLocaleDateString() : `${time}`
}

// Inbox timestamps read as clock time on the day of the message and as a
// calendar date afterwards.
const inboxTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return ''
    if (date.toDateString() === new Date().toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString()
}

// The read mark belongs to rows whose newest message is the viewer's own.
const isOwnInboxRow = (conversation) => Boolean(conversation.senderUserId)
    && String(conversation.senderUserId) === String(currentUserId.value)

// Row menu (right-click / long-press): pin/unpin and archive/unarchive,
// driven by the row's current per-user preferences.
const conversationMenu = ref(null)
const conversationMenuTarget = ref(null)
const conversationMenuItems = computed(() => {
    const option = conversationMenuTarget.value
    if (!option) return []
    return [
        {
            label: option.pinned ? t('support.unpin') : t('support.pin'),
            icon: 'pi pi-thumbtack',
            command: () => {
                conversationMenu.value?.hide?.()
                supportChatStore.setConversationPref(option.conversationKey, { pinned: !option.pinned })
                conversationMenuTarget.value = null
            }
        },
        {
            label: option.archived ? t('support.unarchive') : t('support.archive'),
            icon: 'pi pi-inbox',
            command: () => {
                conversationMenu.value?.hide?.()
                supportChatStore.setConversationPref(option.conversationKey, { archived: !option.archived })
                conversationMenuTarget.value = null
            }
        }
    ]
})

// Inbox row swipe (touch): a left swipe unveils a sticky action rail —
// pin, archive, mark read — the same gesture language as the message rows.
// One row reveals at a time; a content tap dismisses the reveal instead of
// selecting, and vertical list scrolling stays native (horizontal intent
// gate mirrors the message swipe).
const INBOX_RAIL_REVEAL = 112
const revealedRowKey = ref('')
let rowSwipe = null
const rowDrag = ref({ key: '', dx: 0 })

const rowOffset = (option) => {
    if (rowDrag.value.key === option.conversationKey) return rowDrag.value.dx
    return revealedRowKey.value === option.conversationKey ? -INBOX_RAIL_REVEAL : 0
}
const rowContentStyle = (option) => ({ transform: `translateX(${rowOffset(option)}px)` })
const rowRailVisible = (option) => rowOffset(option) < 0

const onRowTouchStart = (event, option) => {
    const touch = event.touches?.[0]
    if (!touch) return
    rowSwipe = { key: option.conversationKey, x: touch.clientX, y: touch.clientY, horizontal: false, dx: 0 }
}

const onRowTouchMove = (event, option) => {
    if (!rowSwipe || rowSwipe.key !== option.conversationKey) return
    const touch = event.touches?.[0]
    if (!touch) return
    const dx = touch.clientX - rowSwipe.x
    const dy = touch.clientY - rowSwipe.y
    if (!rowSwipe.horizontal) {
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return
        rowSwipe.horizontal = true
    }
    // Drags are relative to the current reveal so a revealed row can be
    // pushed back or pulled deeper without a jump.
    const base = revealedRowKey.value === option.conversationKey ? -INBOX_RAIL_REVEAL : 0
    rowSwipe.dx = Math.min(0, Math.max(-(INBOX_RAIL_REVEAL + 24), base + dx))
    rowDrag.value = { key: option.conversationKey, dx: rowSwipe.dx }
}

const onRowTouchEnd = (option) => {
    const swipe = rowSwipe
    rowSwipe = null
    rowDrag.value = { key: '', dx: 0 }
    if (!swipe || swipe.key !== option.conversationKey || !swipe.horizontal) return
    revealedRowKey.value = swipe.dx < -(INBOX_RAIL_REVEAL / 2) ? option.conversationKey : ''
}

const onRowContentClick = (event, option) => {
    if (revealedRowKey.value && revealedRowKey.value === option.conversationKey) {
        event.stopPropagation()
        revealedRowKey.value = ''
    }
}

const toggleRowPinned = (option) => {
    revealedRowKey.value = ''
    supportChatStore.setConversationPref(option.conversationKey, { pinned: !option.pinned })
}
const toggleRowArchived = (option) => {
    revealedRowKey.value = ''
    supportChatStore.setConversationPref(option.conversationKey, { archived: !option.archived })
}
const markRowRead = (option) => {
    revealedRowKey.value = ''
    supportChatStore.markRead(option.conversationKey)
}

const openConversationMenu = (event, option) => {
    conversationMenuTarget.value = option || null
    conversationMenu.value?.toggle(event)
}

// Sender runs: consecutive messages from one sender within a short window
// read as one visual unit — the sender label leads, the timestamp trails
// under the last message only (SPEC §Chat thread). Runs break on sender
// change, time gap, or a day divider (the gap makes one inevitable).
const MESSAGE_RUN_WINDOW_MS = 3 * 60 * 1000

const messageSenderKey = (messageItem) => String(messageItem?.senderUserId || messageItem?.sender || '')

const continuesSenderRun = (messageItem, neighbor) => {
    if (!neighbor || messageSenderKey(messageItem) !== messageSenderKey(neighbor)) return false
    const gap = Math.abs(new Date(messageItem.timestamp).getTime() - new Date(neighbor.timestamp).getTime())
    return Number.isFinite(gap) && gap <= MESSAGE_RUN_WINDOW_MS
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
    return messages.value.map((messageItem, index) => {
        const previous = messages.value[index - 1] || null
        const next = messages.value[index + 1] || null
        return {
            ...messageItem,
            day: getDay(messageItem.timestamp),
            firstOfSenderRun: !continuesSenderRun(messageItem, previous),
            lastOfSenderRun: !continuesSenderRun(messageItem, next)
        }
    })
})

const scrollToBottom = async () => {
    await nextTick()

    if (messagesContainer.value) {
        const element = messagesContainer.value
        // Instant jump: a smooth animation passes through small scrollTop
        // values on the way down, which the lazy-history scroll listener
        // would misread as a scroll-to-top request.
        element.scrollTo({
            top: element.scrollHeight,
            behavior: 'auto'
        })
    }
}

// The attachment picker is the explorer tree of the home sidebar in a
// popover: the same compiled home-section list sources the PanelMenu
// renders (full user-available window, built-in search), generated create
// buttons first beside entity rows at every level. One tap on an instance
// selects, adds the ref, and closes the picker. With no readable types and
// no create actions the trigger stays disabled instead of opening an empty
// menu.
const attachmentPickerEmpty = computed(() => {
    // The paperclip opens for entity refs OR file uploads: a chat whose
    // home screen has no list sections still attaches files.
    if (chatUploadEnabled.value) return false
    const home = authStore.screenManifest.find(screen => screen.template === 'home')
    return !(home?.sources || []).some(source => source.typeId && source.mode !== 'single')
})

const openAttachmentPicker = (event) => {
    attachmentPicker.value?.toggle(event)
}

const selectAttachment = (option) => {
    if (!option?.type || !option.value) return
    if (!instanceRefs.value.some(ref => ref.type === option.type && ref.id === option.value)) {
        instanceRefs.value.push({
            type: option.type,
            id: option.value,
            label: option.label,
            entity: option.entity || null
        })
    }
}


const pendingCreateActionLabel = computed(() => pendingCreateAction.value
    ? generatedActionLabel(pendingCreateAction.value, '', { t, te })
    : t('common.confirm'))

const createPromptFields = computed(() => (pendingCreateAction.value
    ? promptedFields(pendingCreateAction.value)
    : []))

const runCreateAction = async (action) => {
    if (!action?.id) return
    // File creators ride the generic prompt dialog: the `file` control
    // uploads to the files bucket and the construct path mints a file
    // instance.
    if (promptedFields(action).length) {
        await openCreatePromptDialog(action)
        return
    }
    await executeCreateAction(action, {})
}

const openCreatePromptDialog = async (action) => {
    pendingCreateAction.value = action
    for (const key of Object.keys(createPromptValues)) delete createPromptValues[key]
    for (const key of Object.keys(createPromptOptions)) delete createPromptOptions[key]
    for (const field of collectActionInputFields(action)) {
        createPromptValues[field.id] = initialPromptValue(field)
    }
    createPromptVisible.value = true
    for (const field of createPromptFields.value) {
        const type = field.typeId || field.accepts?.[0]
        if (field.type === 'instance' || field.type === 'typeList') {
            if (!type) continue
            try {
                const rows = await $fetch('/api/support/instance-options', {
                    query: { type }
                })
                const view = typeViewById(type)
                createPromptOptions[field.id] = (rows || []).map(row => ({
                    ...row,
                    label: instanceRecordTitle(row.instance || null, view)
                        || row.label
                        || generatedEntityLabel(type, { t, te })
                }))
            } catch (error) {
                console.error('Failed to load create prompt options:', error)
                createPromptOptions[field.id] = []
            }
        }
    }
}

const submitCreatePrompt = async () => {
    if (!pendingCreateAction.value) return
    executingCreate.value = true
    try {
        // A selected payload file finishes uploading before the create
        // posts — the submission awaits the reference it must carry.
        await pendingPayloadUpload()
        await executeCreateAction(
            pendingCreateAction.value,
            promptData(collectActionInputFields(pendingCreateAction.value), createPromptValues)
        )
        createPromptVisible.value = false
        pendingCreateAction.value = null
    } finally {
        executingCreate.value = false
    }
}

const executeCreateAction = async (action, data) => {
    executingCreate.value = true
    try {
        const result = await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(action.id)}/execute`, {
            method: 'POST',
            body: {
                instanceId: null,
                instances: {},
                data,
                parameters: {}
            }
        })
        attachCreatedInstance(action, result)
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('generatedScreen.actionCompleted'), life: 2000 })
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 })
    } finally {
        executingCreate.value = false
    }
}

// The created instance attaches to the draft like any picked entity; created
// shapes mirror the generated action contract (created/entity payloads).
const attachCreatedInstance = (action, result) => {
    if (!result || typeof result !== 'object') return
    const instance = result.created || (!result.owner ? (result.entity || result) : null)
    const id = instance?._id?.toString?.() || instance?._id || instance?.id || ''
    const type = [].concat(action.relationMutation?.targetTypes || [])[0] || action.typeId
    if (!id || !type) return
    if (!instanceRefs.value.some(ref => ref.type === type && ref.id === id)) {
        instanceRefs.value.push({
            type,
            id,
            label: instance?.name || id,
            instance
        })
    }
}

const hydrateInstanceRefs = async (refs = []) => {
    const hydrated = []
    for (const ref of refs) {
        if (!ref?.type || !ref?.id) continue
        try {
            const options = await $fetch('/api/support/instance-options', {
                query: {
                    type: ref.type,
                    q: ref.id,
                    recipientUserId: activeRecipientUserId.value || undefined
                }
            })
            const option = (options || []).find(item => item.value === ref.id)
            hydrated.push({
                ...ref,
                label: option?.label || (ref.label !== String(ref.id) ? ref.label : ''),
                entity: option?.entity || ref.instance || null,
                recipientHasAccess: option?.recipientHasAccess
            })
        } catch (error) {
            console.error('Failed to hydrate chat instance ref:', error)
            hydrated.push(ref)
        }
    }
    return hydrated
}

const removeInstanceRef = (targetRef) => {
    instanceRefs.value = instanceRefs.value.filter(ref => !(ref.type === targetRef.type && ref.id === targetRef.id))
}

const loadNewChatUsers = async () => {
    newChatUsersLoading.value = true
    try {
        // The AI loads beside members: the assistant is ensured server-side,
        // so chatting with it is a new chat away — no setup surface.
        await Promise.all([
            $fetch('/api/support/instance-options', { query: { type: 'user' } }).then((rows) => {
                newChatUsers.value = rows
            }),
            agentBots.fetchContacts()
        ])
    } catch (error) {
        console.error('Failed to load chat users:', error)
        newChatUsers.value = []
    } finally {
        newChatUsersLoading.value = false
    }
}

// Directory search over the chat pickers: a typed query searches users by
// name across every organization — person threads are open between any two
// accounts (support README), and every match except the caller's own entry
// is listed.
const directoryUserOption = (entry) => ({
    type: 'user',
    value: entry._id,
    label: entry.identity?.name || entry._id,
    instance: entry
})
const { query: newChatSearch, results: newChatDirectoryOptions, searching: newChatSearching } = useDirectoryUserSearch()
// The organization AI: the single contact floating above human members in
// the new-chat picker, gated by the caller's agent-chat capability (the
// server answers canChat; no capability, no AI row).
const botContactOptions = computed(() => {
    if (!agentBots.canChat || !agentBots.ai) return [];
    const contact = agentBots.ai;
    return [{
        type: 'user',
        value: String(contact.id),
        label: contact.name,
        instance: {
            _id: contact.id,
            identity: { name: contact.name },
            data: { bot: { createdAt: null }, avatarUrl: contact.avatarUrl }
        }
    }];
});

const newChatOptions = computed(() => {
    const query = newChatSearch.value.trim()
    if (query.length < 2) {
        return [
            ...botContactOptions.value,
            ...newChatUsers.value.filter(option => !option.instance?.data?.bot)
        ]
    }
    const lower = query.toLowerCase()
    const matchingBots = botContactOptions.value.filter(option => option.label.toLowerCase().includes(lower))
    return [...matchingBots, ...newChatDirectoryOptions.value.map(directoryUserOption)]
})

// Group members reach beyond the organization the same way: the merged
// option list keeps organization members, current directory matches, and
// already-picked directory entries (so selected chips keep resolving when
// the query changes).
const { query: groupMemberSearch, results: groupMemberDirectoryResults, searching: groupMemberSearching } = useDirectoryUserSearch()
const groupPickedDirectoryOptions = ref([])
const groupMemberOptions = computed(() => {
    const byValue = new Map()
    for (const option of [
        ...newChatUsers.value,
        ...groupMemberDirectoryResults.value.map(directoryUserOption),
        ...groupPickedDirectoryOptions.value
    ]) {
        if (option?.value && !byValue.has(option.value)) byValue.set(option.value, option)
    }
    return [...byValue.values()]
})
watch(groupMemberIds, (ids) => {
    for (const entry of groupMemberDirectoryResults.value) {
        const value = entry._id
        if (ids.includes(value) && !groupPickedDirectoryOptions.value.some(option => option.value === value)) {
            groupPickedDirectoryOptions.value.push(directoryUserOption(entry))
        }
    }
}, { deep: true })

const openNewChatDialog = async () => {
    newChatDialog.value = true
    newChatSearch.value = ''
    newChatDirectoryOptions.value = []
    await loadNewChatUsers()
}

// The + control's menu (SPEC): every conversation start in one place —
// a person chat, a group, an AI chat (capability-gated).
const newChatMenuRef = ref(null)
// The joined header bar reads as one control: Aura draws outlined
// buttons one surface step lighter than inputs, so the group's outlined
// actions borrow the input's border token. The archive toggle's active
// state keeps its primary ink.
const headerGroupButtonPt = { root: { style: { borderColor: 'var(--p-inputtext-border-color)' } } };

const toggleNewChatMenu = (event) => {
    newChatMenuRef.value?.toggle(event)
}
const newChatMenuItems = computed(() => [
    { label: t('support.newChat'), icon: 'pi pi-user-plus', command: () => { openNewChatDialog() } },
    { label: t('support.newGroup'), icon: 'pi pi-users', command: () => { openGroupDialog() } },
    ...(agentBots.canChat
        ? [{ label: t('support.newAgentChat'), icon: 'pi pi-sparkles', command: () => { openNewAgentChat() } }]
        : [])
])

const openNewChatUser = (userId) => {
    if (!userId) return
    const option = newChatOptions.value.find(item => item.value === userId)
    // Picking the AI opens a fresh thread, never the one eternal direct
    // chat: the room materializes when the first message is sent.
    if (option?.instance?.data?.bot) {
        openNewAgentChat(option)
        return
    }
    activeConversation.value = {
        conversationKey: directConversationKey(currentUserId.value, userId),
        conversationKind: 'direct',
        participants: [currentUserId.value, userId].filter(Boolean),
        lastMessage: '',
        instanceRefs: [],
        participant: option?.entity || {
            _id: userId,
            identity: { name: option?.label || userId },
            data: {}
        }
    }
    newChatDialog.value = false
}

// A fresh AI thread before its first message: an unsent draft with no
// conversation key (nothing subscribes or loads yet) that materializes
// into a real room — titled by the first message — when that message is
// sent. Cancelling the draft creates nothing.
const openNewAgentChat = (option = null) => {
    const contact = agentBots.ai
    if (!contact) return
    const assistantId = String(contact.id)
    const name = option?.label || contact.name || ''
    activeConversation.value = {
        conversationKey: null,
        conversationKind: 'group',
        groupName: name,
        participants: [currentUserId.value, assistantId].filter(Boolean),
        lastMessage: '',
        instanceRefs: [],
        participant: {
            _id: assistantId,
            identity: { name },
            data: { bot: { createdAt: null }, avatarUrl: contact.avatarUrl }
        },
        agentDraft: true
    }
    messages.value = []
    hasMoreMessages.value = false
    newChatDialog.value = false
}

const openGroupDialog = async () => {
    groupName.value = ''
    groupMemberIds.value = []
    groupMemberSearch.value = ''
    groupPickedDirectoryOptions.value = []
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
    // The inbox Listbox toggles: re-clicking the open row deselects and
    // emits null — the open thread stays.
    if (!key) return
    const summary = supportChatStore.conversations.find(item => item.conversationKey === key)
    if (summary) {
        activeConversation.value = { ...summary, resolved: true }
        supportChatStore.markRead(key)
        return
    }
    if (key.startsWith('instance:')) {
        const [, typeId, instanceId] = key.split(':')
        activeConversation.value = {
            conversationKey: key,
            conversationKind: 'instance',
            typeId,
            instanceId,
            instanceName: props.instanceName || '',
            lastMessage: ''
        }
        return
    }
    if (key.startsWith('group:')) {
        activeConversation.value = {
            conversationKey: key,
            conversationKind: 'group',
            participants: [],
            lastMessage: '',
            instanceRefs: []
        }
        return
    }
    if (key.startsWith('direct:')) {
        activeConversation.value = {
            conversationKey: key,
            conversationKind: 'direct',
            participants: key.split(':').slice(1),
            lastMessage: '',
            instanceRefs: []
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

// Wide thread panes align every message left with an avatar gutter
// (SPEC §Chat thread); the right dock is the narrow-pane arrangement for
// the viewer's messages.
const threadIsWide = ref(false)
const docksRight = (chatMessage) => isOwnMessage(chatMessage) && !threadIsWide.value

let threadWidthObserver = null
const syncThreadWidth = () => {
    threadIsWide.value = (messagesContainer.value?.clientWidth || 0) >= 1024
}
watch(() => messagesContainer.value, (element) => {
    threadWidthObserver?.disconnect()
    threadWidthObserver = null
    if (!element || typeof ResizeObserver === 'undefined') return
    threadWidthObserver = new ResizeObserver(syncThreadWidth)
    threadWidthObserver.observe(element)
    syncThreadWidth()
})

// AI-only rooms are two-party: every non-own message is the assistant's.
const senderIdentityRoom = computed(() => ((['group', 'instance'].includes(activeConversation.value?.conversationKind)
    && !isAiOnlyRoom.value) || isAiOnlyRoom.value))
const showSenderLabel = () => false
    && messageItem.firstOfSenderRun

const showSenderAvatar = (messageItem) => senderIdentityRoom.value
    && Boolean(messageItem?.senderUserId)
    && !docksRight(messageItem)
    && messageItem.lastOfSenderRun
    && messageItem.lastOfSenderRun

const openConversation = async (conversation) => {
    activeConversation.value = conversation
    await supportChatStore.markRead(conversation.conversationKey)
}

const showInbox = () => {
    if (props.threadOnly) return
    activeConversation.value = null
    chatTarget.value = null
    conversationKeyTarget = ''
}

const closeChat = () => {
    showInbox()
    if (!props.embedded) supportDialog.value = false
}

const openChatsPage = () => {
    // Expand opens the chat inside the home framework: a workspace tab
    // pinned to the active conversation (or the general chats tab from the
    // inbox) — the step up from the bottom-right popup.
    const target = activeConversation.value
        ? {
            conversationKey: activeConversationKey.value || '',
            label: conversationLabel(activeConversation.value)
        }
        : {};
    closeChat();
    if (!openChatInWorkspaceTab(target)) navigateTo('/chats');
}

const openDirectTarget = async () => {
    if (chatTarget.value?.instanceKey) {
        openConversationByKey(chatTarget.value.instanceKey)
        return
    }
    if (!chatTarget.value?.userId) return
    activeConversation.value = {
        conversationKey: directConversationKey(currentUserId.value, chatTarget.value.userId),
        conversationKind: 'direct',
        participants: [currentUserId.value, chatTarget.value.userId].filter(Boolean),
        participant: {
            _id: chatTarget.value.userId,
            identity: { name: chatTarget.value.name || '' },
            data: {}
        }
    }
    const draftRefs = (chatTarget.value.draftInstanceRefs || [])
        .filter(ref => ref?.type && ref?.id)
        .map(ref => ({
            type: ref.type,
            id: ref.id,
            label: ref.label || ref.id,
            entity: ref.instance || null
        }));
    instanceRefs.value = await hydrateInstanceRefs(draftRefs);
}

const conversationLabel = (conversation) => {
    if (conversation?.conversationKind === 'instance') {
        // A label equal to the instance id is a stale send-time fallback,
        // never a name (the no-technical-ids rule).
        const name = conversation?.instanceName
        return (name && name !== String(conversation.instanceId) ? name : '')
            || localizedTypeIdLabel(conversation?.typeId)
    }
    if (conversation?.conversationKind === 'group') {
        return conversation?.groupName || t('support.sectionGroups')
    }
    return conversation?.participant?.identity?.name
        || conversation?.participant?.name
        || (conversation?.conversationKind === 'support' ? t('support.chatTitle') : t('common.user'))
}

const conversationAvatar = (conversation) => {
    // AI threads fall into the person-avatar branch: the assistant's own
    // image stands in for the room.
    if (isAiChatRow(conversation)) return agentBots.ai?.avatarUrl || ''
    return conversation?.participant?.avatarUrl
        || conversation?.participant?.data?.avatarUrl
        || ''
}

const conversationPreviewMessage = (conversation) => ({
    message: conversation.lastMessage || '',
    instanceRefs: conversation.instanceRefs || [],
    attachment: conversation.attachment || null,
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
    return {
        t,
        te,
        confirm,
        toast,
        supportDialog,
        chatTarget,
        openEntityPopup,
        entityPopupOpenable,
        authStore,
        supportChatStore,
        message,
        messages,
        messagesContainer,
        MESSAGES_PAGE_SIZE,
        hasMoreMessages,
        loadingOlder,
        currentUserId,
        unsubscribeConversation,
        conversationLoadToken,
        instanceRefs,
        attachmentPicker,
        pendingCreateAction,
        createPromptVisible,
        createPromptValues,
        createPromptOptions,
        uploadingPayloadField,
        setPayloadInputEl,
        payloadInputEl,
        uploadPayloadFile,
        pendingPayloadUpload,
        executingCreate,
        activeConversation,
        agentBots,
        botPanelVisible,
        botPanelConversationKey,
        isBotDirectRow,
        isDirectWithBot,
        isAiChatRow,
        isAiOnlyRoom,
        includeChildren,
        composerInstance,
        composerInstanceTouched,
        replyTo,
        swipeArmed,
        highlightKey,
        loadingAnchor,
        instances,
        registry,
        newChatDialog,
        newChatUsers,
        newChatUsersLoading,
        groupDialog,
        groupName,
        groupMemberIds,
        groupSaving,
        typingName,
        typingIndicatorRef,
        agentActivity,
        agentQuestion,
        sendAgentAnswer,
        agentTypingName,
        receiveAgentActivity,
        agentRunLive,
        agentStopping,
        stopAgentRun,
        typingResetTimer,
        typingSendTimer,
        typingActive,
        callRoom,
        callDialog,
        callHeaderLabel,
        callsStore,
        isMobileViewport,
        openCallInWorkspaceTab,
        ongoingCallRoom,
        conversationInvite,
        joinOngoingCall,
        joinConversationCall,
        startCall,
        roomAI,
        MODEL_ROW_SEPARATOR,
        modelRowValue,
        conversationModelRows,
        conversationModelOptions,
        modelSelectVisible,
        conversationModel,
        setConversationModel,
        openCallSurface,
        messagePreviewVisible,
        draftPreviewMessage,
        activeRecipientUserId,
        recipientLimitedRefs,
        localizedTypeIdLabel,
        selectedFolder,
        orgRootOf,
        folderKeyOf,
        showArchived,
        inboxSearch,
        searchHit,
        scopeConversations,
        orgFolders,
        inboxFolders,
        folderHit,
        displayConversations,
        byLatestActivity,
        conversationSections,
        isActiveConversation,
        instanceConversationIcon,
        chatInstanceRecord,
        groupParticipantIds,
        membersList,
        toggleMembersList,
        groupParticipants,
        conversationSubtitle,
        canDeleteActiveGroup,
        composerTextareaPt,
        composerField,
        mentionState,
        MENTION_ROWS_MAX,
        mentionCandidates,
        mentionRows,
        composerCaret,
        updateMention,
        applyMention,
        handleKeyDown,
        handleComposerPaste,
        handleTypingInput,
        receiveTyping,
        pendingFiles,
        outgoingFiles,
        composerStagedRows,
        ATTACHMENT_LIMIT,
        pendingFileSeq,
        stagedGeneration,
        typeViewById,
        uploadChatFile,
        composerTargetType,
        chatFileCandidates,
        strictInstanceTarget,
        instanceChatUploadBlocked,
        chatUploadEnabled,
        chatFileAcceptAttr,
        voiceRecordingAllowed,
        voiceTargetTypeId,
        pendingFileIcon,
        formatFileSize,
        setPendingTarget,
        pendingTargetLabel,
        removePendingFile,
        clearPendingFiles,
        stageChatFiles,
        filesDragDepth,
        dragHasFiles,
        filesDragging,
        onFilesDragEnter,
        onFilesDragOver,
        onFilesDragLeave,
        onFilesDrop,
        pendingFilesIncomplete,
        canSendComposerDraft,
        uploadPendingFile,
        updatePendingProgress,
        sendChain,
        agentChatTitle,
        resolveAgentDraft,
        sendMessage,
        onlineUserIds,
        voiceRecording,
        voicePaused,
        recordingElapsed,
        voiceRecordingSupported,
        formatRecordingDuration,
        toggleVoiceRecordingPause,
        startVoiceRecording,
        cancelVoiceRecording,
        finishVoiceRecording,
        voiceSending,
        stopAndSendVoiceRecording,
        transcriptionAvailable,
        transcribingMessageIds,
        isAudioOnlyMessage,
        messageBubbleText,
        bubbleContentMessage,
        canTranscribe,
        parentAttachmentIcon,
        fetchTranscriptionAvailability,
        replaceMessage,
        transcribeAudioMessage,
        participantOnline,
        activeConversationKey,
        conversationQuery,
        loadConversation,
        fetchOlderPage,
        anchorScrollAfterPrepend,
        loadOlderMessages,
        handleMessagesScroll,
        effectiveContainment,
        stripTrail,
        stripChildrenByKey,
        stripLoadingKeys,
        stripTargetKey,
        stripRootSelected,
        isTrailEntrySelected,
        stripChildren,
        stripHomeScreen,
        stripRootSources,
        loadStripChildren,
        stripInstanceId,
        stripDisplayName,
        stripEntityLabel,
        isChipSelected,
        drillStripTo,
        truncateStripTrail,
        resetStripTrail,
        selectComposerInstance,
        messageMenu,
        messageMenuTarget,
        messageMenuItems,
        openMessageMenu,
        forwardDialog,
        forwardTarget,
        forwarding,
        forwardOptions,
        openForwardDialog,
        forwardToConversation,
        MENU_SWALLOW_SELECTOR,
        MENU_MEDIA_SELECTOR,
        openMessageMenuFromRow,
        openReply,
        lowerInstanceChip,
        instanceLinkLabel,
        openLowerInstanceChat,
        cancelReply,
        SWIPE_REPLY_THRESHOLD,
        SWIPE_MAX_DRAG,
        swipeState,
        swipeDrag,
        swipeStyle,
        swipeIconOpacity,
        clearSwipe,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onTouchCancel,
        scrollToMessage,
        goToMessage,
        readCursors,
        ownCursorAtOpen,
        userNames,
        searchVisible,
        resolveUserName,
        cursorMap,
        othersCursors,
        messageSeen,
        seenByRows,
        searchParticipants,
        toggleSearch,
        closeSearch,
        atBottom,
        waitingMessages,
        syncScrollPosition,
        scrollToBottomFromControl,
        formatTime,
        inboxTimestamp,
        isOwnInboxRow,
        conversationMenu,
        conversationMenuTarget,
        conversationMenuItems,
        INBOX_RAIL_REVEAL,
        revealedRowKey,
        rowSwipe,
        rowDrag,
        rowOffset,
        rowContentStyle,
        rowRailVisible,
        onRowTouchStart,
        onRowTouchMove,
        onRowTouchEnd,
        onRowContentClick,
        toggleRowPinned,
        toggleRowArchived,
        markRowRead,
        openConversationMenu,
        MESSAGE_RUN_WINDOW_MS,
        messageSenderKey,
        continuesSenderRun,
        messagesList,
        scrollToBottom,
        attachmentPickerEmpty,
        openAttachmentPicker,
        selectAttachment,
        pendingCreateActionLabel,
        createPromptFields,
        runCreateAction,
        openCreatePromptDialog,
        submitCreatePrompt,
        executeCreateAction,
        attachCreatedInstance,
        hydrateInstanceRefs,
        removeInstanceRef,
        loadNewChatUsers,
        directoryUserOption,
        newChatSearch,
        newChatDirectoryOptions,
        newChatSearching,
        botContactOptions,
        newChatOptions,
        groupMemberSearch,
        groupMemberDirectoryResults,
        groupMemberSearching,
        groupPickedDirectoryOptions,
        groupMemberOptions,
        openNewChatDialog,
        newChatMenuRef,
        headerGroupButtonPt,
        toggleNewChatMenu,
        newChatMenuItems,
        openNewChatUser,
        openNewAgentChat,
        openGroupDialog,
        createGroup,
        openGroupConversation,
        conversationKeyTarget,
        openConversationByKey,
        requestDeleteGroup,
        deleteActiveGroup,
        isOwnMessage,
        threadIsWide,
        docksRight,
        threadWidthObserver,
        syncThreadWidth,
        senderIdentityRoom,
        showSenderLabel,
        showSenderAvatar,
        openConversation,
        showInbox,
        closeChat,
        openChatsPage,
        openDirectTarget,
        conversationLabel,
        conversationAvatar,
        conversationPreviewMessage,
        participantUserId,
        directConversationKey,
    }
}
