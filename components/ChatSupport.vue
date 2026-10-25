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
<ChatInboxRail
            v-if="(!activeConversation || fullPage) && !threadOnly"
            :thread="thread"
            :full-page="fullPage"
            :thread-only="threadOnly"
            :embedded="embedded"
        />
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
                    <i class="pi pi-upload text-[1.25rem] text-muted" aria-hidden="true" />
                    <span class="text-label">{{ $t('support.dropFiles') }}</span>
                </div>
                    <ChatThreadHeader :thread="thread" :embedded="embedded" :full-page="fullPage" :thread-only="threadOnly" />
<ChatSearchPanel
v-if="searchVisible"
:conversation-key="activeConversationKey"
:participants="searchParticipants"
:viewer-id="currentUserId"
@close="closeSearch"
@jump="row => goToMessage(row._id, row.timestamp)"
/>
                    <ChatMessageList :thread="thread" />
<span v-if="!atBottom" class="absolute bottom-24 right-3 z-10" data-testid="chat-scroll-to-end">
<Button
icon="pi pi-arrow-down"
severity="primary"
rounded
size="small"
:aria-label="$t('support.scrollToEnd')"
@click="scrollToBottomFromControl"
/>
<span
v-if="waitingMessages"
class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-ui bg-primary px-1 text-[0.65rem] text-primary-contrast"
>
{{ waitingMessages }}
</span>
</span>
                    <ChatComposer :thread="thread" :full-page="fullPage" />
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
                            <AiAvatar
                                v-if="option.instance?.data?.bot"
                                class="shrink-0"
                            />
                            <Avatar
                                v-else
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
                            <AiAvatar v-if="isAiChatRow(option) || isBotDirectRow(option)" class="shrink-0" />
                            <Avatar
                                v-else-if="option.conversationKind === 'group'"
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
        <ChatBotPanel
            v-model:visible="botPanelVisible"
            :conversation-key="botPanelConversationKey"
            :subscribable="Boolean(botPanelConversationKey)"
        />
    </div>
</template>

<script setup>
import AiAvatar from '~/components/shared/AiAvatar.vue'
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import CallPanel from '~/components/calls/CallPanel.vue'
import ChatAttachmentPicker from '~/components/shared/ChatAttachmentPicker.vue'
import ChatBotPanel from '~/components/shared/ChatBotPanel.vue'
import ChatComposer from '~/components/chat/ChatComposer.vue'
import ChatSearchPanel from '~/components/chat/ChatSearchPanel.vue'
import ChatInboxRail from '~/components/chat/ChatInboxRail.vue'
import ChatMessageList from '~/components/chat/ChatMessageList.vue'
import ChatThreadHeader from '~/components/chat/ChatThreadHeader.vue'
import DatePicker from 'primevue/datepicker'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import InstanceMultiSelect from '~/components/shared/InstanceMultiSelect.vue'
import Listbox from 'primevue/listbox'
import Select from '~/components/shared/InstanceSelect.vue'
import StandardDialog from '~/components/shared/StandardDialog.vue'
import StateBlock from '~/components/shared/StateBlock.vue'
import ToggleSwitch from 'primevue/toggleswitch'
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import { useChatThread } from '~/components/chat/useChatThread.js'

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
const thread = useChatThread(props, emit)
const { activeConversation, activeConversationKey, atBottom, attachmentPicker, botPanelConversationKey, botPanelVisible, callDialog, callHeaderLabel, callRoom, chatFileAcceptAttr, chatUploadEnabled, closeSearch, conversationAvatar, conversationLabel, createGroup, createPromptFields, createPromptOptions, createPromptValues, createPromptVisible, currentUserId, executingCreate, filesDragging, forwardDialog, forwardOptions, forwardToConversation, forwarding, goToMessage, groupDialog, groupMemberIds, groupMemberOptions, groupName, groupSaving, instanceConversationIcon, isAiChatRow, isBotDirectRow, message, newChatDialog, newChatOptions, newChatUsersLoading, onFilesDragEnter, onFilesDragLeave, onFilesDragOver, onFilesDrop, openNewChatUser, pendingCreateAction, pendingCreateActionLabel, runCreateAction, scrollToBottomFromControl, searchParticipants, searchVisible, selectAttachment, stageChatFiles, submitCreatePrompt, supportDialog, waitingMessages } = thread
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
