<template>
    <!-- One surface for every host: the popup Dialog, the /chats route, the
         instance detail panel, and the call workspace all embed this same
         plain column — the host owns position, chrome, and stacking. -->
    <div class="chat-host flex h-full min-h-0 w-full items-stretch justify-stretch p-0">
        <div
            v-if="supportDialog || embedded"
            :class="[
                fullPage
                    ? 'chat-page flex h-full min-h-0 w-full flex-col overflow-hidden'
                    : 'flex h-full min-h-0 w-full flex-col overflow-hidden',
                fullPage && activeConversation ? 'chat-page--thread' : ''
            ]"
        >
            <aside
                v-if="(!activeConversation || fullPage) && !threadOnly"
                class="chat-inbox flex min-h-0 flex-1 flex-col overflow-hidden"
                :class="fullPage ? 'chat-inbox--rail border-r border-chrome-border' : ''"
            >
                <div class="flex shrink-0 items-center justify-end gap-1 px-2 pt-2">
                    <Button
                        v-if="showArchived"
                        icon="pi pi-arrow-left"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        class="mr-auto"
                        :aria-label="$t('support.backToChats')"
                        @click="showArchived = false"
                    />
                    <Button
                        icon="pi pi-inbox"
                        :severity="showArchived ? 'primary' : 'secondary'"
                        text
                        rounded
                        size="small"
                        :aria-label="$t('support.archivedConversations')"
                        :aria-pressed="showArchived"
                        @click="showArchived = !showArchived"
                    />
                    <Button
                        icon="pi pi-user-plus"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        :aria-label="$t('support.openChat')"
                        @click="openNewChatDialog"
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
                        :aria-label="$t('common.close')"
                        @click="closeChat"
                    />
                </div>
                <StateBlock
                    v-if="!displayConversations.length"
                    class="m-3"
                    :message="showArchived ? $t('support.noArchivedConversations') : $t('support.noConversations')"
                    :icon="showArchived ? 'pi pi-inbox' : 'pi pi-comments'"
                />
                <Listbox
                    v-else
                    :model-value="activeConversation?.conversationKey || null"
                    :options="conversationSections"
                    option-label="label"
                    option-value="conversationKey"
                    data-key="conversationKey"
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
                              latest-message preview below. Instance chats
                              nest by lineage (the org chat roots the tree):
                              rows with children chats carry a disclosure and
                              nested rows indent by depth. The row menu
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
                                class="relative flex w-full min-w-0 items-start gap-2 md:gap-3"
                                :class="[
                                    rowDrag.key === option.conversationKey ? '' : 'transition-transform',
                                    chatRowIndentClass(option)
                                ]"
                                :style="rowContentStyle(option)"
                            >
                            <!-- Every row carries a fixed-width leading cell:
                                 the tree disclosure for instance rows with
                                 children, empty otherwise — avatars share one
                                 left rhythm whether or not a row expands. -->
                            <span class="flex w-8 shrink-0 items-center justify-center self-start">
                                <Button
                                    v-if="option.conversationKind === 'instance' && hasChatChildren(option)"
                                    :icon="chatTreeExpanded(option) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
                                    severity="secondary"
                                    text
                                    rounded
                                    size="small"
                                    class="h-6 w-6"
                                    :aria-label="$t('support.chatChildren')"
                                    :aria-expanded="chatTreeExpanded(option)"
                                    @click.stop="toggleChatTree(option)"
                                />
                            </span>
                            <div class="relative shrink-0">
                                <Avatar
                                    v-if="option.conversationKind === 'instance'"
                                    :icon="instanceConversationIcon(option)"
                                    shape="circle"
                                    size="normal"
                                    class="bg-subtle text-muted"
                                />
                                <Avatar
                                    v-else-if="option.conversationKind === 'group'"
                                    icon="pi pi-users"
                                    shape="circle"
                                    size="normal"
                                    class="bg-subtle text-muted"
                                />
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
                            <div class="min-w-0 flex-1">
                                <div class="flex min-w-0 items-center gap-2">
                                    <span class="min-w-0 truncate text-label">{{ conversationLabel(option) }}</span>
                                    <small
                                        v-if="option.conversationKind === 'group'"
                                        class="shrink-0 text-muted text-supporting"
                                    >
                                        {{ $t('support.membersCount', { count: (option.participants || []).length }) }}
                                    </small>
                                    <!-- The meta column reserves both lines so
                                         rows with and without a pin/unread
                                         badge share one height. -->
                                    <span class="ml-auto flex min-h-10 shrink-0 flex-col items-end justify-between gap-0.5 pl-1">
                                        <span class="flex items-center gap-1">
                                            <i
                                                v-if="isOwnInboxRow(option) && option.lastMessageRead"
                                                class="pi pi-check shrink-0 text-supporting text-primary"
                                                :aria-label="$t('support.messageRead')"
                                            />
                                            <small v-if="option.timestamp" class="text-muted text-supporting">
                                                {{ inboxTimestamp(option.timestamp) }}
                                            </small>
                                        </span>
                                        <span
                                            v-if="option.pinned || option.unreadCount > 0"
                                            class="flex items-center gap-1"
                                        >
                                            <i
                                                v-if="option.pinned"
                                                class="pi pi-thumbtack shrink-0 text-supporting text-muted"
                                                :aria-label="$t('support.pin')"
                                            />
                                            <Badge
                                                v-if="option.unreadCount > 0"
                                                :value="option.unreadCount"
                                                severity="danger"
                                                size="small"
                                            />
                                        </span>
                                    </span>
                                </div>
                                <div class="flex min-w-0 items-center gap-1">
                                    <small class="min-w-0 flex-1 truncate text-muted">
                                        <SupportMessageContent
                                            v-if="option.lastMessage"
                                            :message="conversationPreviewMessage(option)"
                                            :viewer-user-id="currentUserId"
                                            single-line
                                        />
                                        <ChatAttachments
                                            v-else-if="(option.attachments || []).length"
                                            :attachments="option.attachments"
                                            single-line
                                        />
                                        <template v-else>{{ $t('support.noMessages') }}</template>
                                    </small>
                                </div>
                            </div>
                        </div>
                        </div>
                    </template>
                </Listbox>
            </aside>

            <div v-if="fullPage && !activeConversation" class="chat-empty min-h-0 flex-1 items-center justify-center">
                <StateBlock :message="$t('support.selectConversation')" icon="pi pi-comments" />
            </div>

            <section
                v-if="activeConversation"
                class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                @dragenter="onFilesDragEnter"
                @dragover="onFilesDragOver"
                @dragleave="onFilesDragLeave"
                @drop="onFilesDrop"
            >
                <!-- Drop area: file drags over the thread stage the dropped
                     set through the composer's own attachment flow (caps,
                     instance-chat gating included). -->
                <div
                    v-if="filesDragging"
                    class="pointer-events-none absolute inset-3 z-20 flex flex-col items-center justify-center gap-2 rounded-ui border-2 border-dashed border-chrome-border bg-content text-center"
                    data-testid="chat-drop-zone"
                >
                    <i class="pi pi-upload text-section-heading text-muted" aria-hidden="true" />
                    <span class="text-label">{{ $t('support.dropFiles') }}</span>
                </div>
                <header class="flex shrink-0 items-center gap-2 border-b border-chrome-border px-3 py-3 md:gap-3 md:px-4">
                    <Button
                        v-if="!threadOnly"
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
                        v-if="activeConversation.conversationKind === 'instance'"
                        :icon="instanceConversationIcon(activeConversation)"
                        shape="circle"
                        class="shrink-0 bg-subtle text-muted"
                    />
                    <Avatar
                        v-else-if="activeConversation.conversationKind === 'group'"
                        icon="pi pi-users"
                        shape="circle"
                        class="shrink-0 bg-subtle text-muted"
                    />
                    <Avatar
                        v-else
                        :image="conversationAvatar(activeConversation)"
                        :label="conversationAvatar(activeConversation) ? null : conversationLabel(activeConversation).charAt(0).toUpperCase()"
                        shape="circle"
                        class="shrink-0 bg-primary text-primary-contrast [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                    />
                    <div class="flex min-w-0 flex-1 flex-col">
                        <div class="flex min-w-0 items-center gap-1">
                            <h2 class="m-0 min-w-0 truncate text-section-heading">
                                <!-- The thread title opens the entity popup
                                     (the shared dialog surface): the user's
                                     directory page on direct threads, the
                                     compiled detail screen on instance
                                     threads; the popup's expand action opens
                                     the home pane. The label is the display
                                     name — never an id. -->
                                <Button
                                    v-if="activeConversation.conversationKind === 'direct' && activeRecipientUserId"
                                    link
                                    class="!p-0 text-left"
                                    data-testid="chat-header-entity"
                                    :aria-label="conversationLabel(activeConversation)"
                                    @click="openEntityPopup({ typeId: 'user', instanceId: activeRecipientUserId })"
                                >
                                    {{ conversationLabel(activeConversation) }}
                                </Button>
                                <Button
                                    v-else-if="activeConversation.conversationKind === 'instance' && activeConversation.instanceId"
                                    link
                                    class="!p-0 text-left"
                                    data-testid="chat-header-entity"
                                    :aria-label="conversationLabel(activeConversation)"
                                    @click="openEntityPopup({ typeId: activeConversation.typeId, instanceId: String(activeConversation.instanceId) })"
                                >
                                    {{ conversationLabel(activeConversation) }}
                                </Button>
                                <template v-else>{{ conversationLabel(activeConversation) }}</template>
                            </h2>
                            <Button
                                v-if="activeConversation.conversationKind === 'instance'"
                                icon="pi pi-sitemap"
                                :severity="includeChildren ? 'primary' : 'secondary'"
                                text
                                rounded
                                size="small"
                                class="shrink-0"
                                :aria-label="$t('support.includeChildren')"
                                :aria-pressed="includeChildren"
                                @click="includeChildren = !includeChildren"
                            />
                        </div>
                        <!-- Instance threads carry their lineage breadcrumbs
                             under the title (TraceChain: org root first,
                             links open the ancestor surfaces); group threads
                             carry an overlapping member avatar stack that
                             opens the full member list as a popup. -->
                        <TraceChain
                            v-if="activeConversation.conversationKind === 'instance'"
                            :entity="chatInstanceRecord"
                            :type-id="activeConversation.typeId"
                            class="min-w-0"
                        />
                        <button
                            v-else-if="activeConversation.conversationKind === 'group'"
                            type="button"
                            class="flex min-w-0 items-center gap-1.5"
                            :aria-label="$t('support.members')"
                            data-testid="chat-members-trigger"
                            @click="toggleMembersList($event)"
                        >
                            <AvatarGroup class="shrink-0">
                                <Avatar
                                    v-for="participant in groupParticipants.slice(0, 4)"
                                    :key="participant.id"
                                    :image="participant.avatarUrl"
                                    :label="participant.avatarUrl ? null : participant.name.charAt(0).toUpperCase()"
                                    shape="circle"
                                    class="h-6 w-6 bg-subtle text-supporting [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                                />
                                <Avatar
                                    v-if="groupParticipants.length > 4"
                                    :label="`+${groupParticipants.length - 4}`"
                                    shape="circle"
                                    class="h-6 w-6 bg-subtle text-supporting"
                                />
                            </AvatarGroup>
                        </button>
                        <small v-else-if="conversationSubtitle" class="block truncate text-muted text-supporting">
                            {{ conversationSubtitle }}
                        </small>
                        <Popover ref="membersList" append-to="body">
                            <div class="flex max-h-72 w-64 flex-col items-start gap-2 overflow-y-auto p-3">
                                <UserChip
                                    v-for="participantId in groupParticipantIds"
                                    :key="participantId"
                                    :user-id="participantId"
                                    class="max-w-full"
                                />
                            </div>
                        </Popover>
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
                    v-if="conversationInvite"
                    class="mx-3 mt-3 flex items-center justify-between gap-3 rounded-ui bg-subtle p-3 md:mx-4 md:mt-4"
                >
                    <span class="min-w-0 truncate text-body">
                        {{ $t('call.incoming', { name: conversationInvite.fromName || '' }) }}
                    </span>
                    <div class="flex shrink-0 items-center gap-1">
                        <Button
                            icon="pi pi-phone"
                            severity="danger"
                            rounded
                            size="small"
                            :aria-label="$t('call.join')"
                            @click="joinConversationCall"
                        />
                        <Button
                            icon="pi pi-times"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('call.decline')"
                            @click="callsStore.dismissIncoming(conversationInvite.room)"
                        />
                    </div>
                </div>
                <!-- Ongoing call for this conversation: visible while the room
                     is running, including after the viewer left the call. -->
                <div
                    v-else-if="ongoingCallRoom"
                    class="mx-3 mt-3 flex items-center justify-between gap-3 rounded-ui bg-subtle p-3 md:mx-4 md:mt-4"
                >
                    <span class="min-w-0 truncate text-body">
                        {{ $t('call.ongoing') }}
                    </span>
                    <Button :label="$t('call.join')" icon="pi pi-phone" size="small" @click="joinOngoingCall" />
                </div>
                <div
                    ref="messagesContainer"
                    class="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5 md:p-4 md:gap-2"
                    @scroll="handleMessagesScroll"
                >
                    <!-- Lazy history: the newest page renders first; earlier
                         messages load on scroll-to-top (and via the row
                         itself), preserving the reader's scroll position. -->
                    <Button
                        v-if="hasMoreMessages"
                        :label="$t('support.loadEarlier')"
                        icon="pi pi-arrow-up"
                        text
                        size="small"
                        severity="secondary"
                        :loading="loadingOlder || loadingAnchor"
                        :disabled="loadingOlder || loadingAnchor"
                        @click="loadOlderMessages"
                    />
                    <template
                        v-for="messageItem in messagesList"
                        :key="messageItem._id"
                    >
                        <Divider v-if="messageItem.day" align="center">
                            <span class="text-supporting">{{ messageItem.day }}</span>
                        </Divider>

                        <div
                            :data-message-id="messageItem._id"
                            class="relative flex min-w-0 max-w-support-chat-message touch-pan-y flex-col"
                            :class="isOwnMessage(messageItem) ? 'ml-auto' : 'mr-auto'"
                            @touchstart="onTouchStart($event, messageItem)"
                            @touchmove="onTouchMove($event, messageItem)"
                            @touchend="onTouchEnd(messageItem)"
                            @touchcancel="onTouchCancel(messageItem)"
                            @click="openMessagePopup($event, messageItem)"
                            @contextmenu="openMessageMenuFromRow($event, messageItem, true)"
                        >
                            <!-- Swipe reveal icon: it sits in the gap the
                                 dragged row vacates (right edge for own
                                 messages, left edge for others) and fades in
                                 with the drag distance. The row itself hugs
                                 its side through the auto margin (cross-axis
                                 auto margins disable stretch), exactly like
                                 the pre-swipe layout, so own bubbles stay
                                 flush with the right edge. -->
                            <span
                                v-if="swipeDrag.id === messageItem._id"
                                class="absolute top-1/2 -translate-y-1/2"
                                :class="isOwnMessage(messageItem) ? 'right-1' : 'left-1'"
                                :style="{ opacity: swipeIconOpacity(messageItem) }"
                                aria-hidden="true"
                            >
                                <i
                                    class="pi pi-reply"
                                    :class="swipeArmed.has(messageItem._id) ? 'text-primary' : 'text-muted'"
                                ></i>
                            </span>
                            <div
                                class="flex min-w-0 max-w-full flex-col gap-1"
                                :class="[
                                    // Hug the bubble: the row must not stretch
                                    // full width, or the ±2rem menu overhang
                                    // lands outside the thread column (whose
                                    // overflow-y-auto forces overflow-x auto).
                                    isOwnMessage(messageItem) ? 'self-end' : 'self-start',
                                    isOwnMessage(messageItem) ? 'items-end' : 'items-start',
                                    swipeDrag.id === messageItem._id ? '' : 'transition-transform',
                                    highlightKey === String(messageItem._id) ? 'animate-pulse' : ''
                                ]"
                                :style="swipeStyle(messageItem)"
                            >
                                <!-- Forwarded provenance leads the message
                                     (SPEC §Chat thread): a caption line above
                                     every shape — text, media, or files. -->
                                <span
                                    v-if="messageItem.forwardedFrom"
                                    class="flex min-w-0 items-center gap-1 px-1 text-muted text-supporting"
                                >
                                    <span class="min-w-0 truncate">
                                        {{ $t('support.forwardedFrom', { name: messageItem.forwardedFrom.senderName || $t('common.user') }) }}
                                    </span>
                                </span>
                                <!-- Sender label: group threads lead others'
                                     runs with the sender's avatar and name (the
                                     shared user chip, which opens the entity
                                     popup) — once per run, never for the
                                     viewer's own messages. -->
                                <UserChip
                                    v-if="showSenderLabel(messageItem)"
                                    :user-id="messageSenderKey(messageItem)"
                                    class="max-w-full"
                                />
                                <!-- Reply quote: a quote block, not a control —
                                     plain element with quote styling; no PrimeVue
                                     primitive fits without fighting its chrome. -->
                                <button
                                    v-if="messageItem.parent"
                                    type="button"
                                    class="flex max-w-full min-w-0 flex-col gap-0.5 rounded-ui bg-subtle px-2 py-1 text-left transition-colors"
                                    :aria-label="$t('support.goToMessage')"
                                    @click="goToMessage(messageItem.parent._id)"
                                >
                                    <small class="text-muted text-supporting">
                                        {{ messageItem.parent.senderName || $t('common.user') }}
                                    </small>
                                    <span class="flex min-w-0 items-center gap-1 text-supporting">
                                        <i
                                            v-if="(messageItem.parent.attachments || []).length"
                                            :class="parentAttachmentIcon(messageItem.parent)"
                                            class="shrink-0 text-muted"
                                            aria-hidden="true"
                                        />
                                        <span v-if="messageItem.parent.snippet" class="min-w-0 truncate [overflow-wrap:anywhere]">
                                            {{ messageItem.parent.snippet }}
                                        </span>
                                    </span>
                                </button>
                                <div
                                    v-if="messageBubbleText(messageItem) || (messageItem.instanceRefs || []).length"
                                    class="group relative max-w-full min-w-0 rounded-ui px-4 py-2 text-body"
                                    :class="[
                                        // A voice message's transcript is caption
                                        // chrome on the lower surface — never the
                                        // sender's primary bubble (SPEC: chat); it
                                        // is the viewer's private transcript, so
                                        // only transcribing viewers see text here.
                                        isAudioOnlyMessage(messageItem) ? 'bg-subtle' : isOwnMessage(messageItem)
                                            ? 'bg-primary text-primary-contrast'
                                            : 'bg-subtle',
                                        isAudioOnlyMessage(messageItem) ? 'order-last' : ''
                                    ]"
                                >
                                    <p class="m-0 min-w-0 break-words text-body [overflow-wrap:anywhere]">
                                        <SupportMessageContent :message="bubbleContentMessage(messageItem)" :viewer-user-id="currentUserId" />
                                    </p>
                                    <!-- Plain wrapper owns hover visibility: PrimeVue's runtime
                                         .p-button display rule would defeat utility classes on the
                                         button itself. The menu aligns with the bubble's vertical
                                         center, beside its outer edge. -->
                                    <span
                                        class="absolute top-1/2 -translate-y-1/2 hidden opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 md:block"
                                        :class="isOwnMessage(messageItem) ? '-left-8' : '-right-8'"
                                    >
                                        <Button
                                            icon="pi pi-ellipsis-v"
                                            severity="secondary"
                                            text
                                            rounded
                                            size="small"
                                            :aria-label="$t('common.more')"
                                            @click.stop="openMessageMenu($event, messageItem)"
                                        />
                                    </span>
                                </div>
                                <div
                                    v-if="(messageItem.attachments || []).length"
                                    class="group relative flex max-w-full items-center gap-1"
                                >
                                    <ChatAttachments
                                        :attachments="messageItem.attachments"
                                        class="min-w-0 max-w-full"
                                    />
                                    <!-- Media-only rows have no tappable bubble
                                         (the elements eat taps and long-presses
                                         for playback), so the ellipsis stays
                                         mounted there on touch too — the only
                                         message shape that needs it. -->
                                    <span
                                        class="absolute top-1/2 -translate-y-1/2 hidden opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 md:block"
                                        :class="[
                                            isOwnMessage(messageItem) ? '-left-8' : '-right-8',
                                            !messageItem.message && !(messageItem.instanceRefs || []).length
                                                ? 'max-md:block max-md:opacity-60' : ''
                                        ]"
                                    >
                                        <Button
                                            icon="pi pi-ellipsis-v"
                                            severity="secondary"
                                            text
                                            rounded
                                            size="small"
                                            :aria-label="$t('common.more')"
                                            @click.stop="openMessageMenu($event, messageItem)"
                                        />
                                    </span>
                                </div>
                                <span
                                    v-if="transcribingMessageIds.has(messageItem._id)"
                                    class="flex min-w-0 items-center gap-1 px-1 text-muted text-supporting"
                                >
                                    <i class="pi pi-spin pi-spinner shrink-0" aria-hidden="true" />
                                    <span class="min-w-0 truncate">{{ $t('support.transcribing') }}</span>
                                </span>
                                <!-- Timestamp trails the sender run: only the
                                     last message of a run carries it (SPEC
                                     §Chat thread); the caption row stays
                                     mounted for the instance leaf link
                                     regardless. -->
                                <span
                                    v-if="messageItem.lastOfSenderRun || lowerInstanceChip(messageItem)"
                                    class="flex min-w-0 items-center gap-1 px-1 text-muted text-supporting order-last"
                                >
                                    <template v-if="messageItem.lastOfSenderRun">
                                        {{ formatTime(messageItem.timestamp) }}
                                    </template>
                                    <!-- Messages linked to lower instances keep a
                                         subtle, clickable leaf link inside the
                                         caption; it is inline caption text, not a
                                         control, so a plain minimal element beats
                                         PrimeVue button chrome here. Only the
                                         label underlines on hover; the icon
                                         never does. -->
                                    <button
                                        v-if="lowerInstanceChip(messageItem)"
                                        type="button"
                                        class="group flex min-w-0 items-center gap-1 transition-opacity"
                                        :aria-label="messageItem.instanceLink.name || localizedTypeIdLabel(messageItem.instanceLink.type)"
                                        @click="openLowerInstanceChat(messageItem)"
                                    >
                                        <i :class="instances.iconFor(messageItem.instanceLink.type)" class="shrink-0 scale-90" aria-hidden="true"></i>
                                        <span class="min-w-0 truncate underline-offset-4 group-hover:underline">{{ messageItem.instanceLink.name || localizedTypeIdLabel(messageItem.instanceLink.type) }}</span>
                                    </button>
                                </span>
                            </div>
                        </div>
                    </template>
                </div>

                <div
                    class="flex flex-col gap-2 border-t border-chrome-border p-3 md:p-4"
                    :class="fullPage ? '' : 'max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]'"
                >
                    <div
                        v-show="typingName"
                        ref="typingIndicatorRef"
                        class="px-1 text-muted text-supporting opacity-0"
                    >
                        {{ $t('support.typing', { name: typingName }) }}
                    </div>
                    <!-- Reply quote bar: the next send carries the parent id.
                         Rendered like the in-bubble quote (sender + snippet) —
                         a PrimeVue Message would bring alert chrome that this
                         chat content is not. -->
                    <div
                        v-if="replyTo"
                        class="flex items-center gap-2 rounded-ui bg-subtle px-3 py-2"
                    >
                        <i class="pi pi-reply shrink-0 text-muted" aria-hidden="true"></i>
                        <div class="min-w-0 flex-1">
                            <small class="block truncate text-muted text-supporting">
                                {{ replyTo.parent?.senderName || $t('common.user') }}
                            </small>
                            <span class="block truncate text-supporting">
                                <template v-if="replyTo.parent?.snippet || replyTo.message">
                                    {{ replyTo.parent?.snippet || replyTo.message }}
                                </template>
                                <i
                                    v-else-if="(replyTo.attachments || []).length"
                                    :class="parentAttachmentIcon(replyTo)"
                                    class="text-muted"
                                    aria-hidden="true"
                                />
                            </span>
                        </div>
                        <Button
                            icon="pi pi-times"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            class="shrink-0"
                            :aria-label="$t('common.cancel')"
                            @click="cancelReply"
                        />
                    </div>

                    <!-- Instance target strip: lineage drill-down over all
                         children of the current target. Icon-only breadcrumb
                         pills walk back up, the chip row is the current
                         level, and exactly one target is selected — the
                         composed instance root, the deepest drilled lineage
                         pill, or a drilled leaf chip. Minimal pill elements
                         from semantic tokens: segmented PrimeVue chrome
                         fights the composer density. -->
                    <div
                        v-if="activeConversation.conversationKind === 'instance' && (stripChildren.length || stripTrail.length)"
                        class="flex flex-col gap-1"
                        data-testid="instance-target-strip"
                    >
                        <div class="flex items-center gap-1 overflow-x-auto">
                            <button
                                type="button"
                                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-ui transition-colors"
                                :class="stripRootSelected
                                    ? 'bg-primary text-primary-contrast'
                                    : 'bg-subtle text-muted hover:opacity-80'"
                                :title="activeConversation.instanceName || localizedTypeIdLabel(activeConversation.typeId)"
                                :aria-label="activeConversation.instanceName || localizedTypeIdLabel(activeConversation.typeId)"
                                :aria-current="stripRootSelected ? 'true' : undefined"
                                @click="resetStripTrail()"
                            >
                                <i :class="instanceConversationIcon(activeConversation)" aria-hidden="true"></i>
                            </button>
                            <template v-for="(crumb, index) in stripTrail" :key="crumb.key">
                                <i class="pi pi-angle-right shrink-0 text-muted" aria-hidden="true"></i>
                                <button
                                    type="button"
                                    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-ui transition-colors"
                                    :class="isTrailEntrySelected(crumb)
                                        ? 'bg-primary text-primary-contrast'
                                        : 'bg-subtle text-muted hover:opacity-80'"
                                    :title="crumb.name || localizedTypeIdLabel(crumb.type)"
                                    :aria-label="crumb.name || localizedTypeIdLabel(crumb.type)"
                                    :aria-current="isTrailEntrySelected(crumb) ? 'true' : undefined"
                                    @click="truncateStripTrail(index)"
                                >
                                    <i :class="instances.iconFor(crumb.type)" aria-hidden="true"></i>
                                </button>
                            </template>
                            <template v-if="stripChildren.length">
                                <i class="pi pi-angle-right shrink-0 text-muted" aria-hidden="true"></i>
                                <button
                                    v-for="chip in stripChildren"
                                    :key="chip.key"
                                    type="button"
                                    :disabled="Boolean(replyTo)"
                                    class="flex shrink-0 items-center gap-1 rounded-ui px-2 py-1 text-supporting transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                                    :class="isChipSelected(chip)
                                        ? 'bg-primary text-primary-contrast'
                                        : 'bg-subtle text-muted hover:opacity-80'"
                                    :aria-pressed="isChipSelected(chip)"
                                    @click="drillStripTo(chip)"
                                >
                                    <i :class="instances.iconFor(chip.type)" class="shrink-0" aria-hidden="true"></i>
                                    <span class="max-w-32 truncate">{{ chip.name || localizedTypeIdLabel(chip.type) }}</span>
                                </button>
                            </template>
                        </div>
                    </div>

                    <div v-if="messagePreviewVisible" class="rounded-ui bg-subtle p-2 text-muted text-body">
                        <SupportMessageContent :message="draftPreviewMessage" :viewer-user-id="currentUserId" />
                    </div>
                    <div v-if="instanceRefs.length" class="flex flex-wrap gap-2">
                        <div
                            v-for="ref in instanceRefs"
                            :key="`${ref.type}-${ref.id}`"
                            class="inline-flex max-w-full items-center gap-1 rounded-ui bg-subtle px-2 py-1"
                        >
                            <InstanceInlineRef
                                :type="ref.type"
                                :id="ref.id"
                                :entity="ref.instance || null"
                                :fetch="!ref.instance"
                            />
                            <Button
                                icon="pi pi-times"
                                text
                                rounded
                                size="small"
                                :aria-label="$t('common.delete')"
                                @click="removeInstanceRef(ref)"
                            />
                        </div>
                    </div>
                    <!-- Staged files: image thumbnails or type icons, the
                         resolved child-type identity for instance targets
                         (a choice when several children accept the file),
                         and removal before send. Uploads ride the attach
                         popover. -->
                    <div v-if="composerStagedRows.length" class="flex max-h-44 flex-col gap-1 overflow-y-auto" data-testid="chat-pending-files">
                        <div
                            v-for="row in composerStagedRows"
                            :key="row.key"
                            class="flex max-w-full min-w-0 flex-col gap-1"
                        >
                            <div class="inline-flex max-w-full min-w-0 items-center gap-2 rounded-ui bg-subtle px-2 py-1">
                            <img
                                v-if="row.kind === 'image' && row.url"
                                :src="row.url"
                                alt=""
                                class="h-8 w-8 shrink-0 rounded-ui object-cover"
                            >
                            <i v-else :class="pendingFileIcon(row)" class="shrink-0 text-muted" aria-hidden="true" />
                            <span class="min-w-0 flex-1 truncate text-supporting">{{ row.file.name }}</span>
                            <small v-if="row.file.size" class="shrink-0 text-muted text-supporting">{{ formatFileSize(row.file.size) }}</small>
                            <Select
                                v-if="!row.outgoing && row.candidates.length > 1"
                                :model-value="row.targetTypeId"
                                :options="row.candidates"
                                option-label="label"
                                option-value="typeId"
                                class="w-40 shrink-0"
                                :aria-label="$t('support.attachmentTargetType')"
                                @update:model-value="value => setPendingTarget(row.key, value)"
                            />
                            <span
                                v-else-if="row.targetTypeId"
                                class="inline-flex min-w-0 shrink-0 items-center gap-1 text-muted text-supporting"
                                :title="pendingTargetLabel(row)"
                            >
                                <i :class="instances.iconFor(row.targetTypeId)" class="shrink-0" aria-hidden="true" />
                                <span class="max-w-32 truncate">{{ pendingTargetLabel(row) }}</span>
                            </span>
                            <Button
                                v-if="!row.outgoing"
                                icon="pi pi-times"
                                text
                                rounded
                                size="small"
                                :aria-label="$t('common.delete')"
                                @click="removePendingFile(row.key)"
                            />
                            </div>
                            <ProgressBar
                                v-if="row.progress != null && row.progress < 1"
                                :value="Math.round(row.progress * 100)"
                                class="w-full"
                                :show-value="false"
                            />
                        </div>
                    </div>
                    <div v-if="recipientLimitedRefs.length" class="flex flex-col gap-1 text-status-warning text-supporting">
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
                    <!-- Voice recording replaces the composer row: one line —
                         the live badge with the elapsed timer, then
                         pause/resume, cancel, and stop-and-send. -->
                    <div
                        v-if="voiceRecording"
                        class="flex items-center gap-1 rounded-ui bg-subtle p-1.5"
                        data-testid="chat-recording-row"
                    >
                        <span class="flex min-w-0 shrink-0 items-center gap-2 px-2 text-label">
                            <i
                                class="pi pi-circle-fill shrink-0 text-status-danger"
                                :class="voicePaused ? '' : 'animate-pulse'"
                                aria-hidden="true"
                            />
                            <span class="tabular-nums">{{ formatRecordingDuration(recordingElapsed) }}</span>
                        </span>
                        <span v-if="voicePaused" class="min-w-0 flex-1 truncate text-muted text-supporting">
                            {{ $t('support.recordingPaused') }}
                        </span>
                        <span v-else class="flex-1" aria-hidden="true"></span>
                        <Button
                            :icon="voicePaused ? 'pi pi-play' : 'pi pi-pause'"
                            severity="secondary"
                            text
                            rounded
                            class="shrink-0"
                            :aria-label="voicePaused ? $t('support.resumeRecording') : $t('support.pauseRecording')"
                            @click="toggleVoiceRecordingPause"
                        />
                        <Button
                            icon="pi pi-times"
                            severity="secondary"
                            text
                            rounded
                            class="shrink-0"
                            :aria-label="$t('common.cancel')"
                            @click="cancelVoiceRecording"
                        />
                        <Button
                            icon="pi pi-send"
                            severity="primary"
                            rounded
                            class="shrink-0"
                            :loading="voiceSending"
                            :disabled="voiceSending"
                            :aria-label="$t('support.stopAndSend')"
                            @click="stopAndSendVoiceRecording"
                        />
                    </div>
                    <!-- Composer: one clean rounded surface — attach action,
                         a growing borderless field, and a trailing action
                         that swaps between voice record and send. -->
                    <div v-else class="flex items-end gap-1 rounded-ui bg-subtle p-1.5" data-testid="chat-composer">
                        <Button
                            icon="pi pi-paperclip"
                            severity="secondary"
                            text
                            rounded
                            class="shrink-0"
                            :disabled="attachmentPickerEmpty"
                            :aria-label="$t('support.attach')"
                            data-testid="chat-attach-trigger"
                            @click="openAttachmentPicker($event)"
                        />
                        <Textarea
                            :placeholder="$t('support.typeMessage')"
                            :pt="composerTextareaPt"
                            class="min-w-0 max-h-40 flex-1 overflow-y-auto"
                            v-model="message"
                            @input="handleTypingInput"
                            @keydown="handleKeyDown"
                            @paste="handleComposerPaste"
                            rows="1"
                            autoResize
                        />
                        <Button
                            v-if="!canSendComposerDraft && voiceRecordingSupported && voiceRecordingAllowed"
                            icon="pi pi-microphone"
                            severity="secondary"
                            text
                            rounded
                            class="shrink-0"
                            :aria-label="$t('support.recordVoice')"
                            @click="startVoiceRecording"
                        />
                        <Button
                            v-else
                            icon="pi pi-send"
                            severity="primary"
                            rounded
                            class="shrink-0"
                            :disabled="!canSendComposerDraft"
                            :aria-label="$t('support.send')"
                            @click="sendMessage"
                        />
                    </div>
                </div>
                <ChatAttachmentPicker
                    ref="attachmentPicker"
                    :files-enabled="chatUploadEnabled"
                    :files-accept="chatFileAcceptAttr"
                    @select="selectAttachment"
                    @create-action="runCreateAction"
                    @files="stageChatFiles"
                />
            </section>
        </div>
        <StandardDialog
            v-model:visible="callDialog"
            size="full"
            fill
            :show-default-footer="false"
        >
            <template #header>
                <span class="min-w-0 truncate text-label">{{ callHeaderLabel }}</span>
            </template>
            <div class="flex min-h-0 flex-1 flex-col">
                <CallPanel v-if="callDialog && callRoom" :key="callRoom" :room="callRoom" park-on-unmount @closed="callDialog = false" />
            </div>
        </StandardDialog>
        <StandardDialog
            v-model:visible="newChatDialog"
            size="sm"
            :show-default-footer="false"
        >
            <template #header>
                <span>{{ $t('support.newChat') }}</span>
            </template>
            <div class="flex flex-col gap-3" data-testid="new-chat-picker">
                <!-- The picker's own search: empty query keeps the
                     organization-scoped list; a typed query searches the
                     directory (name-only, cross-tenant) — direct threads
                     are open between any two accounts, and every match
                     except the caller's own entry is listed. -->
                <IconField>
                    <InputIcon class="pi pi-search" />
                    <InputText
                        v-model="newChatSearch"
                        type="text"
                        class="w-full"
                        :placeholder="$t('directory.searchPlaceholder')"
                        data-testid="new-chat-search"
                    />
                </IconField>
                <div v-if="newChatSearching" class="text-muted text-body">{{ $t('directory.searching') }}</div>
                <Listbox
                    v-else
                    :model-value="null"
                    :options="newChatOptions"
                    option-label="label"
                    option-value="value"
                    :aria-label="$t('support.newChat')"
                    class="border-0"
                    @update:model-value="openNewChatUser"
                >
                    <template #option="{ option }">
                        <div class="flex min-w-0 items-center gap-2">
                            <Avatar
                                :image="option.instance?.data?.avatarUrl || null"
                                :label="!option.instance?.data?.avatarUrl ? String(option.label || '?').charAt(0).toUpperCase() : null"
                                shape="circle"
                                class="shrink-0 bg-subtle text-muted [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                            />
                            <span class="min-w-0 flex-1 truncate text-label">{{ option.label }}</span>
                        </div>
                    </template>
                </Listbox>
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
                <!-- Same reach as the direct picker: organization members
                     plus directory matches for the typed query — group
                     participants are user-scope, not organization-scope. -->
                <IconField>
                    <InputIcon class="pi pi-search" />
                    <InputText
                        v-model="groupMemberSearch"
                        type="text"
                        class="w-full"
                        :placeholder="$t('directory.searchPlaceholder')"
                    />
                </IconField>
                <InstanceMultiSelect
                    v-model="groupMemberIds"
                    :options="groupMemberOptions"
                    option-label="label"
                    option-value="value"
                    type-id="user"
                    :loading="newChatUsersLoading || groupMemberSearching"
                    :placeholder="$t('support.selectMembers')"
                    :aria-label="$t('support.selectMembers')"
                    class="w-full"
                />
            </div>
        </StandardDialog>
        <StandardDialog
            v-model:visible="createPromptVisible"
            size="sm"
            :show-default-footer="true"
            :save-label="pendingCreateActionLabel"
            :cancel-label="$t('common.cancel')"
            :loading="executingCreate"
            @save="submitCreatePrompt"
            @cancel="createPromptVisible = false; pendingCreateAction = null"
        >
            <template #header>
                <span>{{ pendingCreateActionLabel }}</span>
            </template>
            <div class="flex flex-col gap-3">
                <label v-for="field in createPromptFields" :key="field.id" class="flex flex-col gap-1">
                    <span class="text-muted text-supporting">{{ field.label || field.id }}</span>
                    <Select
                        v-if="field.type === 'instance'"
                        v-model="createPromptValues[field.id]"
                        :options="createPromptOptions[field.id] || []"
                        option-label="label"
                        option-value="value"
                        :type-id="field.typeId || field.accepts?.[0] || ''"
                        filter
                        class="w-full"
                    />
                    <InstanceMultiSelect
                        v-else-if="field.type === 'typeList'"
                        v-model="createPromptValues[field.id]"
                        :options="createPromptOptions[field.id] || []"
                        option-label="label"
                        option-value="value"
                        :type-id="field.typeId || field.accepts?.[0] || ''"
                        filter
                        class="w-full"
                    />
                    <Select
                        v-else-if="field.type === 'enum'"
                        v-model="createPromptValues[field.id]"
                        :options="field.options || []"
                        class="w-full"
                    />
                    <ToggleSwitch
                        v-else-if="field.type === 'boolean'"
                        v-model="createPromptValues[field.id]"
                    />
                    <div v-else-if="field.type === 'file'" class="flex items-center gap-2">
                        <input
                            :ref="el => setPayloadInputEl(field.id, el)"
                            class="hidden"
                            type="file"
                            :accept="field.accept || undefined"
                            :capture="field.capture || undefined"
                            @change="event => uploadPayloadFile(field, event)"
                        >
                        <Button
                            icon="pi pi-upload"
                            :label="$t('common.upload')"
                            size="small"
                            severity="secondary"
                            outlined
                            :loading="uploadingPayloadField === field.id"
                            @click="payloadInputEl(field.id)?.click()"
                        />
                        <span v-if="createPromptValues[field.id]?.name" class="text-muted text-supporting truncate">{{ createPromptValues[field.id].name }}</span>
                    </div>
                    <DatePicker
                        v-else-if="field.type === 'date' || field.type === 'dateTime'"
                        v-model="createPromptValues[field.id]"
                        :show-time="field.type === 'dateTime'"
                        hour-format="24"
                        class="w-full"
                    />
                    <InputText
                        v-else
                        v-model="createPromptValues[field.id]"
                        :type="field.type === 'number' ? 'number' : 'text'"
                    />
                </label>
            </div>
        </StandardDialog>
        <StandardDialog
            v-model:visible="forwardDialog"
            size="sm"
            :show-default-footer="false"
        >
            <template #header>
                <span>{{ $t('support.forwardTo') }}</span>
            </template>
            <div class="flex flex-col gap-3" data-testid="chat-forward-picker">
                <StateBlock
                    v-if="!forwardOptions.length"
                    :message="$t('support.noConversations')"
                    icon="pi pi-comments"
                />
                <Listbox
                    v-else
                    :model-value="null"
                    :options="forwardOptions"
                    option-label="label"
                    option-value="conversationKey"
                    data-key="conversationKey"
                    :aria-label="$t('support.forwardTo')"
                    class="border-0"
                    :loading="forwarding"
                    @update:model-value="key => forwardToConversation(key)"
                >
                    <template #option="{ option }">
                        <div class="flex min-w-0 items-center gap-2">
                            <Avatar
                                v-if="option.conversationKind === 'group'"
                                icon="pi pi-users"
                                shape="circle"
                                class="shrink-0 bg-subtle text-muted"
                            />
                            <Avatar
                                v-else-if="option.conversationKind === 'instance'"
                                :icon="instanceConversationIcon(option)"
                                shape="circle"
                                class="shrink-0 bg-subtle text-muted"
                            />
                            <Avatar
                                v-else
                                :image="conversationAvatar(option)"
                                :label="conversationAvatar(option) ? null : conversationLabel(option).charAt(0).toUpperCase()"
                                shape="circle"
                                class="shrink-0 bg-subtle text-muted [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                            />
                            <span class="min-w-0 flex-1 truncate text-label">{{ conversationLabel(option) }}</span>
                        </div>
                    </template>
                </Listbox>
            </div>
        </StandardDialog>
        <Menu ref="messageMenu" :model="messageMenuItems" :popup="true" />
        <Menu ref="conversationMenu" :model="conversationMenuItems" :popup="true" />
    </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import { conversationKeyForRoom } from '~/utils/call-rooms.js'
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue'
import UserChip from '~/components/shared/UserChip.vue'
import Avatar from 'primevue/avatar'
import Badge from 'primevue/badge'
import Divider from 'primevue/divider'
import Listbox from 'primevue/listbox'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Select from '~/components/shared/InstanceSelect.vue'
import InstanceMultiSelect from '~/components/shared/InstanceMultiSelect.vue'
import Textarea from 'primevue/textarea'
import Menu from 'primevue/menu'
import ProgressBar from 'primevue/progressbar'
import ToggleSwitch from 'primevue/toggleswitch'
import DatePicker from 'primevue/datepicker'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue'
import ChatAttachments from '~/components/shared/ChatAttachments.vue'
import StateBlock from '~/components/shared/StateBlock.vue'
import StandardDialog from '~/components/shared/StandardDialog.vue'
import ChatAttachmentPicker from '~/components/shared/ChatAttachmentPicker.vue'
import TraceChain from '~/components/shared/links/TraceChain.vue'
import Popover from 'primevue/popover'
import AvatarGroup from 'primevue/avatargroup'
import CallPanel from '~/components/calls/CallPanel.vue'
import { collectActionInputFields, initialPromptValue, promptData, promptedFields } from '~/components/generated/action-inputs.js'
import { isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js'
import { generatedActionLabel } from '~/utils/generated-labels.js'
import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState'
import { useConnections } from '~/composables/useConnections.js'
import { usePayloadUpload } from '~/composables/usePayloadUpload.js'
import { useInstancesStore } from '~/stores/instances'
import { useRegistryStore } from '~/stores/registry'
import { detailRouteForInstance } from '~/components/generated/instance-detail-routing.js'
import { openInstanceChat } from '~/utils/instance-chat.js'
import { useEntityPopup } from '~/composables/useEntityPopup'
import { isInteractiveEventTarget } from '~/utils/interactive-target.js'
import { openChatInWorkspaceTab } from '~/utils/chat-workspace-open.js'
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js'
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js'
import { useEnterExit, enterOnce } from '~/composables/useMotion.js'
import { useFileTypeView } from '~/composables/useFileTypeView.js'
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
import { useCallsStore } from '~/stores/calls'
import { useCallRouting } from '~/composables/useCallRouting.js'

const props = defineProps({
    embedded: {
        type: Boolean,
        default: false
    },
    fullPage: { type: Boolean, default: false },
    conversationKey: { type: String, default: '' },
    openCallInPane: { type: Boolean, default: false },
    // Detail-page panels pin one instance thread: no inbox, no back navigation.
    threadOnly: { type: Boolean, default: false },
    // Instance display name hint for synthesized stubs before the snapshot
    // fills the thread title.
    instanceName: { type: String, default: '' }
})

const emit = defineEmits(['open-call'])

const { t, te } = useI18n()
const confirm = useConfirm()
const toast = useToast()
const supportDialog = useSupportDialog()
const chatTarget = useSupportChatTarget()
const { open: openEntityPopup } = useEntityPopup()
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
const { uploadingPayloadField, setPayloadInputEl, payloadInputEl, uploadPayloadFile } = usePayloadUpload(
  createPromptValues,
  { onError: error => toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message, life: 8000 }) }
)
const executingCreate = ref(false)
const activeConversation = ref(null)
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
let typingResetTimer = null
let typingSendTimer = null

