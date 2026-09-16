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
                v-if="(!activeConversation || fullPage) && !threadOnly"
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
                    <button
                        v-for="conversation in conversationSections"
                        :key="conversation.conversationKey"
                            type="button"
                            class="flex min-w-0 items-center gap-2 rounded-ui p-2 text-left transition-colors hover:bg-subtle md:gap-3"
                            :class="{ 'bg-subtle': isActiveConversation(conversation) }"
                            @click="openConversation(conversation)"
                        >
                            <div class="relative shrink-0">
                                <!-- Neutral placeholders: unread ink belongs to badges,
                                     not to letter/icon fallbacks. -->
                                <Avatar
                                    v-if="conversation.conversationKind === 'entity'"
                                    :icon="entityConversationIcon(conversation)"
                                    shape="circle"
                                    size="normal"
                                    class="bg-subtle text-muted-color"
                                />
                                <Avatar
                                    v-else-if="conversation.conversationKind === 'group'"
                                    icon="pi pi-users"
                                    shape="circle"
                                    size="normal"
                                    class="bg-subtle text-muted-color"
                                />
                                <Avatar
                                    v-else
                                    :image="conversationAvatar(conversation)"
                                    :label="conversationLabel(conversation).charAt(0).toUpperCase()"
                                    shape="circle"
                                    size="normal"
                                    class="bg-subtle text-muted-color [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
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
                                        single-line
                                    />
                                    <template v-else>{{ $t('support.noMessages') }}</template>
                                </small>
                            </div>
                            <small v-if="conversation.timestamp" class="shrink-0 text-muted-color">{{ shortTime(conversation.timestamp) }}</small>
                    </button>
                </div>
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
                        class="shrink-0 bg-subtle text-muted-color"
                    />
                    <Avatar
                        v-else-if="activeConversation.conversationKind === 'group'"
                        icon="pi pi-users"
                        shape="circle"
                        class="shrink-0 bg-subtle text-muted-color"
                    />
                    <Avatar
                        v-else
                        :image="conversationAvatar(activeConversation)"
                        :label="conversationLabel(activeConversation).charAt(0).toUpperCase()"
                        shape="circle"
                        class="shrink-0 bg-primary text-primary-contrast [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                    />
                    <div class="min-w-0 flex-1">
                        <h2 class="m-0 truncate text-section-heading">
                            <button
                                v-if="activeConversation.conversationKind === 'entity' && activeEntityDetailRoute"
                                type="button"
                                class="text-left underline-offset-4 transition-opacity hover:underline hover:opacity-80"
                                @click="navigateTo(activeEntityDetailRoute)"
                            >
                                {{ conversationLabel(activeConversation) }}
                            </button>
                            <template v-else>{{ conversationLabel(activeConversation) }}</template>
                        </h2>
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
                        <small v-else-if="conversationSubtitle" class="block truncate text-muted-color text-supporting">
                            {{ conversationSubtitle }}
                        </small>
                    </div>
                    <div class="flex shrink-0 items-center gap-1">
                        <Button
                            v-if="activeConversation.conversationKind === 'entity'"
                            icon="pi pi-sitemap"
                            :severity="includeChildren ? 'secondary' : 'primary'"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('support.includeChildren')"
                            :aria-pressed="includeChildren"
                            @click="includeChildren = !includeChildren"
                        />
                        <Button
                            v-if="activeConversation.conversationKind !== 'support' && activeConversation.conversationKind !== 'entity'"
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
                            class="flex min-w-0 max-w-support-chat-message touch-pan-y flex-col gap-1 transition-transform"
                            :class="[
                                isOwnMessage(messageItem) ? 'ml-auto items-end' : 'mr-auto items-start',
                                swipeArmed.has(messageItem._id) ? 'translate-x-3' : '',
                                highlightKey === String(messageItem._id) ? 'animate-pulse' : ''
                            ]"
                            @touchstart="onTouchStart($event, messageItem)"
                            @touchmove="onTouchMove($event, messageItem)"
                            @touchend="onTouchEnd(messageItem)"
                        >
                            <button
                                v-if="messageItem.parent"
                                type="button"
                                class="flex max-w-full min-w-0 flex-col gap-0.5 rounded-ui bg-subtle px-2 py-1 text-left"
                                :aria-label="$t('support.goToMessage')"
                                @click="goToMessage(messageItem.parent._id)"
                            >
                                <small class="text-muted-color text-supporting">
                                    {{ messageItem.parent.senderName || $t('common.user') }}
                                </small>
                                <span class="flex min-w-0 items-center gap-1 text-supporting">
                                    <i
                                        v-if="messageItem.parent.attachment?.kind === 'audio'"
                                        class="pi pi-microphone shrink-0 text-muted-color"
                                        aria-hidden="true"
                                    />
                                    <span v-if="messageItem.parent.snippet" class="min-w-0 truncate [overflow-wrap:anywhere]">
                                        {{ messageItem.parent.snippet }}
                                    </span>
                                    <span v-else-if="messageItem.parent.attachment?.kind === 'audio'" class="text-muted-color">
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
                                     button itself. -->
                                <span
                                    class="absolute -top-2 hidden opacity-0 transition-opacity group-hover:opacity-100 md:block"
                                    :class="isOwnMessage(messageItem) ? '-left-8' : '-right-8'"
                                >
                                    <Button
                                        icon="pi pi-reply"
                                        severity="secondary"
                                        text
                                        rounded
                                        size="small"
                                        :aria-label="$t('support.reply')"
                                        @click.stop="openReply(messageItem)"
                                    />
                                </span>
                            </div>
                            <div v-else class="group relative w-full">
                                <span
                                    class="absolute -top-3 hidden opacity-0 transition-opacity group-hover:opacity-100 md:block"
                                    :class="isOwnMessage(messageItem) ? 'right-0' : 'left-0'"
                                >
                                    <Button
                                        icon="pi pi-reply"
                                        severity="secondary"
                                        text
                                        rounded
                                        size="small"
                                        :aria-label="$t('support.reply')"
                                        @click.stop="openReply(messageItem)"
                                    />
                                </span>
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
                    <!-- Reply quote bar: the next send carries the parent id. -->
                    <div v-if="replyTo" class="flex items-center gap-2 rounded-ui bg-subtle p-2">
                        <i class="pi pi-reply shrink-0 text-muted-color" aria-hidden="true"></i>
                        <span class="min-w-0 flex-1 truncate text-supporting text-muted-color">
                            <template v-if="replyTo.parent">{{ replyTo.parent.senderName }}:</template>
                            <template v-if="replyTo.message">{{ replyTo.message }}</template>
                            <template v-else-if="replyTo.attachment?.kind === 'audio'">{{ $t('support.voiceMessage') }}</template>
                        </span>
                        <Button
                            icon="pi pi-times"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('common.cancel')"
                            @click="cancelReply"
                        />
                    </div>
                    <!-- Entity link target: chips over the input pick the child the
                         next message links to; none selected links to the composed
                         entity itself. Latest child is preselected. -->
                    <div
                        v-if="activeConversation.conversationKind === 'entity' && childChips.length"
                        class="flex gap-1 overflow-x-auto pb-1"
                    >
                        <button
                            v-for="chip in childChips"
                            :key="chip.key"
                            type="button"
                            class="flex shrink-0 items-center gap-1 rounded-ui px-2 py-1 text-supporting transition-colors"
                            :class="composerEntity?.type === chip.type && composerEntity?.id === chip.id
                                ? 'bg-primary text-primary-contrast'
                                : 'bg-subtle text-muted-color'"
                            :aria-pressed="composerEntity?.type === chip.type && composerEntity?.id === chip.id"
                            @click="selectComposerEntity(
                                composerEntity?.type === chip.type && composerEntity?.id === chip.id ? null : chip
                            )"
                        >
                            <i :class="domainUi.getIcon(chip.type) || 'pi pi-box'" class="shrink-0" aria-hidden="true"></i>
                            <span class="max-w-32 truncate">{{ chip.name }}</span>
                        </button>
                    </div>
                    <div v-if="messagePreviewVisible" class="rounded-ui bg-subtle p-2 text-muted-color text-body">
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
                    <div v-if="voiceRecording" class="flex items-center gap-2">
                        <span
                            class="ml-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-ui bg-status-error"
                            :aria-label="$t('support.recording')"
                        ></span>
                        <span class="min-w-0 flex-1 text-muted-color text-body">
                            {{ $t('support.recording') }} · {{ formatRecordingDuration(recordingElapsed) }}
                        </span>
                        <Button
                            icon="pi pi-times"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('common.cancel')"
                            @click="cancelVoiceRecording"
                        />
                        <Button
                            icon="pi pi-send"
                            rounded
                            size="small"
                            class="flex-shrink-0"
                            :aria-label="$t('support.stopAndSend')"
                            :loading="voiceSending"
                            :disabled="voiceSending"
                            @click="stopAndSendVoiceRecording"
                        />
                    </div>
                    <div v-else class="flex items-end gap-2">
                        <Button
                            icon="pi pi-paperclip"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            :disabled="attachmentPickerEmpty"
                            :aria-label="$t('support.attach')"
                            @click="openAttachmentPicker($event)"
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
                            v-if="voiceRecordingSupported"
                            icon="pi pi-microphone"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('support.recordVoice')"
                            @click="startVoiceRecording"
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
                <ChatAttachmentPicker
                    ref="attachmentPicker"
                    :types="entityTypeOptions"
                    :create-actions="createActions"
                    :recipient-user-id="activeRecipientUserId"
                    @select="selectAttachment"
                    @create-action="runCreateAction"
                />
                <GeneratedArtifactCreator
                    v-if="pendingCreator"
                    v-model="creatorVisible"
                    :creator="pendingCreator"
                    @created="selectCreatedArtifact"
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
                    <span class="text-muted-color text-supporting">{{ field.label || field.id }}</span>
                    <Select
                        v-if="field.type === 'entity'"
                        v-model="createPromptValues[field.id]"
                        :options="createPromptOptions[field.id] || []"
                        option-label="label"
                        option-value="value"
                        :entity-type="field.entityType || field.accepts?.[0] || ''"
                        filter
                        class="w-full"
                    />
                    <EntityMultiSelect
                        v-else-if="field.type === 'entityList'"
                        v-model="createPromptValues[field.id]"
                        :options="createPromptOptions[field.id] || []"
                        option-label="label"
                        option-value="value"
                        :entity-type="field.entityType || field.accepts?.[0] || ''"
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
        <ConfirmDialog />
    </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import Avatar from 'primevue/avatar'
