<template>
    <div class="flex h-support-chat-admin min-h-support-chat border border-content-border rounded-ui overflow-hidden shadow-card bg-content">
        <AdminSupportChatList
            class="w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-content-border"
            :class="{'hidden md:flex': selectedUserId, 'flex': !selectedUserId}"
            @select-chat="handleChatSelection"
        />
        
        <div class="flex-1 min-w-0 bg-content">
            <AdminSupportChat 
                v-if="selectedUserId"
                :key="selectedUserId"
                :userId="selectedUserId" 
                @back="handleBack"
                class="h-full" 
            />
            <div 
                v-else
                class="hidden md:flex h-full items-center justify-center p-8 text-center"
            >
                <div class="flex flex-col items-center gap-4 opacity-40">
                    <i class="pi pi-comments text-6xl"></i>
                    <p class="text-lg font-bold uppercase tracking-widest m-0">{{ $t('admin.selectChatPrompt') }}</p>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue'

definePageMeta({
    layout: "app",
    middleware: "auth",
});

const selectedUserId = ref(null)

const handleChatSelection = (userId) => {
    selectedUserId.value = userId
}

const handleBack = () => {
    selectedUserId.value = null
}
</script>

<style scoped>
</style>
