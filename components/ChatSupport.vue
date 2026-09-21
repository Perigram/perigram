<template>
    <!-- One surface for every host: the popup Dialog, the /chats route, the
         entity detail panel, and the call workspace all embed this same
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
                    <label
                        v-if="hasEntityRows && !showArchived"
                        class="mr-auto flex items-center gap-1 pl-1 text-muted text-supporting"
                        :title="$t('support.chatGroupingAll')"
                    >
                        <ToggleSwitch v-model="groupingAll" :aria-label="$t('support.chatGroupingAll')" />
                        <span>{{ $t('support.chatGroupingAll') }}</span>
                    </label>
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
                             member count, and the smart timestamp (time when
                             today, date otherwise) up top; the latest-message
                             preview with the own-last read mark below. The
                             row menu (pin/archive) is an absolute hover
                             overlay so it never shifts the layout. -->
                        <div class="group relative flex w-full min-w-0 items-start gap-2 md:gap-3">
                            <div class="relative shrink-0">
                                <Avatar
                                    v-if="option.conversationKind === 'entity'"
                                    :icon="entityConversationIcon(option)"
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
                                    :label="conversationLabel(option).charAt(0).toUpperCase()"
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
                                    <small v-if="option.timestamp" class="ml-auto shrink-0 pl-1 text-muted text-supporting">
                                        {{ inboxTimestamp(option.timestamp) }}
                                    </small>
                                    <i
                                        v-if="option.pinned"
                                        class="pi pi-thumbtack shrink-0 text-muted"
                                        :aria-label="$t('support.pin')"
                                    />
                                </div>
                                <div class="flex min-w-0 items-center gap-1">
                                    <i
                                        v-if="isOwnInboxRow(option) && option.lastMessageRead"
                                        class="pi pi-check shrink-0 text-primary"
                                        :aria-label="$t('support.messageRead')"
                                    />
                                    <small class="min-w-0 flex-1 truncate text-muted">
                                        <SupportMessageContent
                                            v-if="option.lastMessage"
                                            :message="conversationPreviewMessage(option)"
                                            :viewer-user-id="currentUserId"
                                            single-line
                                        />
                                        <template v-else>{{ $t('support.noMessages') }}</template>
                                    </small>
                                </div>
                            </div>
                            <Button
                                icon="pi pi-ellipsis-v"
                                severity="secondary"
                                text
                                rounded
                                size="small"
                                class="absolute top-1/2 right-0 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                :aria-label="$t('common.more')"
                                @click.stop="openConversationMenu($event, option)"
                            />
                        </div>
                    </template>
                </Listbox>
            </aside>

            <div v-if="fullPage && !activeConversation" class="chat-empty min-h-0 flex-1 items-center justify-center">
                <StateBlock :message="$t('support.selectConversation')" icon="pi pi-comments" />
            </div>

            <section v-if="activeConversation" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
                        v-if="activeConversation.conversationKind === 'entity'"
                        :icon="entityConversationIcon(activeConversation)"
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
                        :label="conversationLabel(activeConversation).charAt(0).toUpperCase()"
                        shape="circle"
                        class="shrink-0 bg-primary text-primary-contrast [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                    />
                    <div class="flex min-w-0 flex-1 flex-col">
                        <div class="flex min-w-0 items-center gap-1">
                            <h2 class="m-0 min-w-0 truncate text-section-heading">
                                <!-- The entity thread title itself is the
                                     open-entity link; the children-messages
                                     toggle sits right beside it (inverted:
                                     default shows the entity's own messages,
                                     toggling includes the children). -->
                                <Button
                                    v-if="activeConversation.conversationKind === 'entity' && activeEntityDetailRoute"
                                    link
                                    class="!p-0 text-left"
                                    :aria-label="conversationLabel(activeConversation)"
                                    @click="openEntityFromThread"
                                >
                                    {{ conversationLabel(activeConversation) }}
                                </Button>
                                <template v-else>{{ conversationLabel(activeConversation) }}</template>
                            </h2>
                            <Button
                                v-if="activeConversation.conversationKind === 'entity'"
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
                        <!-- Group threads carry their member profiles inline;
                             entity threads keep the scope subtitle. -->
                        <div
                            v-if="activeConversation.conversationKind === 'group'"
                            class="flex min-w-0 flex-wrap items-center gap-1"
                        >
                            <EntityInlineRef
                                v-for="participantId in groupParticipantIds"
                                :key="participantId"
                                type="user"
                                :id="participantId"
                                :fetch="true"
                                :fields="[]"
                                variant="inline"
                                class="max-w-full"
                            />
                        </div>
                        <small v-else-if="conversationSubtitle" class="block truncate text-muted text-supporting">
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
                    class="flex-1 overflow-y-auto p-3 flex flex-col gap-3 md:p-4 md:gap-4"
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
                                    isOwnMessage(messageItem) ? 'items-end' : 'items-start',
                                    swipeDrag.id === messageItem._id ? '' : 'transition-transform',
                                    highlightKey === String(messageItem._id) ? 'animate-pulse' : ''
                                ]"
                                :style="swipeStyle(messageItem)"
                            >
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
                                            v-if="messageItem.parent.attachment?.kind === 'audio'"
                                            class="pi pi-microphone shrink-0 text-muted"
                                            aria-hidden="true"
                                        />
                                        <span v-if="messageItem.parent.snippet" class="min-w-0 truncate [overflow-wrap:anywhere]">
                                            {{ messageItem.parent.snippet }}
                                        </span>
                                        <span v-else-if="messageItem.parent.attachment?.kind === 'audio'" class="text-muted">
                                            {{ $t('support.voiceMessage') }}
                                        </span>
                                    </span>
                                </button>
                                <audio
                                    v-if="messageItem.attachment?.kind === 'audio'"
                                    :src="attachmentUrl(messageItem.attachment)"
                                    controls
                                    preload="metadata"
                                    class="max-w-full"
                                />
                                <div
                                    v-if="messageItem.message || (messageItem.entityRefs || []).length"
                                    class="group relative max-w-full min-w-0 rounded-ui px-4 py-2 text-body"
                                    :class="isOwnMessage(messageItem)
                                        ? 'bg-primary text-primary-contrast'
                                        : 'bg-subtle'"
                                >
                                    <p class="m-0 min-w-0 break-words text-body [overflow-wrap:anywhere]">
                                        <SupportMessageContent :message="messageItem" :viewer-user-id="currentUserId" />
                                    </p>
                                    <!-- Plain wrapper owns hover visibility: PrimeVue's runtime
                                         .p-button display rule would defeat utility classes on the
                                         button itself. The menu aligns with the bubble's vertical
                                         center, beside its outer edge. -->
                                    <span
                                        class="absolute top-1/2 -translate-y-1/2 hidden opacity-0 transition-opacity group-hover:opacity-100 md:block"
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
                                <div v-else class="group relative w-full">
                                    <span
                                        class="absolute top-1/2 -translate-y-1/2 hidden opacity-0 transition-opacity group-hover:opacity-100 md:block"
                                        :class="isOwnMessage(messageItem) ? 'right-0' : 'left-0'"
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
                                <span class="flex min-w-0 items-center gap-1 px-1 text-muted text-supporting">
                                    {{ formatTime(messageItem.timestamp) }}
                                    <!-- Messages linked to lower entities keep a
                                         subtle, clickable leaf link inside the
                                         caption; it is inline caption text, not a
                                         control, so a plain minimal element beats
                                         PrimeVue button chrome here. Only the
                                         label underlines on hover; the icon
                                         never does. -->
                                    <button
                                        v-if="lowerEntityChip(messageItem)"
                                        type="button"
                                        class="group flex min-w-0 items-center gap-1 transition-opacity"
                                        :aria-label="messageItem.entityLink.name"
                                        @click="openLowerEntityChat(messageItem)"
                                    >
                                        <i :class="instances.iconFor(messageItem.entityLink.type)" class="shrink-0 scale-90" aria-hidden="true"></i>
                                        <span class="min-w-0 truncate underline-offset-4 group-hover:underline">{{ messageItem.entityLink.name }}</span>
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
                                <template v-else-if="replyTo.attachment?.kind === 'audio'">{{ $t('support.voiceMessage') }}</template>
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

                    <!-- Entity target strip: lineage drill-down over ALL
                         children of the current target. Breadcrumb-like pills
                         walk back up; the chip row is the current level,
                         exactly one target selected (the composed entity
                         when no child is drilled). -->
                    <div
                        v-if="activeConversation.conversationKind === 'entity' && (stripChildren.length || stripTrail.length)"
                        class="flex flex-col gap-1 pb-1"
                        data-testid="entity-target-strip"
                    >
                        <!-- Entity target strip: dynamic breadcrumbs — the
                             drilled lineage leads the same strip as icon-only
                             pills (no text; tapping jumps back to that
                             level), an angle marks the descent, and the
                             siblings of the current level follow as chips.
                             These are chips, not controls — segmented
                             PrimeVue chrome (SelectButton/Breadcrumb) fights
                             the composer density, so the strip renders
                             minimal pill elements from the semantic tokens.
                             Exactly one target is selected: the composed
                             entity root, the deepest drilled lineage pill, or
                             a drilled leaf chip. -->
                        <div class="flex items-center gap-1 overflow-x-auto">
                            <button
                                type="button"
                                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-ui transition-colors"
                                :class="stripRootSelected
                                    ? 'bg-primary text-primary-contrast'
                                    : 'bg-subtle text-muted hover:opacity-80'"
                                :title="activeConversation.entityName || localizedTypeIdLabel(activeConversation.typeId)"
                                :aria-label="activeConversation.entityName || localizedTypeIdLabel(activeConversation.typeId)"
                                :aria-current="stripRootSelected ? 'true' : undefined"
                                @click="resetStripTrail()"
                            >
                                <i :class="entityConversationIcon(activeConversation)" aria-hidden="true"></i>
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
                    <!-- Voice recording replaces the composer row while live:
                         elapsed timer plus cancel and stop-and-send. -->
                    <Message v-if="voiceRecording" severity="warn" icon="pi pi-microphone" :closable="false" class="flex-1">
                        {{ $t('support.recording') }} &middot; {{ formatRecordingDuration(recordingElapsed) }}
                    </Message>
                    <div v-if="voiceRecording" class="flex items-center gap-2">
                        <Button
                            icon="pi pi-times"
                            severity="secondary"
                            variant="text"
                            :aria-label="$t('common.cancel')"
                            @click="cancelVoiceRecording"
                        />
                        <Button
                            icon="pi pi-send"
                            severity="primary"
                            :aria-label="$t('support.stopAndSend')"
                            :loading="voiceSending"
                            :disabled="voiceSending"
                            @click="stopAndSendVoiceRecording"
                        />
                    </div>
                    <div v-else>
                        <!-- PrimeVue InputGroup: icon addons sit as direct
                             children so the group owns their radius; the send
                             action is the trailing primary button, not an
                             addon, so it reads as the composer's main
                             action. -->
                        <InputGroup>
                            <InputGroupAddon>
                                <Button
                                    icon="pi pi-paperclip"
                                    severity="secondary"
                                    variant="text"
                                    :disabled="attachmentPickerEmpty"
                                    :aria-label="$t('support.attach')"
                                    @click="openAttachmentPicker($event)"
                                />
                            </InputGroupAddon>
                            <Textarea
                                :placeholder="$t('support.typeMessage')"
                                class="min-w-0 flex-1"
                                v-model="message"
                                @input="handleTypingInput"
                                @keydown="handleKeyDown"
                                rows="1"
                                autoResize
                            />
                            <InputGroupAddon v-if="voiceRecordingSupported">
                                <Button
                                    icon="pi pi-microphone"
                                    severity="secondary"
                                    variant="text"
                                    :aria-label="$t('support.recordVoice')"
                                    @click="startVoiceRecording"
                                />
                            </InputGroupAddon>
                            <Button
                                icon="pi pi-send"
                                severity="primary"
                                :disabled="(!message.trim() && !entityRefs.length) || isLoading"
                                :aria-label="$t('support.send')"
                                @click="sendMessage"
                            />
                        </InputGroup>
                    </div>
                </div>
                <ChatAttachmentPicker
                    ref="attachmentPicker"
                    :recipient-user-id="activeRecipientUserId"
                    @select="selectAttachment"
                    @create-action="runCreateAction"
                />
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
            v-model:visible="newChatDialog"
            size="sm"
            :show-default-footer="false"
        >
            <template #header>
                <span>{{ $t('support.newChat') }}</span>
            </template>
            <Listbox
                :model-value="null"
                :options="newChatUsers"
                option-label="label"
                option-value="value"
                filter
                :filter-placeholder="$t('common.search')"
                :aria-label="$t('support.newChat')"
                class="border-0"
                @update:model-value="openNewChatUser"
            >
                <template #option="{ option }">
                    <div class="flex min-w-0 items-center gap-2">
                        <Avatar
                            :label="String(option.label || '?').charAt(0).toUpperCase()"
                            shape="circle"
                            class="shrink-0 bg-subtle text-muted"
                        />
                        <span class="min-w-0 flex-1 truncate text-label">{{ option.label }}</span>
                    </div>
                </template>
            </Listbox>
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
                    type-id="user"
                    filter
                    :loading="newChatUsersLoading"
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
                        v-if="field.type === 'entity'"
                        v-model="createPromptValues[field.id]"
                        :options="createPromptOptions[field.id] || []"
                        option-label="label"
                        option-value="value"
                        :type-id="field.typeId || field.accepts?.[0] || ''"
                        filter
                        class="w-full"
                    />
                    <EntityMultiSelect
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
        <Menu ref="messageMenu" :model="messageMenuItems" :popup="true" />
        <Menu ref="conversationMenu" :model="conversationMenuItems" :popup="true" />
        <ConfirmDialog />
    </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import Avatar from 'primevue/avatar'