const typingActive = computed(() => Boolean(typingName.value))
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
    return type
}


// Instance chats nest by lineage: every messaged instance has its own chat
// row, and each row carries its nearest row-bearing ancestor's key as
// parentKey — the org chat roots the tree, deeper instances nest under
// their parent instance's chat. Rows without a visible parent stay at the
// top level.
const expandedChatKeys = ref(new Set())
const chatTreeExpanded = (conversation) => expandedChatKeys.value.has(conversation.conversationKey)
const toggleChatTree = (conversation) => {
    const next = new Set(expandedChatKeys.value)
    if (next.has(conversation.conversationKey)) next.delete(conversation.conversationKey)
    else next.add(conversation.conversationKey)
    expandedChatKeys.value = next
}
const chatChildrenByKey = computed(() => {
    const byKey = new Map()
    for (const conversation of supportChatStore.conversations) {
        if (conversation.conversationKind !== 'instance' || !conversation.parentKey) continue
        byKey.set(conversation.parentKey, [...(byKey.get(conversation.parentKey) || []), conversation])
    }
    return byKey
})
const hasChatChildren = (conversation) => (chatChildrenByKey.value.get(conversation.conversationKey) || []).length > 0
// Nesting depth follows the visible parent chain (roots at 0).
const chatRowDepth = (conversation) => {
    let depth = 0
    let current = conversation
    const guard = new Set()
    while (current?.parentKey && !guard.has(current.parentKey)) {
        guard.add(current.parentKey)
        depth += 1
        current = supportChatStore.conversations.find(item => item.conversationKey === current.parentKey)
    }
    return depth
}
const CHAT_ROW_INDENT = ['pl-7', 'pl-11', 'pl-14']
const chatRowIndentClass = (conversation) => {
    const depth = chatRowDepth(conversation)
    return depth ? CHAT_ROW_INDENT[Math.min(depth, CHAT_ROW_INDENT.length) - 1] : ''
}
// Archived conversations live behind the inbox header toggle; the default
// list hides them.
const showArchived = ref(false)

