<template>
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
                    <AiAvatar v-else-if="isAiOnlyRoom" class="shrink-0" />
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
                                <!-- The thread target opens its popup only
                                     when the type has a record surface;
                                     otherwise the label stays plain text —
                                     never a link that opens an empty shell. -->
                                <Button
                                    v-else-if="activeConversation.conversationKind === 'instance' && activeConversation.instanceId && entityPopupOpenable(activeConversation.typeId)"
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
                              opens the full member list as a popup. AI
                              threads carry nothing here — a 1:1 chat is the
                              title and the badge alone. -->
                        <TraceChain
                            v-if="activeConversation.conversationKind === 'instance'"
                            :entity="chatInstanceRecord"
                            :type-id="activeConversation.typeId"
                            class="min-w-0"
                        />
                        <button
                            v-else-if="activeConversation.conversationKind === 'group' && !isAiOnlyRoom"
                            type="button"
                            class="flex min-w-0 items-center gap-1.5"
                            :aria-label="$t('support.members')"
                            data-testid="chat-members-trigger"
                            @click="toggleMembersList($event)"
                        >
                            <AvatarGroup class="shrink-0">
                                <template v-for="participant in groupParticipants.slice(0, 4)" :key="participant.id">
                                    <AiAvatar
                                        v-if="participant.bot"
                                        class="h-6 w-6 [&_.p-avatar-icon]:text-[0.75rem]"
                                    />
                                    <Avatar
                                        v-else
                                        :image="participant.avatarUrl"
                                        :label="participant.avatarUrl ? null : participant.name.charAt(0).toUpperCase()"
                                        shape="circle"
                                        class="h-6 w-6 bg-subtle text-supporting [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                                    />
                                </template>
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
                        <!-- Seating the AI is a group/instance-room action
                             (join/leave, model pin, wake rules); a 1:1 AI
                             thread needs none of it — the model select
                             above the composer pins the room. -->

<Button
icon="pi pi-search"
severity="secondary"
text
rounded
size="small"
:aria-label="$t('support.searchThread')"
data-testid="chat-thread-search"
@click="toggleSearch"
/>
<Button
v-if="['group', 'instance'].includes(activeConversation.conversationKind) && !activeConversation.agentDraft && !isAiOnlyRoom"
icon="pi pi-sparkles"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('support.bots.title')"
                            data-testid="chat-thread-bots"
                            @click="botPanelVisible = true"
                        />
                        <Button
                            v-if="activeConversation.conversationKind !== 'support' && !isAiOnlyRoom"
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
</template>

<script setup>
import AiAvatar from '~/components/shared/AiAvatar.vue'
import Avatar from 'primevue/avatar'
import AvatarGroup from 'primevue/avatargroup'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import TraceChain from '~/components/shared/links/TraceChain.vue'
import UserChip from '~/components/shared/UserChip.vue'
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
const props = defineProps({ thread: Object, embedded: Boolean, fullPage: Boolean, threadOnly: Boolean })
const { activeConversation, activeRecipientUserId, botPanelVisible, callsStore, canDeleteActiveGroup, chatInstanceRecord, closeChat, conversationAvatar, conversationInvite, conversationLabel, conversationSubtitle, groupParticipantIds, groupParticipants, includeChildren, instanceConversationIcon, isAiOnlyRoom, joinConversationCall, joinOngoingCall, membersList, ongoingCallRoom, openChatsPage, requestDeleteGroup, showInbox, startCall, toggleMembersList, toggleSearch } = props.thread
</script>