import Divider from 'primevue/divider'
import Listbox from 'primevue/listbox'
import Button from 'primevue/button'
import ConfirmDialog from 'primevue/confirmdialog'
import InputText from 'primevue/inputtext'
import Select from '~/components/shared/EntitySelect.vue'
import EntityMultiSelect from '~/components/shared/EntityMultiSelect.vue'
import Textarea from 'primevue/textarea'
import InputGroup from 'primevue/inputgroup'
import InputGroupAddon from 'primevue/inputgroupaddon'
import Menu from 'primevue/menu'
import Message from 'primevue/message'
import ToggleSwitch from 'primevue/toggleswitch'
import DatePicker from 'primevue/datepicker'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue'
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue'
import StateBlock from '~/components/shared/StateBlock.vue'
import StandardDialog from '~/components/shared/StandardDialog.vue'
import ChatAttachmentPicker from '~/components/shared/ChatAttachmentPicker.vue'
import CallPanel from '~/components/calls/CallPanel.vue'
import { collectActionInputFields, initialPromptValue, promptData, promptedFields } from '~/components/generated/action-inputs.js'
import { isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js'
import { generatedActionLabel } from '~/utils/generated-labels.js'
import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState'
import { useConnections } from '~/composables/useConnections.js'
import { usePayloadUpload } from '~/composables/usePayloadUpload.js'
import { useInstancesStore } from '~/stores/instances'
import { useRegistryStore } from '~/stores/registry'
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js'
import { openEntityChat } from '~/utils/entity-chat.js'
import { openEntityInWorkspace } from '~/utils/entity-workspace-open.js'
import { openChatInWorkspaceTab } from '~/utils/chat-workspace-open.js'
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js'
import { useEnterExit, enterOnce } from '~/composables/useMotion.js'
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
    // Detail-page panels pin one entity thread: no inbox, no back navigation.
    threadOnly: { type: Boolean, default: false },
    // Entity display name hint for synthesized stubs before the snapshot
    // fills the thread title.
    entityName: { type: String, default: '' }
})

