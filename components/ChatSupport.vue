<template>
    <!-- One surface for every host: the popup Dialog, the /chats route, and
         the call workspace all embed this same plain column — the host owns
         position, chrome, and stacking. -->
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
            >
                    <ChatThreadHeader :thread="thread" :embedded="embedded" :full-page="fullPage" :thread-only="threadOnly" />
<ChatSearchPanel
v-if="searchVisible"
:conversation-key="activeConversationKey"
:participants="searchParticipants"
:type-options="searchTypeOptions"
:viewer-id="currentUserId"
@close="closeSearch"
@jump="row => goToMessage(row._id, row.timestamp)"
/>
                    <ChatThreadStage :thread="thread" :full-page="fullPage" />
            </section>
        </div>
        <CallDialog
            v-model:visible="callDialog"
            :room="callRoom"
            :label="callHeaderLabel"
        />
        <StandardDialog
            v-model:visible="newChatDialog"
            size="sm"
            :show-default-footer="false"
            :title="$t('support.newChat')"
        >
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
                <StateBlock
                    v-else-if="!newChatOptions.length"
                    :message="$t('common.noResults')"
                    icon="pi pi-users"
                />
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
            :title="$t('support.newGroup')"
            @save="createGroup"
            @cancel="groupDialog = false"
        >
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
import CallDialog from '~/components/calls/CallDialog.vue'
import ChatBotPanel from '~/components/shared/ChatBotPanel.vue'
import ChatSearchPanel from '~/components/chat/ChatSearchPanel.vue'
import ChatInboxRail from '~/components/chat/ChatInboxRail.vue'
import ChatThreadHeader from '~/components/chat/ChatThreadHeader.vue'
import ChatThreadStage from '~/components/chat/ChatThreadStage.vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import InstanceMultiSelect from '~/components/shared/InstanceMultiSelect.vue'
import Listbox from 'primevue/listbox'
import StandardDialog from '~/components/shared/StandardDialog.vue'
import StateBlock from '~/components/shared/StateBlock.vue'
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
const { activeConversation, activeConversationKey, botPanelConversationKey, botPanelVisible, callDialog, callHeaderLabel, callRoom, closeSearch, createGroup, goToMessage, groupDialog, groupMemberIds, groupMemberOptions, groupMemberSearch, groupMemberSearching, groupName, groupSaving, newChatDialog, newChatOptions, newChatSearch, newChatSearching, newChatUsersLoading, openNewChatUser, searchParticipants, searchTypeOptions, searchVisible, supportDialog, currentUserId } = thread
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
    width: var(--chat-rail-width, 20rem);
  }

  .chat-page--thread .chat-inbox--rail {
    display: flex;
  }

  .chat-page--thread :deep(.chat-back) {
    display: none;
  }

  .chat-empty {
    display: flex;
  }
}
</style>
