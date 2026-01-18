<template>
    <div class="flex flex-col h-full bg-[var(--p-surface-50)]">
        <div class="p-4 border-b border-[var(--p-content-border-color)] bg-[var(--p-content-background)]">
            <h2 class="text-lg font-bold text-[var(--p-text-color)] m-0">{{ $t('admin.supportChatList') }}</h2>
        </div>
        
        <div class="flex-1 overflow-y-auto custom-scrollbar p-2">
            <div v-if="chatList.length > 0" class="flex flex-col gap-2">
                <div
                    v-for="chat in chatList" 
                    :key="chat.userId" 
                    class="p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col gap-3 group"
                    :class="selectedUserId === chat.userId 
                        ? 'bg-[var(--p-primary-color)] border-[var(--p-primary-color)] shadow-md' 
                        : 'bg-[var(--p-content-background)] border-[var(--p-content-border-color)] hover:border-[var(--p-primary-color)]'"
                    @click="selectChat(chat.userId)"
                >
                    <div class="flex items-center gap-3">
                        <div 
                            :style="{ backgroundColor: letterToBg(getUserName(chat.user)) }"
                            class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm flex-shrink-0"
                        >   
                            {{ getUserName(chat.user) }}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold truncate" :class="selectedUserId === chat.userId ? 'text-[var(--p-primary-contrast-color)]' : 'text-[var(--p-text-color)]'">
                                {{ chat.user?.name || $t('admin.unknownUser') }}
                            </div>
                            <div class="text-[10px] uppercase tracking-widest font-black opacity-60" :class="selectedUserId === chat.userId ? 'text-[var(--p-primary-contrast-color)]' : 'text-[var(--p-text-muted-color)]'">
                                ID: {{ chat.userId.slice(-8) }}
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex flex-col gap-1 border-t pt-2" :class="selectedUserId === chat.userId ? 'border-[var(--p-primary-contrast-color)]/20' : 'border-[var(--p-content-border-color)]'">
                        <div class="text-xs italic truncate" :class="selectedUserId === chat.userId ? 'text-[var(--p-primary-contrast-color)]/90' : 'text-[var(--p-text-secondary-color)]'">
                            {{ chat.lastMessage }}
                        </div>
                        <div class="text-[10px] font-medium" :class="selectedUserId === chat.userId ? 'text-[var(--p-primary-contrast-color)]/70' : 'text-[var(--p-text-muted-color)]'">
                            {{ getTimeAgo(chat.timestamp) }}
                        </div>
                    </div>
                </div>
            </div> 

            <div v-else-if="loading" class="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                <ProgressSpinner style="width: 40px; height: 40px" strokeWidth="4" />
                <p class="text-sm font-bold uppercase tracking-widest">{{ $t('admin.loadingChatList') }}</p>
            </div>

            <div v-else class="flex flex-col items-center justify-center py-20 gap-4 opacity-40">
                <i class="pi pi-inbox text-5xl"></i>
                <p class="text-sm font-bold uppercase tracking-widest text-center">{{ $t('admin.noChats') }}</p>
            </div>

            <div v-if="error" class="p-4 bg-red-50 border border-red-100 rounded-xl flex flex-col gap-4">
                <p class="text-sm text-red-600 font-medium m-0">{{ error }}</p>
                <Button 
                    :label="$t('admin.retry')"
                    severity="danger"
                    size="small"
                    @click="connectToChatList"
                />
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ProgressSpinner from 'primevue/progressspinner'
import Button from 'primevue/button'

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
    const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'];
    return colors[val % colors.length];
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

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--p-content-border-color);
    border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--p-primary-color);
}
</style>