const emit = defineEmits(['open-call'])

const { t, te } = useI18n()
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
const MESSAGES_PAGE_SIZE = 50
const hasMoreMessages = ref(false)
const loadingOlder = ref(false)
const currentUserId = ref(authStore.userData?.id || authStore.userData?.userId || null)
let unsubscribeConversation = null
let conversationLoadToken = 0
const entityRefs = ref([])
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
// Entity thread state: the children toggle switches between messages linked
// to the entity itself (default) and the composed subtree view; the toggle
// beside the title reads "include children", so the pressed/primary state is
// the subtree view. The composer link target is the latest child chip by
// default and falls back to the composed entity when nothing is selected.
const includeChildren = ref(false)
const composerEntity = ref(null)
let composerEntityTouched = false
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

const messagePreviewVisible = computed(() => Boolean(message.value.includes('{{entity:')))
const draftPreviewMessage = computed(() => ({
    message: message.value.includes('{{entity:') ? message.value : '',
    entityRefs: entityRefs.value
}))
const activeRecipientUserId = computed(() => activeConversation.value?.conversationKind === 'direct' ? participantUserId(activeConversation.value) : '')
const recipientLimitedRefs = computed(() => entityRefs.value.filter(ref => ref.recipientHasAccess === false))
const localizedTypeIdLabel = (type) => {
    const candidates = [
        `support.typeIdLabels.${type}`,
        `entities.${type}`,
        `common.${type}`
    ]
    for (const key of candidates) {
        const translated = t(key)
        if (translated !== key) return translated
    }
    return type
}


