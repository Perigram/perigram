<template>
                            <div
                                class="flex min-w-0 max-w-full flex-col gap-1"
                                :class="[
                                    // Hug the bubble: the row must not stretch
                                    // full width, or the ±2rem menu overhang
                                    // lands outside the thread column (whose
                                    // overflow-y-auto forces overflow-x auto).
                                    docksRight(messageItem) ? 'self-end' : 'self-start',
                                    docksRight(messageItem) ? 'items-end' : 'items-start',
                                    swipeDrag.id === messageItem._id ? '' : 'transition-transform',
                                    highlightKey === String(messageItem._id) ? 'animate-pulse' : ''
                                ]"
                                :style="swipeStyle(messageItem)"
                            >
                                <!-- Content zone: the avatar gutter mark
                                     anchors to the last message content;
                                     the timestamp caption trails below
                                     that anchor (SPEC §Chat thread). -->
                                <div
                                    :class="['relative flex min-w-0 max-w-full flex-col gap-1', docksRight(messageItem) ? 'items-end' : 'items-start']"
                                >
                                <!-- Sender label: group threads lead others'
                                     runs with the sender's avatar and name (the
                                     shared user chip, which opens the entity
                                     popup) — once per run, never for the
                                     viewer's own messages. -->
                                <UserChip
                                    v-if="showSenderAvatar(messageItem)"
                                    :user-id="messageSenderKey(messageItem)"
                                    avatar-only
                                    class="absolute -left-12 bottom-0"
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
                                            v-if="messageItem.parent.snippet && (messageItem.parent.attachments || []).length"
                                            :class="parentAttachmentIcon(messageItem.parent)"
                                            class="shrink-0 text-muted"
                                            aria-hidden="true"
                                        />
                                        <span v-if="messageItem.parent.snippet" class="min-w-0 truncate [overflow-wrap:anywhere]">
                                            {{ messageItem.parent.snippet }}
                                        </span>
                                        <!-- Non-text quotes carry the attachment
                                             or ref summary, the same line the
                                             inbox preview renders. -->
                                        <MessageAttachments
                                            v-else-if="(messageItem.parent.attachments || []).length || (messageItem.parent.instanceRefs || []).length"
                                            :attachments="messageItem.parent.attachments || []"
                                            :refs="messageItem.parent.instanceRefs || []"
                                            single-line
                                            class="min-w-0"
                                        />
                                    </span>
                                </button>
                                <!-- Forwarded provenance rides directly over
                                     the content it describes (SPEC §Chat
                                     thread) — the sender label leads the run,
                                     the caption hugs the message: a caption
                                     line above every shape — text, media, or
                                     files. -->
                                <span
                                    v-if="messageItem.forwardedFrom"
                                    class="flex min-w-0 items-center gap-1 px-1 text-muted text-supporting"
                                >
                                    <span class="min-w-0 truncate">
                                        {{ $t('support.forwardedFrom', { name: messageItem.forwardedFrom.senderName || $t('common.user') }) }}
                                    </span>
                                </span>
                                <AgentActivity
                                    v-if="messageItem.agent"
                                    :activity="messageItem.agent"
                                    class="px-1"
                                />
                                <div
                                    v-if="messageBubbleText(messageItem)"
                                    class="relative max-w-full min-w-0 text-body"
                                    :class="[
                                        // An agent answer is room content, not a
                                        // chat bubble: markdown in document flow.
                                        // A failure notice is typed machine
                                        // output: a severity-styled Message,
                                        // never a bubble. A voice message's
                                        // transcript is caption chrome on the
                                        // lower surface — never the sender's
                                        // primary bubble (SPEC: chat); it is
                                        // the viewer's private transcript, so
                                        // only transcribing viewers see text
                                        // here.
                                        messageItem.agent
                                            ? 'py-0.5'
                                            : messageItem.notice
                                                ? ''
                                                : [
                                                    'rounded-ui px-4 py-2',
                                                    isAudioOnlyMessage(messageItem) ? 'bg-subtle' : isOwnMessage(messageItem)
                                                        ? 'bg-primary text-primary-contrast'
                                                        : 'bg-subtle'
                                                ],
                                        isAudioOnlyMessage(messageItem) ? 'order-last' : ''
                                    ]"
                                >
                                    <Message
                                        v-if="messageItem.notice"
                                        :severity="messageItem.notice"
                                        :closable="false"
                                    >
                                        <SupportMessageContent :message="bubbleContentMessage(messageItem)" />
                                    </Message>
                                    <div v-else class="m-0 min-w-0 break-words text-body [overflow-wrap:anywhere]">
                                        <SupportMessageContent
                                            :message="bubbleContentMessage(messageItem)"
                                            :markdown="Boolean(messageItem.agent)"
                                        />
                                    </div>
                                </div>
                                <!-- The attachment surface: files, media, and
                                     attached instance refs ride one row group
                                     under the message body, on the page
                                     surface — never inside a contrast
                                     bubble. -->
                                <div
                                    v-if="(messageItem.attachments || []).length || (messageItem.instanceRefs || []).length"
                                    class="flex max-w-full flex-col items-start gap-1"
                                >
                                    <MessageAttachments
                                        :attachments="messageItem.attachments || []"
                                        :refs="messageItem.instanceRefs || []"
                                        :viewer-user-id="currentUserId"
                                        :sender-user-id="messageItem.senderUserId || ''"
                                        :own-message="docksRight(messageItem)"
                                    />
                                </div>
                                <span
                                    v-if="transcribingMessageIds.has(messageItem._id)"
                                    class="flex min-w-0 items-center gap-1 px-1 text-muted text-supporting"
                                >
                                    <ProgressSpinner class="h-3.5 w-3.5 shrink-0" />
                                    <span class="min-w-0 truncate">{{ $t('support.transcribing') }}</span>
                                </span>
                                </div>
                                <!-- Timestamp trails the sender run: only the
                                     last message of a run carries it (SPEC
                                     §Chat thread); the caption row stays
                                     mounted for the instance leaf link
                                     regardless. -->
                                <span
                                    v-if="messageItem.lastOfSenderRun || lowerInstanceChip(messageItem)"
                                    class="flex min-w-0 items-center gap-1 px-1 text-muted text-supporting"
                                >

