import { ref, computed } from 'vue';
import {
    notificationPermission,
    readNotificationSetting,
    writeNotificationSetting
} from '~/utils/browser-notifications.js';

export const useBrowserNotifications = () => {
    const permission = ref(notificationPermission());
    const enabled = ref(readNotificationSetting());
    const busy = ref(false);
    const pushAvailable = ref(false);

    const canEnable = computed(() => permission.value === 'granted' || permission.value === 'default');

    async function fetchPushConfig() {
        const config = await $fetch('/api/notifications/config').catch(() => null);
        pushAvailable.value = Boolean(config?.enabled && config.publicKey);
        return config;
    }

    function refreshPushConfig() {
        return fetchPushConfig();
    }

    async function subscribePush() {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
        const config = await fetchPushConfig();
        if (!config?.enabled || !config.publicKey) return;
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
            await $fetch('/api/notifications/subscriptions', {
                method: 'POST',
                body: { subscription: existing.toJSON() }
            }).catch(() => null);
            return;
        }
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: config.publicKey
        });
        await $fetch('/api/notifications/subscriptions', {
            method: 'POST',
            body: { subscription: subscription.toJSON() }
        }).catch(() => null);
    }

    async function unsubscribePush() {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        await $fetch(`/api/notifications/subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
            method: 'DELETE'
        }).catch(() => null);
        await subscription.unsubscribe().catch(() => null);
    }

    async function enable() {
        if (!canEnable.value || busy.value) return false;
        busy.value = true;
        try {
            if (permission.value === 'default') {
                permission.value = await window.Notification.requestPermission();
            }
            if (permission.value !== 'granted') return false;
            writeNotificationSetting(true);
            enabled.value = true;
            await subscribePush();
            return true;
        } finally {
            busy.value = false;
        }
    }

    async function disable() {
        busy.value = true;
        try {
            writeNotificationSetting(false);
            enabled.value = false;
            await unsubscribePush();
        } finally {
            busy.value = false;
        }
    }

    function show({ title, body = '', tag = '', requireInteraction = false, data = {}, onclick = null }) {
        if (!enabled.value || permission.value !== 'granted') return null;
        try {
            const notification = new window.Notification(title, {
                body,
                tag,
                requireInteraction,
                data,
                icon: '/favicon/pwa-192x192.png'
            });
            notification.onclick = (event) => {
                event.preventDefault();
                window.focus();
                if (data.url) window.location.assign(data.url);
                notification.close();
                if (onclick) onclick();
            };
            return notification;
        } catch {
            return null;
        }
    }

    return {
        permission,
        enabled,
        busy,
        canEnable,
        pushAvailable,
        refreshPushConfig,
        enable,
        disable,
        show
    };
};
