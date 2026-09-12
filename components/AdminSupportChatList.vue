<template>
    <div class="flex h-full min-h-0 flex-col">
        <div class="p-4">
            <ActionToolbar :title="$t('admin.supportChatList')" :level="2" />
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4">
            <Listbox
                v-if="chatList.length"
                :options="chatList"
                option-label="userId"
                :aria-label="$t('admin.supportChatList')"
                @change="(option) => selectChat(option.value?.userId)"
            >
                <template #option="{ option }">
                    <div class="flex min-w-0 items-center gap-3">
                        <Avatar
                            :label="getUserName(option.participant).charAt(0).toUpperCase() || '?'"
                            shape="circle"
                            :style="{ backgroundColor: letterToBg(getUserName(option.participant)), color: 'var(--p-primary-contrast-color)' }"
                        />
                        <div class="min-w-0 flex-1">
                            <div class="flex min-w-0 items-center gap-2">
                                <span class="truncate text-label">{{ option.participant?.identity?.name || option.participant?.name || $t('admin.unknownUser') }}</span>
                                <Badge v-if="option.unreadCount" :value="option.unreadCount" severity="danger" size="small" />
                            </div>
                            <small class="block truncate text-muted-color">{{ option.lastMessage }}</small>
                            <small class="block truncate text-muted-color">{{ getTimeAgo(option.timestamp) }}</small>
                        </div>
                    </div>
                </template>
            </Listbox>

            <StateBlock v-else-if="loading" state="loading" :message="$t('admin.loadingChatList')" />
            <StateBlock v-else :message="$t('admin.noChats')" icon="pi pi-inbox" />

            <div v-if="error" class="flex flex-col gap-3">
                <Message severity="error">{{ error }}</Message>
                <Button
                    :label="$t('admin.retry')"
                    severity="danger"
                    text
                    @click="connectToChatList"
                />
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Avatar from 'primevue/avatar'
import Badge from 'primevue/badge'
import Button from 'primevue/button'
import Listbox from 'primevue/listbox'
import Message from 'primevue/message'
import ActionToolbar from '~/components/shared/ActionToolbar.vue'
import StateBlock from '~/components/shared/StateBlock.vue'
import { supportAvatarPalette } from '~/assets/tokens/index.js'
import { useConnections } from '~/composables/useConnections.js'

const { t } = useI18n()
const chatList = ref([])
const loading = ref(true)
const error = ref(null)
const selectedUserId = ref(null)
let unsubscribeAdminInbox = null

const emit = defineEmits(['select-chat'])

const refreshChatList = async () => {
    try {
        const response = await $fetch('/api/support/admin/chatlist')
        chatList.value = response?.data || []
        loading.value = false
    } catch (err) {
        console.error('Error loading chat list:', err)
        error.value = t('admin.failedToConnect')
        loading.value = false
    }
}

const connectToChatList = () => {
    loading.value = true
    refreshChatList()
    unsubscribeAdminInbox?.()
    unsubscribeAdminInbox = useConnections().subscribe('admin-support', (payload) => {
        if (payload?.type === 'support.inbox') refreshChatList()
    })
}

const selectChat = (userId) => {
    if (!userId) return
    selectedUserId.value = userId
    emit('select-chat', userId)
}

onMounted(() => {
    connectToChatList()
})

onUnmounted(() => {
    unsubscribeAdminInbox?.()
    unsubscribeAdminInbox = null
})

const getUserName = (user) => {
    const name = user?.identity?.name || user?.name || ''
    return name
}

const letterToBg = (letter) => {
    let val = 0;
    for (let i = 0; i < letter.length; i++) {
        val += letter.charCodeAt(i);
    }
    return supportAvatarPalette[val % supportAvatarPalette.length];
}

const getTimeAgo = (timestamp) => {
    const now = new Date();
    const diff = now - new Date(timestamp);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let timeStr = '';
    if (days > 0) timeStr = t('admin.daysShort', { count: days });
    else if (hours > 0) timeStr = t('admin.hoursShort', { count: hours });
    else if (minutes > 0) timeStr = t('admin.minutesShort', { count: minutes });
    else timeStr = t('admin.secondsShort', { count: seconds });

    return t('admin.ago', { time: timeStr });
}
</script>
