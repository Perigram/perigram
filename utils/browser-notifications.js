export const NOTIFICATIONS_SETTING_KEY = 'cutkit.browserNotifications';

export function readNotificationSetting() {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(NOTIFICATIONS_SETTING_KEY) === 'enabled'
            && window.Notification?.permission === 'granted';
    } catch {
        return false;
    }
}

export function writeNotificationSetting(enabled) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(NOTIFICATIONS_SETTING_KEY, enabled ? 'enabled' : 'disabled');
    } catch {
        /* storage failures must not break the toggle */
    }
}

export function notificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
}
