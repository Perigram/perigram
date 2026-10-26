<template>
            <aside
        ref="railRoot"
                class="chat-inbox flex min-h-0 flex-1 flex-col overflow-hidden"
                :class="[fullPage ? 'chat-inbox--rail border-r border-chrome-border' : '', fullPage ? 'relative' : '']"
        :style="fullPage ? railWidthStyle : undefined"
            >
                <div class="mb-2 flex shrink-0 items-center gap-1 px-2 pt-2">
                    <!-- The rail header is exactly three controls in one
                         joined input group (SPEC): the archive toggle (the
                         same control leaves the archived view), the search
                         field, and one + whose menu owns every conversation
                         start. -->
                    <InputGroup class="min-w-0 flex-1">
                        <Button
                            icon="pi pi-inbox"
                            size="small"
                            :severity="showArchived ? 'primary' : 'secondary'"
                            outlined
                            :pt="showArchived ? undefined : headerGroupButtonPt"
                            :aria-label="$t('support.archivedConversations')"
                            :aria-pressed="showArchived"
                            data-testid="chats-archive-toggle"
                            @click="showArchived = !showArchived"
                        />
                        <InputText
                            v-model="inboxSearch"
                            type="text"
                            size="small"
                            :placeholder="$t('support.searchChats')"
                            data-testid="chats-search"
                        />
                        <Button
                            icon="pi pi-plus"
                            size="small"
                            severity="secondary"
                            outlined
                            :pt="headerGroupButtonPt"
                            :aria-label="$t('support.newChat')"
                            data-testid="chats-new-menu"
                            @click="toggleNewChatMenu"
                        />
                    </InputGroup>
                    <Menu ref="newChatMenuRef" :model="newChatMenuItems" :popup="true" />
                    <!-- The drawer's inbox view needs its own close: the
                         thread header's close vanishes with the thread, and
                         nothing else dismisses the drawer from here. -->
                    <Button
                        v-if="!embedded"
                        icon="pi pi-times"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        class="shrink-0"
                        :aria-label="$t('common.close')"
                        @click="closeChat"
                    />
                </div>
                <div
    v-if="fullPage"
    class="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-primary/30"
    :aria-label="$t('support.resizeRail')"
    data-testid="chats-rail-resize"
/>
<!-- Folder chips scope the list (SPEC: Chat thread). -->
                <div
                    v-if="inboxFolders.length > 1"
                    class="mb-2 flex shrink-0 items-center gap-1 overflow-x-auto px-2"
                    data-testid="chats-folders"
                >
                    <Button
                        v-for="folder in inboxFolders"
                        :key="folder.key"
                        type="button"
                        class="flex shrink-0 items-center gap-1 rounded-ui px-2 py-1 text-supporting transition-colors"
                        :severity="selectedFolder === folder.key
                            ? 'primary'
                            : 'secondary'"
                        :aria-current="selectedFolder === folder.key ? 'true' : undefined"
                        @click="selectedFolder = folder.key"
                    >
                        <i v-if="folder.icon" :class="folder.icon" class="shrink-0" aria-hidden="true"></i>
                        <span class="max-w-32 truncate">{{ folder.label }}</span>
                    </Button>
                </div>
                <StateBlock
                    v-if="!displayConversations.length"
                    class="m-3"
                    :message="showArchived ? $t('support.noArchivedConversations') : $t('support.noConversations')"
                    :icon="showArchived ? 'pi pi-inbox' : 'pi pi-comments'"
                />
                <Listbox
                    v-else
                    :key="activeConversation ? 'docked' : 'live'"
                    :model-value="activeConversation?.conversationKey || null"
                    :options="conversationSections"
                    option-label="label"
                    option-value="conversationKey"
                    data-key="conversationKey"
                    :auto-option-focus="false"
