<template>
    <div class="flex flex-col h-full">
        <Panel>
            <template #header>
                <h2 class="m-0 text-base">{{ $t('admin.supportChatList') }}</h2>
            </template>
            
            <div class="flex flex-col gap-2 p-2">
                <div v-if="chatList.length > 0" class="flex flex-col gap-2">
                    <Panel
                        v-for="chat in chatList" 
                        :key="chat.userId" 
                        @click="selectChat(chat.userId)"
                    >
                        <template #header>
                            <div class="flex items-center gap-3">
                                <Avatar 
                                    :label="getUserName(chat.user)" 
                                    shape="circle" 
                                    :style="{ backgroundColor: letterToBg(getUserName(chat.user)), color: 'var(--p-primary-contrast-color)' }"
                                />
                                <span class="truncate">{{ chat.user?.name || $t('admin.unknownUser') }}</span>
                            </div>
                        </template>
                        <small>ID: {{ chat.userId.slice(-8) }}</small>
                        <Divider />
                        <div class="flex flex-col">
                            <p class="m-0 italic truncate">{{ chat.lastMessage }}</p>
                            <small>{{ getTimeAgo(chat.timestamp) }}</small>
                        </div>
                    </Panel>
                </div> 

                <div v-else-if="loading" class="flex flex-col items-center py-20">
                    <ProgressSpinner />
                    <p>{{ $t('admin.loadingChatList') }}</p>
                </div>

                <div v-else class="flex flex-col items-center py-20">
                    <i class="pi pi-inbox text-4xl mb-2"></i>
                    <p>{{ $t('admin.noChats') }}</p>
                </div>

                <div v-if="error" class="flex flex-col gap-4">
                    <Message severity="error">{{ error }}</Message>
                    <Button 
                        :label="$t('admin.retry')"
                        severity="danger"
                        text
                        @click="connectToChatList"
                    />
                </div>
            </div>
        </Panel>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Panel from 'primevue/panel'
import Avatar from 'primevue/avatar'
import Divider from 'primevue/divider'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Button from 'primevue/button'
import { supportAvatarPalette } from '~/assets/tokens/index.js'

const { t } = useI18n()
const chatList = ref([])
const loading = ref(true)
const error = ref(null)
const selectedUserId = ref(null)
let eventSource = null

const emit = defineEmits(['select-chat'])

const connectToChatList = () => {
    try {
        loading.value = true
        eventSource = new EventSource('/api/support/admin/chatlist')
        eventSource.onopen = () => {
            loading.value = false
        }

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data)

            switch (data.type) {
                case 'initial':
                    chatList.value = data.data
                    loading.value = false
                    break
                case 'update':
                    chatList.value = data.data
                    break
                case 'heartbeat':
                    break
            }
        }

        eventSource.onerror = (error) => {
            console.error('EventSource error:', error)
            error.value = t('admin.connectionFailed')
            loading.value = false
        }
    } catch (err) {
        console.error('Error connecting to chat list:', err)
        error.value = t('admin.failedToConnect')
        loading.value = false
    }
}

const selectChat = (userId) => {
    selectedUserId.value = userId
    emit('select-chat', userId)
}

onMounted(() => {
    connectToChatList()
})

onUnmounted(() => {
    if (eventSource) {
        eventSource.close()
    }
})

const getUserName = (user) => {
    return user?.name?.split(' ').map(word => word.charAt(0).toUpperCase()).join('') || 'U'
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