// Entity rows ship in both groupings from the inbox snapshot: the joined
// top-level view (default) and the flat per-entity leaf view.
const chatGrouping = ref('top')
const groupingAll = computed({
    get: () => chatGrouping.value === 'all',
    set: (value) => { chatGrouping.value = value ? 'all' : 'top' }
})
const hasEntityRows = computed(() => supportChatStore.conversations
    .some(conversation => conversation.conversationKind === 'entity'))

// Archived conversations live behind the inbox header toggle; the default
// list hides them.
const showArchived = ref(false)

const displayConversations = computed(() => supportChatStore.conversations
    .filter(conversation => {
        if (Boolean(conversation.archived) !== showArchived.value) return false
        if (['direct', 'group'].includes(conversation.conversationKind)) return true
        if (conversation.conversationKind !== 'entity') return false
        // Top-level grouping hides leaf rows; Detailed shows every entity chat.
        return chatGrouping.value === 'all' || !conversation.isLeafRow
    }))

// One unified inbox: person, group, and entity chats share a single list;
// pinned rows lead, everything else follows the latest activity.
const conversationSections = computed(() => [...displayConversations.value].sort((left, right) => {
    if (Boolean(right.pinned) !== Boolean(left.pinned)) return right.pinned ? 1 : -1
    const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0
    const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0
    return rightTime - leftTime
}))