:focus-on-hover="false"
                    class="min-h-0 flex-1 border-0"
                    :aria-label="$t('support.chatTitle')"
                    scroll-height="100%"
                    @update:model-value="key => openConversationByKey(key)"
                >
                    <template #option="{ option }">
                        <!-- Chat-list row: two top-aligned lines — name,
                              member count, and the trailing meta column (read
                              check before the smart timestamp, pin indicator
                              and unread-count badge under it) up top; the
                              latest-message preview below. Rows of every
                              kind share one flush left edge — the folder
                              chip strip above the list owns org scoping,
                              not per-row nesting. The row menu
                              (pin/archive) opens on right-click (long-press on
                              touch); on touch a left swipe unveils the same
                              actions as a sticky rail (one row at a time, tap
                              to dismiss). -->
                        <div
                            class="relative flex w-full min-w-0 items-start overflow-hidden md:overflow-visible"
                            @touchstart="onRowTouchStart($event, option)"
                            @touchmove="onRowTouchMove($event, option)"
                            @touchend="onRowTouchEnd(option)"
                            @touchcancel="onRowTouchEnd(option)"
                            @click="onRowContentClick($event, option)"
                            @contextmenu.prevent="openConversationMenu($event, option)"
                        >
                            <span
                                class="absolute inset-y-0 right-0 flex items-center gap-1 pr-1 opacity-0 transition-opacity md:hidden"
                                :class="rowRailVisible(option) ? 'opacity-100' : ''"
                                aria-hidden="true"
                            >
                                <Button
                                    icon="pi pi-thumbtack"
                                    severity="secondary"
                                    text
                                    rounded
                                    size="small"
                                    :aria-label="option.pinned ? $t('support.unpin') : $t('support.pin')"
                                    @click.stop="toggleRowPinned(option)"
                                />
                                <Button
                                    :icon="option.archived ? 'pi pi-inbox' : 'pi pi-box'"
                                    severity="secondary"
                                    text
                                    rounded
                                    size="small"
                                    :aria-label="option.archived ? $t('support.unarchive') : $t('support.archive')"
                                    @click.stop="toggleRowArchived(option)"
                                />
                                <Button
                                    icon="pi pi-check-square"
                                    severity="secondary"
                                    text
                                    rounded
                                    size="small"
                                    :aria-label="$t('support.markRead')"
                                    @click.stop="markRowRead(option)"
                                />
                            </span>
                            <div
                                class="relative flex w-full min-w-0 items-center gap-2 md:gap-3"
                                :class="rowDrag.key === option.conversationKey ? '' : 'transition-transform'"
                                :style="rowContentStyle(option)"
                            >
                            <div class="relative shrink-0">
                                <Avatar
                                    v-if="option.conversationKind === 'instance'"
                                    :icon="instanceConversationIcon(option)"
                                    shape="circle"
                                    size="normal"
                                    class="bg-subtle text-muted"
                                />
                                <Avatar
                                    v-else-if="option.conversationKind === 'group' && !isAiChatRow(option)"
                                    icon="pi pi-users"
                                    shape="circle"
                                    size="normal"
                                    class="bg-subtle text-muted"
                                />
                                <AiAvatar v-else-if="isAiChatRow(option) || isBotDirectRow(option)" class="shrink-0" />
                                <Avatar
                                    v-else
                                    :image="conversationAvatar(option)"
                                    :label="conversationAvatar(option) ? null : conversationLabel(option).charAt(0).toUpperCase()"
                                    shape="circle"
                                    size="normal"
                                    class="bg-subtle text-muted [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                                />
                                <span
                                    v-if="option.conversationKind === 'direct' && participantOnline(option)"
                                    class="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-ui bg-status-success"
                                    :aria-label="$t('support.online')"
                                />
                            </div>
                            <div class="flex min-w-0 flex-1 flex-col gap-1">
                                <div class="flex min-w-0 items-baseline gap-2">
                                    <span class="min-w-0 truncate text-label">{{ conversationLabel(option) }}</span>
                                    <small
                                        v-if="option.conversationKind === 'group' && !isAiChatRow(option)"
                                        class="shrink-0 text-muted text-supporting"
                                    >
                                        {{ $t('support.membersCount', { count: (option.participants || []).length }) }}
                                    </small>
                                    <!-- The trailing meta group owns the right
                                         edge whether or not the read check
                                         renders. -->
                                    <span
                                        v-if="(isOwnInboxRow(option) && option.lastMessageRead) || option.timestamp"
                                        class="ml-auto flex shrink-0 items-baseline gap-1"
                                    >
                                        <i
                                            v-if="isOwnInboxRow(option) && option.lastMessageRead"
                                            class="pi pi-check shrink-0 text-[0.75rem] text-primary"
                                            :aria-label="$t('support.messageRead')"
                                        />
                                        <small v-if="option.timestamp" class="text-muted text-supporting">
                                            {{ inboxTimestamp(option.timestamp) }}
                                        </small>
                                    </span>
                                </div>
                                <div class="flex min-w-0 items-center gap-1">
                                    <small class="min-w-0 flex-1 truncate text-muted text-supporting">
                                        <MessageAttachments
                                            v-if="(option.attachments || []).length || (option.instanceRefs || []).length"
                                            :attachments="option.attachments || []"
                                            :refs="option.instanceRefs || []"
                                            single-line
                                        />
                                        <SupportMessageContent
                                            v-else-if="option.lastMessage"
                                            :message="conversationPreviewMessage(option)"
                                            single-line
                                        />
                                        <template v-else>{{ $t('support.noMessages') }}</template>
                                    </small>
                                    <i
                                        v-if="option.pinned"
                                        class="pi pi-thumbtack shrink-0 text-[0.75rem] text-muted"
                                        :aria-label="$t('support.pin')"
                                    />
                                    <Badge
                                        v-if="option.unreadCount > 0"
                                        :value="option.unreadCount"
                                        severity="danger"
                                        size="small"
                                        class="shrink-0"
                                    />
                                </div>
                            </div>
                        </div>
                        </div>
                    </template>
                </Listbox>
            <Menu ref="conversationMenu" :model="conversationMenuItems" :popup="true" />
            </aside>