const displayConversations = computed(() => supportChatStore.conversations
    .filter(conversation => {
        if (Boolean(conversation.archived) !== showArchived.value) return false
        return ['direct', 'group'].includes(conversation.conversationKind)
            || conversation.conversationKind === 'instance'
    }))

// One unified inbox: person, group, and instance chats share a single
// list; pinned rows lead, everything else follows the latest activity, and
// an expanded instance chat lists its children chats — recursively —
// directly under it.
const byLatestActivity = (left, right) => {
    if (Boolean(right.pinned) !== Boolean(left.pinned)) return right.pinned ? 1 : -1
    const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0
    const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0
    return rightTime - leftTime
}
const conversationSections = computed(() => {
    const visible = displayConversations.value
    const visibleKeys = new Set(visible.map(conversation => conversation.conversationKey))
    const childrenOf = key => (chatChildrenByKey.value.get(key) || [])
        .filter(child => visibleKeys.has(child.conversationKey))
        .sort(byLatestActivity)
    const rooted = (conversation) => {
        if (conversation.conversationKind !== 'instance') return true
        return !conversation.parentKey || !visibleKeys.has(conversation.parentKey)
    }
    const appendTree = (conversation, acc) => {
        acc.push(conversation)
        if (!chatTreeExpanded(conversation)) return
        for (const child of childrenOf(conversation.conversationKey)) appendTree(child, acc)
    }
    return visible
        .filter(rooted)
        .sort(byLatestActivity)
        .reduce((acc, conversation) => {
            appendTree(conversation, acc)
            return acc
        }, [])
})



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
            id: String(id),
            name: record?.identity?.name || '',
            avatarUrl: record?.data?.avatarUrl || ''
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
    if (conversation?.conversationKind !== 'group') return false
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