<template v-if="messageItem.lastOfSenderRun">
{{ formatTime(messageItem.timestamp) }}
</template>
<i
v-if="messageItem.lastOfSenderRun && isOwnMessage(messageItem)"
class="pi text-[0.7rem]"
:class="messageSeen(messageItem) ? 'pi-check-circle text-primary' : 'pi-check text-muted'"
:aria-label="messageSeen(messageItem) ? $t('support.seenBy') : undefined"
data-testid="chat-message-seen"
/>
                                    <!-- Messages linked to lower instances keep a
                                         subtle, clickable leaf link inside the
                                         caption; it is inline caption text, not a
                                         control, so a plain minimal element beats
                                         PrimeVue button chrome here. Only the
                                         label underlines on hover; the icon
                                         never does. Types without a record
                                         surface render the plain caption — no
                                         dead link. -->
                                    <button
                                        v-if="lowerInstanceChip(messageItem) && entityPopupOpenable(messageItem.instanceLink.type)"
                                        type="button"
                                        class="group flex min-w-0 items-center gap-1 transition-opacity"
                                        :aria-label="instanceLinkLabel(messageItem.instanceLink)"
                                        @click="openLowerInstanceChat(messageItem)"
                                    >
                                        <i :class="instances.iconFor(messageItem.instanceLink.type)" class="shrink-0 scale-90" aria-hidden="true"></i>
                                        <span class="min-w-0 truncate underline-offset-4 group-hover:underline">{{ instanceLinkLabel(messageItem.instanceLink) }}</span>
                                    </button>
                                    <span
                                        v-else-if="lowerInstanceChip(messageItem)"
                                        class="flex min-w-0 items-center gap-1"
                                    >
                                        <i :class="instances.iconFor(messageItem.instanceLink.type)" class="shrink-0 scale-90" aria-hidden="true"></i>
                                        <span class="min-w-0 truncate">{{ instanceLinkLabel(messageItem.instanceLink) }}</span>
                                    </span>
                                </span>
                            </div>
</template>

<script setup>
import AgentActivity from '~/components/shared/AgentActivity.vue'
import Message from 'primevue/message'
import MessageAttachments from '~/components/shared/MessageAttachments.vue'
import ProgressSpinner from 'primevue/progressspinner';
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue'
import UserChip from '~/components/shared/UserChip.vue'
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
const props = defineProps({ thread: Object, messageItem: Object })
const { bubbleContentMessage, currentUserId, docksRight, entityPopupOpenable, formatTime, goToMessage, highlightKey, instanceLinkLabel, instanceRefs, instances, isAudioOnlyMessage, isOwnMessage, lowerInstanceChip, message, messageBubbleText, messageSeen, messageSenderKey, messages, openLowerInstanceChat, parentAttachmentIcon, showSenderAvatar, showSenderLabel, swipeDrag, swipeStyle, transcribingMessageIds } = props.thread
</script>
