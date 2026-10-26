<template>
                <div
                    class="flex flex-col gap-2 border-t border-chrome-border p-3 md:p-4"
                    :class="fullPage ? '' : 'max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]'"
                >
                    <div
                        v-show="typingName || agentTypingName"
                        ref="typingIndicatorRef"
                        class="px-1 text-muted text-supporting opacity-0"
                    >
                        {{ $t('support.typing', { name: typingName || agentTypingName }) }}
                    </div>
                    <!-- The conversation is an execution point: the AI in
                         this room runs on the chosen model off the served
                         endpoints (blank = the org chat route). -->
                    <div v-if="modelSelectVisible" class="flex items-center justify-end px-1">
                        <PrimeSelect
                            :model-value="conversationModel"
                            :options="conversationModelOptions"
                            option-label="label"
                            option-value="value"
                            size="small"
                            class="max-w-52"
                            :aria-label="$t('llm.profile')"
                            data-testid="chat-conversation-model"
                            @update:model-value="setConversationModel"
                        />
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
                            <UserChip :user-id="messageSenderKey(replyTo)" class="max-w-full" />
                            <span class="flex min-w-0 items-center gap-1 text-supporting">
                                <span v-if="replyTo.message" class="min-w-0 truncate">
                                    {{ replyTo.message }}
                                </span>
                                <MessageAttachments
                                    v-else-if="(replyTo.attachments || []).length || (replyTo.instanceRefs || []).length"
                                    :attachments="replyTo.attachments || []"
                                    :refs="replyTo.instanceRefs || []"
                                    single-line
                                    class="min-w-0"
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

                    <!-- Instance target strip: level drill-down over the
                         app's instance tree — types at the org root,
                         instances inside a type, lineage children inside
                         an instance. -->
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
                                <!-- The current level carries its label. -->
                                <button
                                    type="button"
                                    class="flex h-6 shrink-0 items-center justify-center rounded-ui transition-colors"
                                    :class="[
                                        index === stripTrail.length - 1 ? 'w-auto gap-1 px-2' : 'w-6',
                                        isTrailEntrySelected(crumb)
                                            ? 'bg-primary text-primary-contrast'
                                            : 'bg-subtle text-muted hover:opacity-80'
                                    ]"
                                    :title="crumb.name || $t('common.unnamed')"
                                    :aria-label="crumb.name || $t('common.unnamed')"
                                    :aria-current="isTrailEntrySelected(crumb) ? 'true' : undefined"
                                    @click="truncateStripTrail(index)"
                                >
                                    <i :class="instances.iconFor(crumb.type)" aria-hidden="true"></i>
                                    <span v-if="index === stripTrail.length - 1" class="max-w-32 truncate text-supporting">
                                        {{ crumb.name || $t('common.unnamed') }}
                                    </span>
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
                                    <span class="max-w-32 truncate">{{ chip.name || $t('common.unnamed') }}</span>
                                </button>
                            </template>
                        </div>
                    </div>

                    <div v-if="messagePreviewVisible" class="rounded-ui bg-subtle p-2 text-muted text-body">
                        <SupportMessageContent :message="draftPreviewMessage" />
                    </div>
                    <div v-if="instanceRefs.length" class="flex max-w-full flex-wrap items-center gap-1">
                        <span
                            v-for="ref in instanceRefs"
                            :key="`${ref.type}-${ref.id}`"
                            class="inline-flex max-w-full items-center gap-0.5"
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
                        </span>
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
                    <!-- The suspended agent question (ask_user): rendered at
                         the composer until answered, stopped, or timed
                         out; options send as one-tap replies. -->
                    <div
                        v-if="agentQuestion"
                        class="mb-1 flex flex-wrap items-center gap-2 rounded-ui bg-content p-2 shadow-overlay"
                        data-testid="chat-agent-question"
                    >
                        <span class="min-w-0 flex-1 text-body">{{ agentQuestion.question }}</span>
                        <Button
                            v-for="option in agentQuestion.options"
                            :key="option"
                            :label="option"
                            severity="secondary"
                            outlined
                            size="small"
                            @click="sendAgentAnswer(option)"
                        />
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
                    <div v-else class="relative flex items-end gap-1 rounded-ui bg-subtle p-1.5" data-testid="chat-composer">
                        <!-- The @-address typeahead: the seated AI first,
                             then the room's humans; a pick completes the
                             token in place. -->
                        <div
                            v-if="mentionState && mentionRows.length"
                            class="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-ui bg-content p-1.5 shadow-overlay"
                            role="listbox"
                            data-testid="chat-mention-dropdown"
                        >
                            <button
                                v-for="(row, index) in mentionRows"
                                :key="row.id"
                                type="button"
                                class="flex w-full items-center gap-2 rounded-ui px-1.5 py-1 text-left"
                                :class="index === mentionState.index ? 'bg-subtle' : ''"
                                role="option"
                                :aria-selected="index === mentionState.index"
                                @mousedown.prevent="applyMention(row)"
                                @mousemove="mentionState.index = index"
                            >
                                <AiAvatar v-if="row.bot" class="shrink-0" />
                                <Avatar
                                    v-else
                                    :image="row.avatarUrl"
                                    :label="row.avatarUrl ? null : row.name.charAt(0).toUpperCase()"
                                    shape="circle"
                                    class="h-6 w-6 bg-subtle text-supporting [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                                />
                                <span class="min-w-0 truncate">{{ row.name }}</span>
                            </button>
                        </div>
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
                            ref="composerField"
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
                            v-if="agentRunLive"
                            icon="pi pi-stop-circle"
                            severity="secondary"
                            rounded
                            class="shrink-0"
                            :aria-label="$t('support.stopRun')"
                            data-testid="chat-stop-run"
                            @click="stopAgentRun"
                        />
                        <Button
                            v-else-if="!canSendComposerDraft && voiceRecordingSupported && voiceRecordingAllowed"
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
</template>