const handleKeyDown = (event) => {
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
        // for retry.
        const attachments = []
        for (const pending of sendingFiles) {
            attachments.push(await uploadPendingFile(pending))
        }
        await $fetch('/api/support/messages', {
            method: 'POST',
            body: {
                message: sendingText,
                recipientUserId: conversation.conversationKind === 'direct' ? participantUserId(conversation) : null,
                conversationKey: conversation.conversationKind === 'group' ? conversation.conversationKey : null,
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
const VOICE_RECORDING_MAX_SECONDS = 600
const voiceRecording = ref(false)
const voicePaused = ref(false)
const voiceSending = ref(false)
const recordingElapsed = ref(0)
const voiceRecordingSupported = computed(() => process.client
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined')
let mediaRecorder = null
let recordedChunks = []
let recordingStream = null
let recordingTimer = null
// Pause-aware elapsed accounting: seconds accumulated before the current
// run plus the live run's span, so the badge freezes while paused.
let recordingElapsedBase = 0
let recordingRunStartedAt = 0

const formatRecordingDuration = (seconds) => {
    const total = Math.max(0, Math.floor(seconds))
    const minutes = Math.floor(total / 60)
    const rest = total % 60
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

const stopRecordingTracks = () => {
    if (recordingTimer) {
        clearInterval(recordingTimer)
        recordingTimer = null
    }
    if (recordingStream) {
        for (const track of recordingStream.getTracks()) track.stop()
        recordingStream = null
    }
}

const teardownRecording = () => {
    stopRecordingTracks()
    mediaRecorder = null
    recordedChunks = []
    voiceRecording.value = false
    voicePaused.value = false
    recordingElapsed.value = 0
}

const startRecordingTimer = () => {
    if (recordingTimer) clearInterval(recordingTimer)
    recordingTimer = setInterval(() => {
        recordingElapsed.value = recordingElapsedBase
            + Math.floor((Date.now() - recordingRunStartedAt) / 1000)
        if (recordingElapsed.value >= VOICE_RECORDING_MAX_SECONDS) stopAndSendVoiceRecording()
    }, 500)
}

const currentRecordingSeconds = () => (voicePaused.value
    ? recordingElapsedBase
    : recordingElapsedBase + (Date.now() - recordingRunStartedAt) / 1000)

const toggleVoiceRecordingPause = () => {
    if (!mediaRecorder || voiceSending.value) return
    if (mediaRecorder.state === 'recording') {
        mediaRecorder.pause()
        recordingElapsedBase = recordingElapsed.value
        if (recordingTimer) {
            clearInterval(recordingTimer)
            recordingTimer = null
        }
        voicePaused.value = true
        return
    }
    if (mediaRecorder.state === 'paused') {
        mediaRecorder.resume()
        recordingRunStartedAt = Date.now()
        startRecordingTimer()
        voicePaused.value = false
    }
}

const startVoiceRecording = async () => {
    if (voiceRecording.value || !voiceRecordingSupported.value) return
    try {
        recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.message || '', life: 4000 })
        return
    }
    recordedChunks = []
    mediaRecorder = new MediaRecorder(recordingStream)
    mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size) recordedChunks.push(event.data)
    }
    recordingElapsedBase = 0
    recordingRunStartedAt = Date.now()
    recordingElapsed.value = 0
    voicePaused.value = false
    startRecordingTimer()
    mediaRecorder.start()
    voiceRecording.value = true
}

const cancelVoiceRecording = () => {
    if (!mediaRecorder) {
        teardownRecording()
        return
    }
    mediaRecorder.onstop = () => teardownRecording()
    mediaRecorder.stop()
    stopRecordingTracks()
}

const stopAndSendVoiceRecording = () => {
    if (!mediaRecorder || voiceSending.value) return
    const recorder = mediaRecorder
    const mimeType = recorder.mimeType || 'audio/webm'
    const durationSeconds = Math.max(1, Math.round(currentRecordingSeconds()))
    recorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: mimeType })
        teardownRecording()
        if (!blob.size || !activeConversation.value) return
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
            await $fetch('/api/support/messages', {
                method: 'POST',
                body: {
                    message: sendingText,
                    recipientUserId: conversation.conversationKind === 'direct' ? participantUserId(conversation) : null,
                    conversationKey: conversation.conversationKind === 'group' ? conversation.conversationKey : null,
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
        } catch (error) {
            if (!message.value.trim()) message.value = sendingText
            replyTo.value = replyTo.value || sendingReply
            console.error('Failed to send voice message:', error)
            toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 })
        } finally {
            voiceSending.value = false
        }
    }
    recorder.stop()
    stopRecordingTracks()
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
// carrying none — the viewer's transcript. Reply quotes and inbox previews
// read the authored body alone, so private transcripts never leave the
// transcribing viewer's bubble.
const messageBubbleText = (messageItem) => (isAudioOnlyMessage(messageItem) && !String(messageItem.message || '').trim()
    ? String(messageItem.transcript || '')
    : String(messageItem.message || ''))

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
    const token = ++conversationLoadToken
    messages.value = []
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
    const container = messagesContainer.value
    if (!container || !hasMoreMessages.value || loadingOlder.value || loadingAnchor.value) return
    if (container.scrollTop <= 60) loadOlderMessages()
}