</template>

<script setup>
import AiAvatar from '~/components/shared/AiAvatar.vue'
import Avatar from 'primevue/avatar'
import Badge from 'primevue/badge'
import Button from 'primevue/button'
import InputGroup from 'primevue/inputgroup'
import InputText from 'primevue/inputtext'
import Listbox from 'primevue/listbox'
import Menu from 'primevue/menu'
import MessageAttachments from '~/components/shared/MessageAttachments.vue'
import StateBlock from '~/components/shared/StateBlock.vue'
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue'
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
const props = defineProps({ thread: Object, fullPage: Boolean, threadOnly: Boolean, embedded: Boolean })
// Two-pane rail width: local drag state, clamped and persisted.
const RAIL_WIDTH_MIN = 16
const RAIL_WIDTH_MAX = 34
const RAIL_WIDTH_KEY = 'chat-rail-width'
const readStoredRailWidth = () => {
    if (typeof window === 'undefined') return 20
    const stored = Number.parseFloat(window.localStorage.getItem(RAIL_WIDTH_KEY) || '')
    return Number.isFinite(stored) ? Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, stored)) : 20
}
const railWidth = ref(readStoredRailWidth())
const railWidthStyle = computed(() => ({ '--chat-rail-width': `${railWidth.value}rem` }))
const railRoot = ref(null)
let railMove = null
const RAIL_GRAB_PX = 10
const onRailPointerDown = (event) => {
    const host = event.currentTarget?.closest?.('.chat-host')
    if (!host || typeof window === 'undefined') return
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.clientX < rect.right - RAIL_GRAB_PX) return
    event.preventDefault()
    railMove = (moveEvent) => {
        const width = (moveEvent.clientX - host.getBoundingClientRect().left) / 16
        railWidth.value = Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, width))
    }
    window.addEventListener('pointermove', railMove)
    window.addEventListener('pointerup', () => {
        if (railMove) window.removeEventListener('pointermove', railMove)
        railMove = null
        try {
            window.localStorage.setItem(RAIL_WIDTH_KEY, String(railWidth.value))
        } catch {}
    }, { once: true })
}
onMounted(() => {
    if (railRoot.value) railRoot.value.addEventListener('pointerdown', onRailPointerDown)
})
onBeforeUnmount(() => {
    if (railRoot.value) railRoot.value.removeEventListener('pointerdown', onRailPointerDown)
    if (railMove && typeof window !== 'undefined') window.removeEventListener('pointermove', railMove)
})

const { activeConversation, closeChat, conversationAvatar, conversationLabel, conversationMenu, conversationMenuItems, conversationPreviewMessage, conversationSections, displayConversations, headerGroupButtonPt, inboxFolders, inboxSearch, inboxTimestamp, instanceConversationIcon, instanceRefs, isAiChatRow, isBotDirectRow, isOwnInboxRow, markRowRead, message, newChatMenuItems, newChatMenuRef, onRowContentClick, onRowTouchEnd, onRowTouchMove, onRowTouchStart, openConversationByKey, openConversationMenu, participantOnline, rowContentStyle, rowDrag, rowRailVisible, selectedFolder, showArchived, toggleNewChatMenu, toggleRowArchived, toggleRowPinned } = props.thread
</script>
