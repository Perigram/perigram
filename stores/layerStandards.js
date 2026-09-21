import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';

// Layer-standard catalog accessor over the generic instance transport
// (SPEC §21 tech-drawing pack). Public API is the legacy editor contract:
// standards as wire DTOs (`data.code/category/...`), `getByCode`/
// `getByCategory` lookups, and org pen overrides. Resolution is
// shadow-by-code (SPEC §3 system instances): an org-authored standard with
// the same code shadows the system row; the effective default pen is the
// shadow's `defaultPen` relation, else the system row's. Overrides
// create/update the org shadow — system rows are never mutated.
const TYPE_KEY = 'layer-standard';

const standardCode = (standard) => standard?.data?.code || standard?.code || null;
const standardCategory = (standard) => standard?.data?.category || standard?.category || null;

const withProjectedPen = (dto) => ({
    ...dto,
    data: {
        ...(dto.data || {}),
        defaultPenId: dto.relations?.defaultPen?.id || null,
        orgPenId: dto.relations?.defaultPen?.id || null
    },
    orgPenId: dto.relations?.defaultPen?.id || null
});

export const useLayerStandardsStore = defineStore('layerStandards', () => {
    const authStore = useAuthStore();
    const instances = useInstancesStore();
    const loading = ref(false);
    const error = ref(null);
    let pending = null;
    let loadedOrg = null;

    const rawStandards = computed(() => Object.values(instances.records[TYPE_KEY] || {})
        .map(entry => entry.dto)
        .filter(Boolean));

    // Shadow-by-code: org rows win over system rows with the same code.
    const standards = computed(() => {
        const byCode = new Map();
        for (const dto of rawStandards.value) {
            const code = standardCode(dto);
            if (!code) continue;
            const isOrg = dto.lineage?.organizationId != null;
            const existing = byCode.get(code);
            if (!existing || (isOrg && existing.lineage?.organizationId == null)) {
                byCode.set(code, dto);
            }
        }
        return [...byCode.values()].map(withProjectedPen);
    });

    async function fetchStandards({ force = false } = {}) {
        if (pending) return pending;
        loading.value = true;
        error.value = null;
        pending = instances.listInstances(TYPE_KEY, {}, { force, silent: true })
            .then(items => items || [])
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

    // Org switch starts a fresh bucket: shadow resolution must never mix
    // two orgs' rows (system rows ride every view).
    async function ensureStandards() {
        const org = authStore.user?.organizationId || null;
        if (loadedOrg !== org) {
            instances.records[TYPE_KEY] = {};
            loadedOrg = org;
            return fetchStandards({ force: true });
        }
        if (rawStandards.value.length) return standards.value;
        return fetchStandards();
    }

    function getByCategory(category) {
        return standards.value.filter(s => standardCategory(s) === category);
    }

    function getByCode(code) {
        return standards.value.find(s => standardCode(s) === code);
    }

    function orgShadowFor(standardId) {
        const base = rawStandards.value.find(dto => String(dto._id) === String(standardId));
        if (!base) return null;
        const code = standardCode(base);
        if (!code) return null;
        if (base.lineage?.organizationId != null) return base;
        return rawStandards.value.find(dto => (
            dto.lineage?.organizationId != null && standardCode(dto) === code
        )) || null;
    }

    async function setOrgPenOverride(standardId, penId) {
        const base = rawStandards.value.find(dto => String(dto._id) === String(standardId));
        if (!base) throw new Error('Unknown layer standard');
        const shadow = orgShadowFor(standardId);
        const relation = { relations: { defaultPen: penId ? { type: 'pen-template', id: penId } : null } };
        if (shadow) {
            await instances.updateInstance(TYPE_KEY, shadow._id, relation, { typeId: TYPE_KEY });
            return;
        }
        // Seed the org shadow from the system row's row data.
        await instances.createInstance(TYPE_KEY, {
            identity: { name: base.identity?.name || standardCode(base) },
            data: { ...(base.data || {}) },
            ...relation
        }, { typeId: TYPE_KEY });
    }

    async function removeOrgPenOverride(standardId) {
        await setOrgPenOverride(standardId, null);
    }

    return {
        standards,
        loading,
        error,
        fetchStandards,
        ensureStandards,
        getByCategory,
        getByCode,
        setOrgPenOverride,
        removeOrgPenOverride
    };
});