// Instance target strip: picking a child drills into it (the next message
// lands there); children load through the same containment sources the
// sidebar uses.
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

// A lineage pill is selected when it is the current composer target (the
// deepest drilled level); drilled leaf chips compare the same way.
const isTrailEntrySelected = (entry) => Boolean(composerInstance.value)
    && composerInstance.value.type === entry.type
    && String(composerInstance.value.id) === String(entry.id)

// Children of the current target: containment-sourced entries plus the
// children already seen in this thread's message paths — the path-derived
// set keeps the strip alive for targets without detail-screen sources (the
// organization chat) and before lists load.
const stripChildren = computed(() => {
    const loaded = stripChildrenByKey.value.get(stripTargetKey.value) || []
    const byKey = new Map(loaded.map(item => [item.key, item]))
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'instance') return loaded
    const pathIndex = (path) => path.findIndex(entry => (
        entry.type === conversation.typeId && String(entry.id) === String(conversation.instanceId)
    ))
    for (const messageItem of messages.value) {
        const path = messageItem.instancePath || []
        let base = -1
        if (!stripTrail.value.length) {
            base = pathIndex(path)
        } else {
            const deepest = stripTrail.value[stripTrail.value.length - 1]
            base = path.findIndex(entry => entry.type === deepest.type && String(entry.id) === String(deepest.id))
        }
        const child = base >= 0 ? path[base + 1] : null
        if (!child?.type || !child?.id) continue
        const key = `${child.type}:${child.id}`
        if (!byKey.has(key)) {
            byKey.set(key, { key, type: child.type, id: String(child.id), name: child.name || child.id, entity: null })
        }
    }
    return [...byKey.values()]
})

