import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth.js';
import { useLayerStandardsStore } from './layerStandards.js';
import { usePenTemplatesStore } from './penTemplates.js';

describe('drawing catalogue stores', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('coalesces and caches layer-standard loads within the active auth scope', async () => {
        const authStore = useAuthStore();
        authStore.user = { userId: 'user-1', organizationId: 'org-1' };
        let resolveRequest;
        const request = vi.fn(() => new Promise(resolve => { resolveRequest = resolve; }));
        vi.stubGlobal('$fetch', request);
        const store = useLayerStandardsStore();

        const first = store.ensureStandards();
        const second = store.ensureStandards();
        resolveRequest([{ _id: 'standard-1', data: { code: 'cut.outer' } }]);

        await expect(Promise.all([first, second])).resolves.toEqual([
            [expect.objectContaining({ _id: 'standard-1' })],
            [expect.objectContaining({ _id: 'standard-1' })]
        ]);
        await store.ensureStandards();
        expect(request).toHaveBeenCalledTimes(1);

        authStore.user = { userId: 'user-1', organizationId: 'org-2' };
        request.mockResolvedValueOnce([{ _id: 'standard-2', data: { code: 'fold.route' } }]);
        await store.ensureStandards();

        expect(request).toHaveBeenCalledTimes(2);
        expect(store.standards).toEqual([expect.objectContaining({ _id: 'standard-2' })]);
    });

    it('coalesces and caches pen loads within the active auth scope', async () => {
        const authStore = useAuthStore();
        authStore.user = { userId: 'user-1', organizationId: 'org-1' };
        let resolveRequest;
        const request = vi.fn(() => new Promise(resolve => { resolveRequest = resolve; }));
        vi.stubGlobal('$fetch', request);
        const store = usePenTemplatesStore();

        const first = store.ensurePens();
        const second = store.ensurePens();
        resolveRequest([{ _id: 'pen-1', data: { stroke: { color: '#000000' } } }]);

        await expect(Promise.all([first, second])).resolves.toEqual([
            [expect.objectContaining({ _id: 'pen-1' })],
            [expect.objectContaining({ _id: 'pen-1' })]
        ]);
        await store.ensurePens();
        expect(request).toHaveBeenCalledTimes(1);

        // Same org, different user: pens are org-scoped now (personal pens
        // became org pens), so no refetch and the catalogue is stable.
        authStore.user = { userId: 'user-2', organizationId: 'org-1' };
        await store.ensurePens();

        expect(request).toHaveBeenCalledTimes(1);
        expect(store.pens).toEqual([expect.objectContaining({ _id: 'pen-1' })]);

        // Org switch starts a fresh bucket.
        authStore.user = { userId: 'user-2', organizationId: 'org-2' };
        request.mockResolvedValueOnce([{ _id: 'pen-2', data: { stroke: { color: '#ffffff' } } }]);
        await store.ensurePens();

        expect(request).toHaveBeenCalledTimes(2);
        expect(store.pens).toEqual([expect.objectContaining({ _id: 'pen-2' })]);
    });

    it('retries catalogue ensures after a failed load', async () => {
        const authStore = useAuthStore();
        authStore.user = { userId: 'user-1', organizationId: 'org-1' };
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const request = vi.fn()
            .mockRejectedValueOnce(new Error('standards unavailable'))
            .mockResolvedValueOnce([{ _id: 'standard-1', data: { code: 'cut.outer' } }])
            .mockRejectedValueOnce(new Error('pens unavailable'))
            .mockResolvedValueOnce([{ _id: 'pen-1' }]);
        vi.stubGlobal('$fetch', request);

        const standardsStore = useLayerStandardsStore();
        await standardsStore.ensureStandards();
        await standardsStore.ensureStandards();
        const pensStore = usePenTemplatesStore();
        await pensStore.ensurePens();
        await pensStore.ensurePens();

        expect(request).toHaveBeenCalledTimes(4);
        expect(standardsStore.standards).toEqual([expect.objectContaining({ _id: 'standard-1' })]);
        expect(pensStore.pens).toEqual([expect.objectContaining({ _id: 'pen-1' })]);
    });
});