<script setup>
import AiAvatar from '~/components/shared/AiAvatar.vue'
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue'
import Message from 'primevue/message'
import MessageAttachments from '~/components/shared/MessageAttachments.vue'
import PrimeSelect from 'primevue/select'
import ProgressBar from 'primevue/progressbar'
import Select from '~/components/shared/InstanceSelect.vue'
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue'
import Textarea from 'primevue/textarea'
import UserChip from '~/components/shared/UserChip.vue'
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
const props = defineProps({ thread: Object, fullPage: Boolean })
const { activeConversation, agentQuestion, agentRunLive, agentTypingName, applyMention, attachmentPickerEmpty, canSendComposerDraft, cancelReply, cancelVoiceRecording, composerField, composerStagedRows, composerTextareaPt, conversationModel, conversationModelOptions, draftPreviewMessage, drillStripTo, formatFileSize, formatRecordingDuration, handleComposerPaste, handleKeyDown, handleTypingInput, instanceConversationIcon, instanceRefs, instances, isChipSelected, isTrailEntrySelected, localizedTypeIdLabel, mentionRows, mentionState, message, messagePreviewVisible, messageSenderKey, modelSelectVisible, openAttachmentPicker, pendingFileIcon, pendingTargetLabel, recipientLimitedRefs, recordingElapsed, removeInstanceRef, removePendingFile, replyTo, resetStripTrail, sendAgentAnswer, sendMessage, setConversationModel, setPendingTarget, startVoiceRecording, stopAgentRun, stopAndSendVoiceRecording, stripChildren, stripRootSelected, stripTrail, t, toggleVoiceRecordingPause, truncateStripTrail, typingIndicatorRef, typingName, voicePaused, voiceRecording, voiceRecordingAllowed, voiceRecordingSupported, voiceSending } = props.thread
</script>