const isActiveConversation = (conversation) => activeConversation.value?.conversationKey === conversation.conversationKey

const entityConversationIcon = (conversation) => (
    instances.iconFor(conversation?.typeId)
)

// The entity thread title links into the entity surface: the generated
// detail route when the process manifest exposes one.
const activeEntityDetailRoute = computed(() => {
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'entity' || !conversation.entityId) return null
    return detailRouteForEntity({
        entity: { _id: conversation.entityId },
        typeId: conversation.typeId,
        screenKey: '',
        manifest: authStore.screenManifest
    }) || null
})

// Desktop opens the entity as a home-workspace tab; mobile keeps the detail
// route.
const openEntityFromThread = () => {
    const conversation = activeConversation.value
    if (!conversation?.typeId || !conversation.entityId) return
    if (typeof window !== 'undefined'
        && window.matchMedia?.('(max-width: 767px)')?.matches) {
        if (activeEntityDetailRoute.value) navigateTo(activeEntityDetailRoute.value)
        return
    }
    if (openEntityInWorkspace({ typeId: conversation.typeId, entityId: String(conversation.entityId) })) return
    if (activeEntityDetailRoute.value) navigateTo(activeEntityDetailRoute.value)
}

const groupParticipantIds = computed(() => (
    (activeConversation.value?.participants || []).map(String).filter(Boolean)
))

const conversationSubtitle = computed(() => {
    const conversation = activeConversation.value
    if (!conversation) return ''
    if (conversation.conversationKind === 'entity') {
        return includeChildren.value
            ? t('support.includesChildren')
            : localizedTypeIdLabel(conversation.typeId)
    }
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
                entity: activeConversation.value.conversationKind === 'entity'
                    ? (composerEntity.value || {
                        type: activeConversation.value.typeId,
                        id: activeConversation.value.entityId
                    })
                    : null,
                parentMessageId: replyTo.value?._id || null,
                entityRefs: payloadEntityRefs
            }
        })
        message.value = ''
        entityRefs.value = []
        replyTo.value = null
    } catch (error) {
        // A failed send keeps the typed text for retry but releases the
        // reply lock, so the composer (and target strip) never wedges.
        replyTo.value = null
        console.error('Failed to send message:', error)
    } finally {
        isLoading.value = false
    }
}

const { onlineUserIds } = useConnections()

// Voice messages: MediaRecorder capture uploaded through the shared files
// endpoint, then sent as a message whose only payload is the attachment
// descriptor `{ kind: 'audio', fileId, mimeType, durationSeconds }`.
const VOICE_RECORDING_MAX_SECONDS = 600
const voiceRecording = ref(false)
const voiceSending = ref(false)
const recordingElapsed = ref(0)
const voiceRecordingSupported = computed(() => process.client
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined')
let mediaRecorder = null
let recordedChunks = []
let recordingStream = null
let recordingStartedAt = 0
let recordingTimer = null

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
    recordingElapsed.value = 0
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
    recordingStartedAt = Date.now()
    recordingElapsed.value = 0
    recordingTimer = setInterval(() => {
        recordingElapsed.value = Math.floor((Date.now() - recordingStartedAt) / 1000)
        if (recordingElapsed.value >= VOICE_RECORDING_MAX_SECONDS) stopAndSendVoiceRecording()
    }, 500)
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
    const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000))
    recorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: mimeType })
        teardownRecording()
        if (!blob.size || !activeConversation.value) return
        voiceSending.value = true
        try {
            const form = new FormData()
            form.append('file', blob, `voice-message.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`)
            const uploaded = await $fetch('/api/files/upload', { method: 'POST', body: form })
            await $fetch('/api/support/messages', {
                method: 'POST',
                body: {
                    message: message.value,
                    recipientUserId: activeConversation.value?.conversationKind === 'direct' ? participantUserId(activeConversation.value) : null,
                    conversationKey: activeConversation.value?.conversationKind === 'group' ? activeConversation.value.conversationKey : null,
                    entity: activeConversation.value?.conversationKind === 'entity'
                        ? (composerEntity.value || {
                            type: activeConversation.value.typeId,
                            id: activeConversation.value.entityId
                        })
                        : null,
                    parentMessageId: replyTo.value?._id || null,
                    attachment: {
                        kind: 'audio',
                        fileId: uploaded.id,
                        mimeType,
                        durationSeconds
                    }
                }
            })
            message.value = ''
            replyTo.value = null
        } catch (error) {
            console.error('Failed to send voice message:', error)
            toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 })
        } finally {
            voiceSending.value = false
        }
    }
    recorder.stop()
    stopRecordingTracks()
}

