<template>
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
<Divider v-if="messageItem.firstUnread" align="center" data-testid="chat-unread-divider">
<span class="text-primary text-supporting">{{ $t('support.newMessages') }}</span>
</Divider>

                        <div
                            :data-message-id="messageItem._id"
                            class="relative flex min-w-0 max-w-support-chat-message touch-pan-y flex-col"
                            :class="docksRight(messageItem) ? 'ml-auto' : ['mr-auto', threadIsWide ? 'ml-12' : '']"
                            @touchstart="onTouchStart($event, messageItem)"
                            @touchmove="onTouchMove($event, messageItem)"
                            @touchend="onTouchEnd(messageItem)"
                            @touchcancel="onTouchCancel(messageItem)"
                            @contextmenu="openMessageMenuFromRow($event, messageItem, true)"
                        >
                            <!-- Swipe reveal icon: it sits in the gap the
                                 dragged row vacates at its dock edge and
                                 fades in with the drag distance; the row
                                 keeps hugging its side through the auto
                                 margin. -->
                            <span
                                v-if="swipeDrag.id === messageItem._id"
                                class="absolute top-1/2 -translate-y-1/2"
                                :class="docksRight(messageItem) ? 'right-1' : 'left-1'"
                                :style="{ opacity: swipeIconOpacity(messageItem) }"
                                aria-hidden="true"
                            >
                                <i
                                    class="pi pi-reply"
                                    :class="swipeArmed.has(messageItem._id) ? 'text-primary' : 'text-muted'"
                                ></i>
                            </span>
<ChatMessageBubble :thread="thread" :message-item="messageItem" />
                        </div>
                    </template>

                    <!-- The agent's live run: reasoning, tool activity,
                         and the answer as it is produced — the same shape
                         that persists on the reply, which replaces it. -->
                    <div
                        v-if="agentActivity"
                        class="mr-auto flex min-w-0 max-w-support-chat-message flex-col gap-2"
                        data-testid="chat-agent-activity"
                    >
                        <AgentActivity :activity="agentActivity" live />
                        <div
                            v-if="agentActivity.answer"
                            class="max-w-full min-w-0 self-start py-0.5 text-body"
                        >
                            <div class="m-0 min-w-0 break-words text-body [overflow-wrap:anywhere]">
                                <SupportMessageContent :message="{ message: agentActivity.answer }" markdown />
                            </div>
                        </div>
                    </div>
                </div>

        <ContextMenu ref="messageMenu" :model="messageMenuItems">
            <template #itemicon="{ item, class: itemIconClass }">
                <ProgressSpinner v-if="item.spinner" class="h-4 w-4" :class="itemIconClass" />
                <i v-else-if="item.icon" :class="[itemIconClass, item.icon]" />
            </template>
        </ContextMenu>
</template>

<script setup>
import AgentActivity from '~/components/shared/AgentActivity.vue'
import Button from 'primevue/button'
import ChatMessageBubble from '~/components/chat/ChatMessageBubble.vue'
import ContextMenu from 'primevue/contextmenu'
import Divider from 'primevue/divider'
import ProgressSpinner from 'primevue/progressspinner';
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue'
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
const props = defineProps({ thread: Object })
const { agentActivity, docksRight, handleMessagesScroll, hasMoreMessages, loadOlderMessages, loadingAnchor, loadingOlder, message, messageMenu, messageMenuItems, messages, messagesContainer, messagesList, onTouchCancel, onTouchEnd, onTouchMove, onTouchStart, openMessageMenuFromRow, swipeArmed, swipeDrag, swipeIconOpacity, threadIsWide } = props.thread
</script>
