import { createError } from 'h3';

/**
 * Knowledge base capability module over the self-hosted OpenKnowledge web
 * editor container. The app owns admission; the container owns the service
 * (see ./README.md for the license boundary — OpenKnowledge is GPL-3.0+
 * and stays a separate network service reached only over HTTP).
 */

const config = () => ({
    // Network-internal OpenKnowledge base: inside compose the app reaches
    // the openknowledge service through its compose hostname.
    internalUrl: process.env.OPENKNOWLEDGE_INTERNAL_URL || 'http://openknowledge:4310'
});

export const publicConfig = () => ({ enabled: Boolean(config().internalUrl) });

/**
 * The service is org-wide, like support chat: admins and every
 * organization member are admitted. Org affiliation mirrors
 * `resolveProcessAuth`: the user's explicit current organization, else
 * their first membership — most user records carry no top-level
 * `organizationId`. No process feature grant applies; capability toggles
 * are not part of the app's onboarding flow.
 */
export function authorizeKnowledge(auth) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId;
    if (!auth.isAdmin && !organizationId) {
        throw createError({ statusCode: 403, message: 'Forbidden' });
    }
    return { admitted: true };
}

/**
 * Admission snapshot for UI gating. Never throws for denied users — the
 * sidebar hides the entry instead of erroring. `enabled` reports
 * configuration, not container health; a down container surfaces as a
 * proxy 502.
 */
export function describeService(auth) {
    if (!publicConfig().enabled) return { enabled: false, admitted: false };
    try {
        authorizeKnowledge(auth);
    } catch {
        return { enabled: true, admitted: false };
    }
    // The trailing slash matters: OpenKnowledge emits relative asset
    // paths, so the proxied entry must resolve ./assets against the
    // proxy prefix.
    return { enabled: true, admitted: true, url: '/api/knowledge/proxy/' };
}

/**
 * Maps a proxied subpath (plus query string) onto the container base.
 */
export function proxyTarget(path = '') {
    const base = config().internalUrl.replace(/\/+$/, '');
    return `${base}/${String(path).replace(/^\/+/, '')}`;
}