const attachmentUrl = (attachment) => attachment?.fileId
    ? `/api/files/download/${encodeURIComponent(String(attachment.fileId))}`
    : ''

const participantOnline = (conversation) => {
    const participant = conversation?.conversationKind === 'direct'
        ? participantUserId(conversation)
        : null
    return Boolean(participant && onlineUserIds.value.has(participant))
}

const activeConversationKey = computed(() => activeConversation.value?.conversationKey || null)

const conversationQuery = (extra = {}) => {
    const conversation = activeConversation.value
    if (conversation.conversationKind === 'entity') {
        return {
            ...extra,
            entity: `${conversation.typeId}:${conversation.entityId}`,
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
            if (snapshot.conversation.kind === 'entity') {
                conversation.typeId = snapshot.conversation.typeId || conversation.typeId
                conversation.entityId = snapshot.conversation.entityId || conversation.entityId
                conversation.entityName = snapshot.conversation.name || conversation.entityName
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

// Entity target strip: lineage drill-down. The strip lists ALL children of
// the current target (composed entity, or the deepest drilled entity);
// picking a child drills into it (the next message lands there), breadcrumbs
// of lineage icons walk back up. Children load through the same containment
// sources the sidebar uses.
const stripTrail = ref([])
const stripChildrenByKey = ref(new Map())
const stripLoadingKeys = ref(new Set())

const stripTargetKey = computed(() => {
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'entity') return ''
    const deepest = stripTrail.value[stripTrail.value.length - 1]
    return deepest?.key || `${conversation.typeId}:${conversation.entityId}`
})

// The composed entity is the target whenever no child is drilled; the root
// pill carries the selected state in that case so exactly one target is
// always visibly selected.
const stripRootSelected = computed(() => !stripTrail.value.length && !composerEntity.value)

// A lineage pill is selected when it is the current composer target (the
// deepest drilled level); drilled leaf chips compare the same way.
const isTrailEntrySelected = (entry) => Boolean(composerEntity.value)
    && composerEntity.value.type === entry.type
    && String(composerEntity.value.id) === String(entry.id)

// Children of the current target: containment-sourced entries plus the
// children already seen in this thread's message paths — the path-derived
// set keeps the strip alive for targets without detail-screen sources (the
// organization chat) and before lists load.
const stripChildren = computed(() => {
    const loaded = stripChildrenByKey.value.get(stripTargetKey.value) || []
    const byKey = new Map(loaded.map(item => [item.key, item]))
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'entity') return loaded
    const pathIndex = (path) => path.findIndex(entry => (
        entry.type === conversation.typeId && String(entry.id) === String(conversation.entityId)
    ))
    for (const messageItem of messages.value) {
        const path = messageItem.entityPath || []
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

async function loadStripChildren(targetKey, targetType, targetEntity = null) {
    if (!targetKey || stripChildrenByKey.value.has(targetKey) || stripLoadingKeys.value.has(targetKey)) return
    stripLoadingKeys.value = new Set([...stripLoadingKeys.value, targetKey])
    try {
        const sources = linkedExplorerChildSources({
            linkedItems: [{ key: targetKey, type: targetType, entity: targetEntity }],
            screens: authStore.screenManifest,
            containment: effectiveContainmentForStrip()
        })
        const loaded = await Promise.all(sources.map(async source => {
            try {
                const entities = await instances.listInstances(instances.canonicalTypeKey(source.typeId), source.filters)
                return (Array.isArray(entities) ? entities : []).map(entity => ({
                    key: `${source.typeId}:${stripEntityId(entity)}`,
                    type: source.typeId,
                    // Chips must carry the id explicitly: path-derived chips
                    // already do, and selection (plus the sent entity link)
                    // compares on it.
                    id: stripEntityId(entity),
                    name: entity?.identity?.name || entity?.identity?.serial || stripEntityId(entity) || source.typeId,
                    entity
                }))
            } catch {
                return []
            }
        }))
        let merged = loaded.flat()
        // Fallback child source: when the lineage list endpoints expose
        // nothing (scoped services missing or denied), the readable
        // entity-options window still fills the strip so chips drill.
        if (!merged.length) {
            const childTypes = [...new Set(effectiveContainmentForStrip()
                .filter(edge => edge.parentType === targetType)
                .map(edge => edge.childType))]
            const optionRows = await Promise.all(childTypes.map(async childType => {
                try {
                    const options = await $fetch('/api/support/entity-options', { query: { type: childType } })
                    return (options || []).filter(option => option?.value)
                        .map(option => ({
                            key: `${childType}:${option.value}`,
                            type: childType,
                            id: String(option.value),
                            name: option.label || childType,
                            entity: option.entity || null
                        }))
                } catch {
                    return []
                }
            }))
            merged = optionRows.flat()
        }
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

const stripEntityId = (entity = null) => {
    const value = entity?._id || entity?.identity?.uid || ''
    return value ? String(value) : ''
}

watch([activeConversationKey, () => activeConversation.value?.typeId, () => activeConversation.value?.entityId], ([key]) => {
    if (!key || activeConversation.value?.conversationKind !== 'entity') return
    stripTrail.value = []
    stripChildrenByKey.value = new Map()
    composerEntity.value = null
    composerEntityTouched = false
    loadStripChildren(
        `${activeConversation.value.typeId}:${activeConversation.value.entityId}`,
        activeConversation.value.typeId,
        { _id: activeConversation.value.entityId }
    )
}, { immediate: true })

// Selection is exactly one target: key-based comparison so chips from any
// source (loaded or path-derived) match reliably.
const isChipSelected = (chip) => Boolean(composerEntity.value)
    && composerEntity.value.type === chip.type
    && String(composerEntity.value.id) === String(chip.id ?? (chip.key || '').split(':').slice(1).join(':'))

async function drillStripTo(chip) {
    if (replyTo.value) return
    composerEntityTouched = true
    composerEntity.value = { type: chip.type, id: chip.id, name: chip.name }
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
    composerEntityTouched = true
    composerEntity.value = deepest
    if (!includeChildren.value) includeChildren.value = true
        ? { type: deepest.type, id: deepest.id, name: deepest.name }
        : null
}

function resetStripTrail() {
    stripTrail.value = []
    composerEntityTouched = true
    composerEntity.value = null
}

watch(activeConversationKey, () => {
    replyTo.value = null
    composerEntity.value = null
    composerEntityTouched = false
    includeChildren.value = false
})

// The children toggle re-queries the thread: the composed subtree view and
// messages linked to the entity itself are different server-side matches.
watch(includeChildren, () => {
    if (activeConversation.value?.conversationKind === 'entity') loadConversation()
})

// While a reply is pending, its entity link is locked to the quoted
// message and cannot be switched until the reply is discarded.
const selectComposerEntity = (chip) => {
    if (replyTo.value) return
    composerEntityTouched = true
    composerEntity.value = chip
        ? { type: chip.type, id: chip.id, name: chip.name }
        : null
}

// Desktop message menu: reply plus text utilities, PrimeVue-owned. The
// target is a ref: menu models are computeds, and a plain variable would
// never invalidate them, leaving the popup empty.
const messageMenu = ref(null)
const messageMenuTarget = ref(null)
const messageMenuItems = computed(() => {
    const items = [{
        label: t('support.reply'),
        icon: 'pi pi-reply',
        command: () => {
            messageMenu.value?.hide?.()
            if (messageMenuTarget.value) openReply(messageMenuTarget.value)
            messageMenuTarget.value = null
        }
    }]
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

// Replies quote the target inline in the composer; sending carries the
// parent id and the message payload clears the quote on success. In entity
// views a reply links to the same entity the quoted message belongs to.
const openReply = (messageItem) => {
    replyTo.value = messageItem || null
    if (activeConversation.value?.conversationKind === 'entity') {
        composerEntityTouched = true
        const link = messageItem?.entityLink
        composerEntity.value = link?.type && link?.id
            ? { type: link.type, id: link.id, name: link.name || '' }
            : null
    }
}

const lowerEntityChip = (messageItem) => {
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'entity' || !messageItem.entityLink?.id) return false
    return !(messageItem.entityLink.type === conversation.typeId
        && String(messageItem.entityLink.id) === String(conversation.entityId))
}

const openLowerEntityChat = (messageItem) => {
    const link = messageItem.entityLink
    openEntityChat({ type: link.type, id: String(link.id), name: link.name || '' })
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
    if (chatTarget.value?.userId || chatTarget.value?.entityKey) openDirectTarget()
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
    if (supportDialog.value && (chatTarget.value?.userId || chatTarget.value?.entityKey)) openDirectTarget()
}, { deep: true })

watch(supportDialog, (isOpen) => {
    if (props.embedded || !isOpen) return
    if (chatTarget.value?.userId || chatTarget.value?.entityKey) openDirectTarget()
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

// Row menu: pin/unpin and archive/unarchive, driven by the row's current
// per-user preferences.
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

const openConversationMenu = (event, option) => {
    conversationMenuTarget.value = option || null
    conversationMenu.value?.toggle(event)
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
        // Instant jump: a smooth animation passes through small scrollTop
        // values on the way down, which the lazy-history scroll listener
        // would misread as a scroll-to-top request.
        element.scrollTo({
            top: element.scrollHeight,
            behavior: 'auto'
        })
    }
}

// The attachment picker is the tiered menu over the same generated entity
// sources the home explorer exposes: generated create buttons first, type
// rows after, and one tap on an entity selects, adds the ref, and closes the
// picker. With no readable types and no create actions the trigger stays
// disabled instead of opening an empty menu.
const attachmentPickerEmpty = computed(() => {
    const home = authStore.screenManifest.find(screen => screen.template === 'home')
    return !(home?.sources || []).some(source => source.typeId && source.mode !== 'single')
})

const openAttachmentPicker = (event) => {
    attachmentPicker.value?.toggle(event)
}

const selectAttachment = (option) => {
    if (!option?.type || !option.value) return
    if (!entityRefs.value.some(ref => ref.type === option.type && ref.id === option.value)) {
        entityRefs.value.push({
            type: option.type,
            id: option.value,
            label: option.label,
            entity: option.entity || null,
            recipientHasAccess: option.recipientHasAccess
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
    // instance — chat never mints artifact entities.
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
        if (field.type === 'entity' || field.type === 'typeList') {
            if (!type) continue
            try {
                createPromptOptions[field.id] = await $fetch('/api/support/entity-options', {
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
                entityId: null,
                entities: {},
                data,
                parameters: {}
            }
        })
        attachCreatedEntity(action, result)
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('generatedScreen.actionCompleted'), life: 2000 })
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 })
    } finally {
        executingCreate.value = false
    }
}

// The created entity attaches to the draft like any picked entity; created
// shapes mirror the generated action contract (created/entity payloads).
const attachCreatedEntity = (action, result) => {
    if (!result || typeof result !== 'object') return
    const entity = result.created || (!result.owner ? (result.entity || result) : null)
    const id = entity?._id?.toString?.() || entity?._id || entity?.id || entity?.identity?.uid || ''
    const type = action.relationMutation?.targetType || action.typeId
    if (!id || !type) return
    if (!entityRefs.value.some(ref => ref.type === type && ref.id === id)) {
        entityRefs.value.push({
            type,
            id,
            label: entity?.identity?.name || id,
            entity
        })
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

const removeEntityRef = (targetRef) => {
    entityRefs.value = entityRefs.value.filter(ref => !(ref.type === targetRef.type && ref.id === targetRef.id))
}

const openNewChatDialog = async () => {
    newChatDialog.value = true
    await loadNewChatUsers()
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
    newChatDialog.value = false
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
    if (key.startsWith('entity:')) {
        const [, typeId, entityId] = key.split(':')
        activeConversation.value = {
            conversationKey: key,
            conversationKind: 'entity',
            typeId,
            entityId,
            entityName: props.entityName || '',
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
    // inbox), never a separate route.
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
    if (chatTarget.value?.entityKey) {
        openConversationByKey(chatTarget.value.entityKey)
        return
    }
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
    if (conversation?.conversationKind === 'entity') {
        return conversation?.entityName || localizedTypeIdLabel(conversation?.typeId)
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
    entityRefs: conversation.entityRefs || [],
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
