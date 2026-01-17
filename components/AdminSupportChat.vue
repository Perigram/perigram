<template>
    <div class="chat">
        <div class="chat__header header">
            <h2 class="header__title">{{ $t('admin.supportChat') }}</h2>
            <span class="header__id">{{ $t('admin.userId') }}: {{ userId }}</span>
        </div>
        <div ref="messagesContainer" class="chat__messages messages">
            <div v-if="loading" class="chat__loading loading">
                <ProgressSpinner />
                <p>{{ $t('admin.loadingMessages') }}</p>
            </div>
            <div v-else-if="messages.length === 0" class="chat__empty empty">
                <p class="empty__text">{{ $t('admin.noMessages') }}</p>
            </div>
            <div 
                class="message-list" 
                v-else
            >
                <template 
                    :key="message._id"
                    v-for="message in messagesList"
                >
                    <div v-if="message.day" class="message-list__day day">
                            <span class="day__label">
                                {{ message.day }}
                            </span>
                    </div>
                    <div 
                        class="message-list__item message"
                        :class="[message.sender === 'support' ? '' : 'message--is-user']"
                    >
                        <p>{{ message.message }}</p>
                        <span class="message__time">{{ formatTime(message.timestamp) }}</span>
                    </div>
                </template>
            </div>
        </div>
        <div class="chat__footer footer">
            <Button
                icon="pi pi-arrow-left"
                @click="$emit('back')"
                class="footer__back" 
                text
                rounded
            />
            <Textarea 
                :placeholder="$t('admin.typeMessage')" 
                class="footer__input" 
                v-model="newMessage"
                @keydown="handleKeyDown" 
                :disabled="!isConnected"
                rows="1"
                autoResize
            />
            <Button 
                :disabled="!newMessage.trim() || !isConnected" 
                @click="sendMessage"
                :label="$t('admin.send')" 
                class="footer__btn" 
            />
        </div>

        <div v-if="error" class="error-message">
            <p>{{ error }}</p>
            <button @click="connectToChat">{{ $t('admin.retry') }}</button>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import ProgressSpinner from 'primevue/progressspinner';

const { t } = useI18n();
const props = defineProps({
    userId: {
        type: String,
        required: true,
    },
});

const messages = ref([])
const newMessage = ref('')
const loading = ref(true)
const error = ref(null)
const isConnected = ref(false)
const messagesContainer = ref(null)
let eventSource = null
const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendMessage()
    }
}

const formatTime = (timestamp, withoutTime) => {
    const date = new Date(timestamp)
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return withoutTime ? date.toLocaleDateString() : `${time}`
}
const messagesList = computed(() => {
    const usedDates = []
    const getDay = (timestamp) => {
        const date = new Date(timestamp)
        if(usedDates.includes(formatTime(date, true))) {
            return
        }
        usedDates.push(formatTime(date, true))
        return formatTime(date, true)
    }
    return messages.value.map(message => {
        return {
            ...message,
            day: getDay(message.timestamp)
        }
    })
})
const connectToChat = () => {
    try {
        loading.value = true
        error.value = null
        isConnected.value = false
        messages.value = []

        eventSource = new EventSource(`/api/support/admin/${props.userId}`)

        eventSource.onopen = () => {
            isConnected.value = true
        }

        eventSource.onmessage = async (event) => {
            const data = JSON.parse(event.data)
            switch (data.type) {
                case 'initial':
                    messages.value = data.data
                    loading.value = false
                    await nextTick()
                    scrollToBottom()
                    break
                case 'newMessages':
                    messages.value.push(...data.data)
                    await nextTick()
                    scrollToBottom()
                    break
                case 'heartbeat':
                    break
            }
        }

        eventSource.onerror = (error) => {
            console.error('EventSource error:', error)
            isConnected.value = false
            error.value = t('admin.connectionFailed')
            loading.value = false
        }
    } catch (err) {
        console.error('Error connecting to chat:', err)
        error.value = t('admin.failedToConnect')
        loading.value = false
    }

    scrollToBottom()
}

const sendMessage = async () => {
    if (!newMessage.value.trim() || !isConnected.value) return

    try {
        const messageData = {
            message: newMessage.value,
        }

        await $fetch(`/api/support/admin/${props.userId}`, {
            method: 'POST',
            body: messageData
        })

        newMessage.value = ''

        await nextTick()
        scrollToBottom()
    } catch (error) {
        console.error('Error sending message:', error)
        error.value = t('admin.failedToSend')
    }
}

const scrollToBottom = async () => {
    await nextTick()

    if (messagesContainer.value) {
        const element = messagesContainer.value
        element.scrollTo({
            top: element.scrollHeight,
        })
    }
}


onMounted(() => {
    if (props.userId) {
        connectToChat()
    }
})

onUnmounted(() => {
    if (eventSource) {
        eventSource.close()
    }
})
</script>

<style lang="scss" scoped>
.chat {
    display: flex;
    flex-direction: column;

    &__header {
        margin-bottom: 16px;
    }

    &__footer {
        margin-top: 16px;
    }

    &__empty,
    &__messages {
        width: 100%;
        height: 100%;
    }

    &__loading {
        width: 100%;
        height: 100%;
    }
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;

    &__id {
        color: var(--label-primary);
    }
    &__title {
        margin-right: 20px;
    }
}

.message-list {
    display: flex;
    flex-direction: column;

    &__day {
        margin-bottom: 20px;
        margin-top: 10px;
    }
    &__item {
        max-width: 70%;

        &:not(:last-child) {
            margin-bottom: 10px;
        }
    }
}

.message {
    background-color: var(--fill-tertiary);
    border-radius: 8px 0 8px 8px;
    color: var(--label-secondary);
    font-size: 14px;
    line-height: 1.4;
    padding: 6px 8px;
    margin-left: auto;

    &--is-user {
        background-color: var(--fill-secondary);
        border-radius: 0 8px 8px;
        color: var(--label-primary);
        text-align: left;
        margin-right: auto;
        margin-left: initial;
    }

    &__time {
        color: var(--label-tertiary);
        font-size: 12px;
        margin-top: 8px;
        display: block;
    }
}

.day {
    position: relative;
    display: flex;
    justify-content: center;
    justify-content: center;

    &__label {
        margin-left: auto;
        margin-right: auto;
        background-color: var(--fill-tertiary);
        border-radius: 8px;
        padding: 6px 8px;
        color: var(--label-primary);
    }
    &::before,
    &::after {
        content: '';
        position: absolute;
        left: 2%;
        right: 2%;
        height: 1px;
        border: dashed 1px var(--fill-tertiary);
    }
    &::before {
        bottom: calc(100% + 4px);
    }
    &::after {
        top: calc(100% + 4px);
    }
}

.loading {
    flex-direction: column;
    text-align: center;
    display: flex;
    padding: 16px;
    justify-content: center;
    align-items: center;
    color: var(--label-secondary);

    &__loader {
        margin-bottom: 60px;
    }
}

.empty {
    text-align: center;
    display: flex;
    padding: 16px;
    justify-content: center;
    align-items: center;
    color: var(--label-secondary);
}

.footer {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;

    &__input {
        flex: 1;
    }

    &__btn {
        margin-left: 10px;
    }

    &__back {
        margin-right: 10px;

        @media (min-width: 567px) {
            display: none;
        }
    }
}
</style>