import Divider from 'primevue/divider'
import Button from 'primevue/button'
import ConfirmDialog from 'primevue/confirmdialog'
import InputText from 'primevue/inputtext'
import Select from '~/components/shared/EntitySelect.vue'
import EntityMultiSelect from '~/components/shared/EntityMultiSelect.vue'
import Textarea from 'primevue/textarea'
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
import GeneratedArtifactCreator from '~/components/generated/GeneratedArtifactCreator.vue'
import CallPanel from '~/components/calls/CallPanel.vue'
import { artifactCreatorForAction, collectActionInputFields, initialPromptValue, promptData, promptedFields } from '~/components/generated/action-inputs.js'
import { isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js'
import { generatedActionLabel } from '~/utils/generated-labels.js'
import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState'
import { useConnections } from '~/composables/useConnections.js'
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js'
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js'
import { useEnterExit, enterOnce } from '~/composables/useMotion.js'
import { useAuthStore } from '~/stores/auth'
import { useSupportChatStore } from '~/stores/supportChat'
import { useCallsStore } from '~/stores/calls'

const props = defineProps({
    embedded: {
        type: Boolean,
        default: false
    },
    fullPage: { type: Boolean, default: false },
    conversationKey: { type: String, default: '' },
    openCallInPane: { type: Boolean, default: false },
    // Detail-page panels pin one entity thread: no inbox, no back navigation.
    threadOnly: { type: Boolean, default: false }
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
const entityTypeOptions = ref([])
const attachmentPicker = ref(null)
const creatorVisible = ref(false)
const pendingCreator = ref(null)
const pendingCreateAction = ref(null)
const createPromptVisible = ref(false)
const createPromptValues = reactive({})
const createPromptOptions = reactive({})
const executingCreate = ref(false)
const activeConversation = ref(null)
// Entity thread state: the children toggle switches between the composed
// subtree view and messages linked to the entity itself; the composer link
// target is the latest child chip by default and falls back to the composed
// entity when nothing is selected.
const includeChildren = ref(true)
const composerEntity = ref(null)
let composerEntityTouched = false
// Reply state: quoted target for the next send, transient swipe arming, and
// the anchored scroll highlight after jumping to a quoted message.
const replyTo = ref(null)
const swipeArmed = ref(new Set())
const highlightKey = ref('')
const loadingAnchor = ref(false)
const domainUi = useCutkitDomainUi()
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
// Ongoing room for the open conversation comes from the shared calls store,
// so the banner survives joining and leaving the call.
const callsStore = useCallsStore()
const ongoingCallRoom = computed(() => callsStore.activeRoomForConversation(activeConversationKey.value || ''))
const joinOngoingCall = () => {
    const room = ongoingCallRoom.value?.room
    if (room) openCallSurface(room)
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
    .filter(conversation => ['direct', 'group', 'entity'].includes(conversation.conversationKind)))

// One unified inbox: person, group, and entity chats share a single
// timestamp-ordered list; the avatar glyph carries the kind.
const conversationSections = computed(() => [...displayConversations.value].sort((left, right) => {
    const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0
    const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0
    return rightTime - leftTime
}))

const isActiveConversation = (conversation) => activeConversation.value?.conversationKey === conversation.conversationKey

const entityConversationIcon = (conversation) => (
    domainUi.getIcon(conversation?.entityType) || 'pi pi-box'
)

// The entity thread title links into the entity surface: the generated
// detail route when the process manifest exposes one.
const activeEntityDetailRoute = computed(() => {
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'entity' || !conversation.entityId) return null
    return detailRouteForEntity({
        entity: { _id: conversation.entityId },
        entityType: conversation.entityType,
        screenKey: '',
        manifest: authStore.screenManifest
    }) || null
})

const groupParticipantIds = computed(() => (
    (activeConversation.value?.participants || []).map(String).filter(Boolean)
))

const conversationSubtitle = computed(() => {
    const conversation = activeConversation.value
    if (!conversation) return ''
    if (conversation.conversationKind === 'entity') {
        return includeChildren.value
            ? t('support.includesChildren')
            : localizedEntityTypeLabel(conversation.entityType)
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
                        type: activeConversation.value.entityType,
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
                            type: activeConversation.value.entityType,
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
            entity: `${conversation.entityType}:${conversation.entityId}`,
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
                conversation.entityType = snapshot.conversation.entityType || conversation.entityType
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

// Immediate children seen in this thread: chips over the composer pick the
// link target for the next message, latest first, latest preselected.
const childChips = computed(() => {
    const conversation = activeConversation.value
    if (conversation?.conversationKind !== 'entity') return []
    const byKey = new Map()
    for (const messageItem of messages.value) {
        const path = messageItem.entityPath || []
        const index = path.findIndex(entry => entry.type === conversation.entityType && entry.id === conversation.entityId)
        if (index < 0) continue
        const child = path[index + 1]
        if (!child?.type || !child?.id) continue
        const key = `${child.type}:${child.id}`
        const existing = byKey.get(key)
        if (existing) {
            if (new Date(messageItem.timestamp) > new Date(existing.timestamp)) existing.timestamp = messageItem.timestamp
            continue
        }
        byKey.set(key, { ...child, key, timestamp: messageItem.timestamp })
    }
    return [...byKey.values()].sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
})

watch(childChips, (chips) => {
    if (composerEntityTouched) return
    // Latest-child preselection belongs to the top-level (organization) chat
    // only; a thread composed for a specific entity defaults to that entity,
    // so a panel inside entity X links sends to X unless a chip is picked.
    const conversation = activeConversation.value
    const latest = chips[0] || null
    const preferLatestChild = conversation?.entityType === 'organization'
    composerEntity.value = preferLatestChild && latest
        ? { type: latest.type, id: latest.id, name: latest.name }
        : null
}, { immediate: true })

watch(activeConversationKey, () => {
    replyTo.value = null
    composerEntity.value = null
    composerEntityTouched = false
    includeChildren.value = true
})

// The children toggle re-queries the thread: the composed subtree view and
// messages linked to the entity itself are different server-side matches.
watch(includeChildren, () => {
    if (activeConversation.value?.conversationKind === 'entity') loadConversation()
})

const selectComposerEntity = (chip) => {
    composerEntityTouched = true
    composerEntity.value = chip
        ? { type: chip.type, id: chip.id, name: chip.name }
        : null
}

// Replies quote the target inline in the composer; sending carries the
// parent id and the message payload clears the quote on success.
const openReply = (messageItem) => {
    replyTo.value = messageItem || null
}

const cancelReply = () => {
    replyTo.value = null
}

// Mobile swipe-to-reply: arm on a horizontal drag, commit past the
// threshold on release. touch-pan-y keeps vertical scrolling native.
let swipeState = null

const onTouchStart = (event, messageItem) => {
    const touch = event.touches?.[0]
    if (!touch) return
    swipeState = { key: messageItem._id, x: touch.clientX, y: touch.clientY, armed: false }
}

const onTouchMove = (event, messageItem) => {
    if (!swipeState || swipeState.key !== messageItem._id) return
    const touch = event.touches?.[0]
    if (!touch) return
    const dx = touch.clientX - swipeState.x
    const dy = touch.clientY - swipeState.y
    if (dx > 36 && dx > Math.abs(dy) * 1.5) {
        swipeState.armed = true
        swipeArmed.value = new Set([...swipeArmed.value, messageItem._id])
    } else if (swipeState.armed && (dx < 18 || Math.abs(dy) > dx)) {
        swipeState.armed = false
        swipeArmed.value = new Set([...swipeArmed.value].filter(key => key !== messageItem._id))
    }
}

const onTouchEnd = (messageItem) => {
    const armed = swipeState?.armed && swipeState.key === messageItem._id
    swipeState = null
    swipeArmed.value = new Set([...swipeArmed.value].filter(key => key !== messageItem._id))
    if (armed) openReply(messageItem)
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
    if (chatTarget.value?.userId || chatTarget.value?.entityKey) openDirectTarget()
})
onBeforeUnmount(() => {
    if (unsubscribeConversation) {
        unsubscribeConversation()
        unsubscribeConversation = null
    }
    if (typingResetTimer) clearTimeout(typingResetTimer)
    if (typingSendTimer) clearTimeout(typingSendTimer)
    if (incomingCallTimer) clearTimeout(incomingCallTimer)
    if (mediaRecorder) {
        mediaRecorder.onstop = null
        mediaRecorder.stop()
    }
    stopRecordingTracks()
})

watch(chatTarget, () => {
    if (supportDialog.value && (chatTarget.value?.userId || chatTarget.value?.entityKey)) openDirectTarget()
}, { deep: true })

watch(supportDialog, (isOpen) => {
    if (isOpen && (chatTarget.value?.userId || chatTarget.value?.entityKey)) openDirectTarget()
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
const attachmentPickerEmpty = computed(() => !entityTypeOptions.value.length && !createActions.value.length)

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

// Every entity-creation action in the user scope rides the picker as a
// generated action button; running one follows the same flow the generated
// surfaces use and attaches the created entity to the draft.
const createActions = computed(() => Array.from(new Map(
    (authStore.actionManifest || [])
        .filter(action => action?.actionKind === 'createEntity' && isGeneratedSurfaceAction(action))
        .map(action => [action.actionId || action.id, action])
).values()))

const pendingCreateActionLabel = computed(() => pendingCreateAction.value
    ? generatedActionLabel(pendingCreateAction.value, '', { t, te })
    : t('common.confirm'))

const createPromptFields = computed(() => (pendingCreateAction.value
    ? promptedFields(pendingCreateAction.value)
    : []))

const runCreateAction = async (action) => {
    if (!action?.actionId) return
    const creator = artifactCreatorForAction(action)
    if (creator) {
        pendingCreateAction.value = action
        pendingCreator.value = creator
        creatorVisible.value = true
        return
    }
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
        const type = field.entityType || field.accepts?.[0]
        if (field.type === 'entity' || field.type === 'entityList') {
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
        const result = await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(action.actionId)}/execute`, {
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
    const type = action.relationMutation?.targetType || action.entityType
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

const selectCreatedArtifact = (artifact) => {
    attachCreatedEntity(
        { entityType: 'artifact', relationMutation: null },
        { created: artifact }
    )
    pendingCreator.value = null
    pendingCreateAction.value = null
}

const loadEntityTypes = async () => {
    try {
        const types = await $fetch('/api/support/entity-types')
        entityTypeOptions.value = (types || []).map(type => ({
            label: type.labelKey ? t(type.labelKey) : localizedEntityTypeLabel(type.value),
            value: type.value
        }))
    } catch (error) {
        console.error('Failed to load support entity types:', error)
        entityTypeOptions.value = []
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
    if (key.startsWith('entity:')) {
        const [, entityType, entityId] = key.split(':')
        activeConversation.value = {
            conversationKey: key,
            conversationKind: 'entity',
            entityType,
            entityId,
            entityName: '',
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
    closeChat()
    navigateTo('/chats')
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
        return conversation?.entityName || conversation?.entityType || t('support.sectionEntities')
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
