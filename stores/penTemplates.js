import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';

// Pen-template catalog accessor over the generic instance transport
// (SPEC §21 tech-drawing pack). The public API is the legacy editor
// contract: pens as wire DTOs with `data.stroke`, system/user grouping by
// tenancy (system rows are the null-org catalog; user grouping degrades to
// created-in-org pens — org visibility replaces personal pens).
const TYPE_KEY = 'pen-template';

export const usePenTemplatesStore = defineStore('penTemplates', () => {
    const authStore = useAuthStore();
    const instances = useInstancesStore();
    const loading = ref(false);
    const error = ref(null);
    let pending = null;
    let loadedOrg = null;

    const pens = computed(() => Object.values(instances.records[TYPE_KEY] || {})
        .map(entry => entry.dto)
        .filter(Boolean)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));

    const systemPens = computed(() => pens.value.filter(pen => pen.lineage?.organizationId == null));
    const userPens = computed(() => pens.value.filter(pen => pen.lineage?.organizationId != null));

    async function fetchPens({ force = false } = {}) {
        if (pending) return pending;
        loading.value = true;
        error.value = null;
        pending = instances.listInstances(TYPE_KEY, {}, { force, silent: true })
            .catch(err => {
                error.value = err?.data?.message || err?.message || String(err);
                return [];
            })
            .finally(() => {
                pending = null;
                loading.value = false;
            });
        return pending;
    }

    // The instance cache is not org-scoped: an org switch starts a fresh
    // bucket so per-org pens never mix (system rows ride every view).
    async function ensurePens() {
        const org = authStore.user?.organizationId || null;
        if (loadedOrg !== org) {
            instances.records[TYPE_KEY] = {};
            loadedOrg = org;
            return fetchPens({ force: true });
        }
        if (pens.value.length) return pens.value;
        return fetchPens();
    }

    // Editor form shape ({name, stroke}) maps onto the §3 rows directly.
    function toWire(penData = {}) {
        return {
            ...(penData.name != null ? { name: penData.name } : {}),
            ...(penData.stroke != null ? { fields: { stroke: penData.stroke } } : {})
        };
    }

    async function createPen(penData) {
        try {
            return await instances.createInstance(TYPE_KEY, toWire(penData), { typeId: TYPE_KEY });
        } catch (err) {
            error.value = err?.data?.message || err?.message || String(err);
            throw err;
        }
    }

    async function updatePen(id, updates) {
        try {
            return await instances.updateInstance(TYPE_KEY, id, toWire(updates), { typeId: TYPE_KEY });
        } catch (err) {
            error.value = err?.data?.message || err?.message || String(err);
            throw err;
        }
    }

    async function deletePen(id) {
        try {
            await instances.removeInstance(TYPE_KEY, id, { typeId: TYPE_KEY });
        } catch (err) {
            error.value = err?.data?.message || err?.message || String(err);
            throw err;
        }
    }

    return {
        pens,
        loading,
        error,
        systemPens,
        userPens,
        fetchPens,
        ensurePens,
        createPen,
        updatePen,
        deletePen
    };
});
