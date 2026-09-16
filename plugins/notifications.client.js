import { watch } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useConnections } from '~/composables/useConnections'
import { useBrowserNotifications } from '~/composables/useBrowserNotifications'
import { playPing, playRingLoop } from '~/utils/notification-sounds.js'

const RING_TIMEOUT_MS = 45000

export default defineNuxtPlugin((nuxtApp) => {
    if (typeof window === 'undefined') return
    const authStore = useAuthStore()
    const notifications = useBrowserNotifications()
    const { $i18n } = nuxtApp
    const t = (key, params = {}) => ($i18n?.t ? $i18n.t(key, params) : key)

    let stopRing = null

    const stopRinging = () => {
        if (stopRing) {
            stopRing()
            stopRing = null
        }
    }

    const isOnChats = () => String(nuxtApp.$router?.currentRoute?.value?.path || '').startsWith('/chats')
    const isHidden = () => document.visibilityState !== 'visible'

    const notifyMessage = (payload) => {
        if (isHidden() || !isOnChats()) {
            playPing()
            notifications.show({
                title: t('notifications.messageTitle'),
                body: t('notifications.messageBody'),
                tag: `message:${payload.conversationKey}`,
                data: { url: '/chats' }
            })
        }
    }

    const notifyCall = (payload) => {
        if (isOnChats()) return
        stopRinging()
        stopRing = playRingLoop()
        const notification = notifications.show({
            title: payload.fromName || t('notifications.callTitle'),
            body: t('notifications.callBody'),
            tag: `call:${payload.room}`,
            requireInteraction: true,
            data: { url: '/chats' }
        })
        if (notification) {
            notification.onclose = stopRinging
            notification.onclick = () => stopRinging()
        }
        setTimeout(stopRinging, RING_TIMEOUT_MS)
    }

    const notifyEntityChanged = (payload) => {
        const data = payload?.data || {}
        const reason = String(data.reason || '')
        if (!reason.includes('status')) return
        if (!isHidden()) return
        notifications.show({
            title: t('notifications.statusTitle'),
            body: `${data.type} · ${String(data.id || '').slice(-8)}`,
            tag: `entity:${data.type}:${data.id}`,
            data: {}
        })
    }

    const handleUserEvent = (payload) => {
        if (!payload?.type) return
        if (payload.type === 'support.inbox') notifyMessage(payload)
        if (payload.type === 'call.invite') notifyCall(payload)
        if (payload.type === 'call.activity' && stopRing && payload.event !== 'room_started') {
            stopRinging()
        }
    }

    const handleOrgEvent = (payload) => {
        if (payload?.type === 'entityChanged') notifyEntityChanged(payload)
    }

    watch(() => authStore.userIsSet, (isSet) => {
        if (!isSet) return
        const connections = useConnections()
        connections.subscribe(`user:${authStore.user.userId}`, handleUserEvent)
        if (authStore.user.organizationId) {
            connections.subscribe(`org:${authStore.user.organizationId}`, handleOrgEvent)
        }
    }, { immediate: true })
})
