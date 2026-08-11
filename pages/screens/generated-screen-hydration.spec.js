import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../../stores/auth.js';
import { createPinia, setActivePinia } from 'pinia';

function scopeFromQuery(query = {}) {
    return Object.fromEntries(Object.entries(query)
        .filter(([key]) => key === 'entityId' || key.endsWith('Id'))
        .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
        .filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function synthesizedDetailScreen(authStore, key = '') {
    if (!String(key).endsWith('_detail')) return null;
    const baseKey = String(key).slice(0, -'_detail'.length);
    const base = authStore.screenManifest.find(item => item.screenKey === baseKey);
    if (!base?.entityType) return null;
    const sourceId = base.sources?.[0]?.id || base.entityType;
    const required = base.required || base.sources?.[0]?.required || null;
    return {
        ...base,
        id: `${base.id || baseKey}_detail`,
        screenKey: key,
        route: `/screens/${encodeURIComponent(key)}`,
        template: 'entityDetail',
        placement: 'detail',
        sources: [{
            id: sourceId,
            entityType: base.entityType,
            mode: 'single',
            required,
            identifier: '$screen.scope.entityId'
        }],
        regions: [{
            id: 'main',
            slot: 'main',
            sourceId,
            surface: 'detail',
            actions: base.actions || []
        }],
        actions: base.actions || []
    };
}

describe('generated screen hydration', () => {
    it('merges query scope into the compiled screen contract', () => {
        const merged = {
            ...{ screenKey: 'auto_project_detail' },
            scope: {
                ...{},
                ...scopeFromQuery({ entityId: 'proj-1', projectId: 'proj-1', tab: 'ignored' })
            }
        };
        expect(merged.scope.entityId).toBe('proj-1');
        expect(merged.scope.projectId).toBe('proj-1');
        expect(merged.scope.tab).toBeUndefined();
    });

    it('resolves a synthesized detail screen from the manifest without refetching', () => {
        setActivePinia(createPinia());
        const authStore = useAuthStore();
        authStore.user = {
            screens: [{
                screenKey: 'auto_queue',
                id: 'auto_queue',
                route: '/screens/auto_queue',
                template: 'entityList',
                entityType: 'queue',
                placement: 'hub',
                sources: [{ id: 'queue-source', entityType: 'queue', mode: 'list' }],
                regions: [],
                actions: []
            }]
        };

        const detail = synthesizedDetailScreen(authStore, 'auto_queue_detail');
        expect(detail).not.toBeNull();
        expect(detail.template).toBe('entityDetail');
        expect(detail.sources[0].mode).toBe('single');
        expect(detail.sources[0].identifier).toBe('$screen.scope.entityId');
    });

    it('does not synthesize a detail screen when the base is missing', () => {
        setActivePinia(createPinia());
        const authStore = useAuthStore();
        authStore.user = { screens: [] };
        expect(synthesizedDetailScreen(authStore, 'missing_detail')).toBeNull();
        expect(synthesizedDetailScreen(authStore, 'missing')).toBeNull();
    });
});