async function loadStripChildren(targetKey, targetType, targetInstance = null) {
    if (!targetKey || stripChildrenByKey.value.has(targetKey) || stripLoadingKeys.value.has(targetKey)) return
    stripLoadingKeys.value = new Set([...stripLoadingKeys.value, targetKey])
    try {
        const sources = linkedExplorerChildSources({
            linkedItems: [{ key: targetKey, type: targetType, entity: targetInstance }],
            screens: authStore.screenManifest,
            containment: effectiveContainmentForStrip()
        })
        const loaded = await Promise.all(sources.map(async source => {
            try {
                const childInstances = await instances.listInstances(instances.canonicalTypeKey(source.typeId), source.filters)
                return (Array.isArray(childInstances) ? childInstances : []).map(instance => ({
                    key: `${source.typeId}:${stripInstanceId(instance)}`,
                    type: source.typeId,
                    id: stripInstanceId(instance),
                    name: instance?.identity?.name || instance?.identity?.serial || stripInstanceId(instance) || source.typeId,
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

function effectiveContainmentForStrip() {
    const bindings = authStore.lineageBindings || []
    const edges = authStore.processActive
        ? bindings.map(binding => ({
            childType: binding.childTypeId,
            parentType: binding.parentTypeId,
            lineageKey: binding.lineageKey
        }))
        : [...registry.containment]
    // Detail screens declare deeper hierarchy than the compiled bindings
    // (nesting runs under queues, sheet designs under runs): every list
    // source on a type's detail screen is a child edge, with the lineage
    // key read from the filter placeholder target.
    for (const screen of authStore.screenManifest || []) {
        if (screen.template !== 'instanceDetail' || !screen.typeId) continue
        for (const source of screen.sources || []) {
            if (source.mode !== 'list' || source.typeId === screen.typeId) continue
            if (edges.some(edge => edge.parentType === screen.typeId && edge.childType === source.typeId)) continue
            const filterEntry = Object.entries(source.filters || {})
                .find(([, value]) => typeof value === 'string' && value.startsWith('$screen'))
            if (!filterEntry) continue
            edges.push({
                childType: source.typeId,
                parentType: screen.typeId,
                lineageKey: filterEntry[0]
            })
        }
    }
    return edges
}

const stripInstanceId = (entity = null) => {
    const value = entity?._id || entity?.identity?.uid || ''
    return value ? String(value) : ''
}

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

// Selection is exactly one target: key-based comparison so chips from any
// source (loaded or path-derived) match reliably.
const isChipSelected = (chip) => Boolean(composerInstance.value)
    && composerInstance.value.type === chip.type
    && String(composerInstance.value.id) === String(chip.id ?? (chip.key || '').split(':').slice(1).join(':'))

async function drillStripTo(chip) {
    if (replyTo.value) return
    composerInstanceTouched = true
    composerInstance.value = { type: chip.type, id: chip.id, name: chip.name }
    // A child target only lands visibly in the composed subtree view; the
    // own-messages filter would hide the sent message entirely.
    if (!includeChildren.value) includeChildren.value = true
    await loadStripChildren(chip.key, chip.type, chip.entity)
    // Collapse into breadcrumbs only when the drilled target opens another
    // level; single-level targets keep the flat list with the selection.
    const children = stripChildrenByKey.value.get(chip.key) || []
    if (children.length) stripTrail.value = [...stripTrail.value, chip]
}

function truncateStripTrail(index) {
    stripTrail.value = stripTrail.value.slice(0, index + 1)
    const deepest = stripTrail.value[stripTrail.value.length - 1] || null
    composerInstanceTouched = true
    composerInstance.value = deepest
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
            icon: transcribing ? 'pi pi-spin pi-spinner' : 'pi pi-eye',
            disabled: transcribing,
            command: () => {
                messageMenu.value?.hide?.()
                transcribeAudioMessage(messageMenuTarget.value)
                messageMenuTarget.value = null
            }
        })
    }
    // One download entry per attachment, labeled by a cropped file name —
    // the every-kind download affordance beside the inline file-chip
    // buttons.
    for (const attachment of target.attachments || []) {
        const name = attachment.name || attachment.mimeType || attachment.fileId
        items.push({
            label: t('support.download', { name: name.length > 32 ? `${name.slice(0, 29)}…` : name }),
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
    messageMenu.value?.toggle(event)
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
// the hover ellipsis action — media-only messages carry no text bubble, so
// the row-level paths are the only ones that reach them. Touches that land
// on interactive children (media elements and their native controls, the
// reply-quote jump, links, inputs) or select text never open it.
const openMessageMenuFromRow = (event, messageItem, longPress = false) => {
    if (event?.target?.closest?.('button, a, video, audio, input, textarea, [data-no-menu]')) return
    if (!longPress && typeof window !== 'undefined' && String(window.getSelection?.() || '').length) return
    if (longPress) event?.preventDefault?.()
    openMessageMenu(event, messageItem)
}

// Left click inspects: a message linked to an instance opens that
// instance's popup (the same entity popup the thread title opens), so a
// composed thread's rows lead to the exact instance they concern. Clicks
// on interactive children (inline ref chips, links, media, the reply-quote
// jump) and text selections keep their own behavior; person threads have
// no instance to inspect and ignore the click.
const openMessagePopup = (event, messageItem) => {
    if (isInteractiveEventTarget(event)) return
    if (typeof window !== 'undefined' && String(window.getSelection?.() || '').length) return
    const link = messageItem?.instanceLink
    if (!link?.type || !link?.id) return
    openEntityPopup({ typeId: link.type, instanceId: String(link.id) })
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
        // Own messages sit right-aligned and swipe left; others sit
        // left-aligned and swipe right.
        direction: isOwnMessage(messageItem) ? -1 : 1,
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
            // Ringing arrives only through the calls store's `call.invite`
            // subscription — one owner, no second local ring state.
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
    fetchTranscriptionAvailability()
    if (chatTarget.value?.userId || chatTarget.value?.instanceKey) openDirectTarget()
    else if (chatTarget.value?.conversationKey) openConversationByKey(chatTarget.value.conversationKey)
})
onBeforeUnmount(() => {
    if (unsubscribeConversation) {
        unsubscribeConversation()
        unsubscribeConversation = null
    }
    if (typingResetTimer) clearTimeout(typingResetTimer)
    if (typingSendTimer) clearTimeout(typingSendTimer)
    if (mediaRecorder) {
        mediaRecorder.onstop = null
        mediaRecorder.stop()
    }
    stopRecordingTracks()
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
    // instance — chat never mints artifact instances.
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
                createPromptOptions[field.id] = await $fetch('/api/support/instance-options', {
                    query: { type }
                })
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
    const id = instance?._id?.toString?.() || instance?._id || instance?.id || instance?.identity?.uid || ''
    const type = [].concat(action.relationMutation?.targetTypes || [])[0] || action.typeId
    if (!id || !type) return
    if (!instanceRefs.value.some(ref => ref.type === type && ref.id === id)) {
        instanceRefs.value.push({
            type,
            id,
            label: instance?.identity?.name || id,
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
                label: option?.label || ref.label || ref.id,
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
        newChatUsers.value = await $fetch('/api/support/instance-options', {
            query: { type: 'user' }
        })
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
const newChatOptions = computed(() => {
    const query = newChatSearch.value.trim()
    if (query.length < 2) return newChatUsers.value
    return newChatDirectoryOptions.value.map(directoryUserOption)
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

const openNewChatUser = (userId) => {
    if (!userId) return
    const option = newChatOptions.value.find(item => item.value === userId)
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

// Group and instance threads lead others' sender runs with the sender's
// avatar and name (the shared user chip): group members and org-mates in
// instance chats (the organization chat included) are multi-sender
// threads — once per run, never for the viewer's own messages.
const showSenderLabel = (messageItem) => ['group', 'instance'].includes(activeConversation.value?.conversationKind)
    && Boolean(messageItem?.senderUserId)
    && !isOwnMessage(messageItem)
    && messageItem.firstOfSenderRun

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
        return conversation?.instanceName || localizedTypeIdLabel(conversation?.typeId)
    }
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
