<template>
    <StandardPage :title="$t('admin.dataModelReview.title')" :subtitle="$t('admin.dataModelReview.subtitle')">
        <template #actions>
            <Button icon="pi pi-refresh" :label="$t('common.update')" :loading="loading" @click="loadModels" />
            <Button icon="pi pi-download" :label="$t('admin.dataModelReview.exportPlan')" severity="secondary" @click="exportPlan" />
            <Button icon="pi pi-trash" :label="$t('common.reset')" severity="danger" outlined @click="resetAnnotations" />
        </template>

        <Panel :header="$t('admin.dataModelReview.contract.title')">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div class="flex flex-col gap-1">
                    <span>{{ $t('admin.dataModelReview.contract.entities') }}</span>
                    <strong>{{ manifestEntities.length }}</strong>
                </div>
                <div class="flex flex-col gap-1">
                    <span>{{ $t('admin.dataModelReview.collections') }}</span>
                    <strong>{{ models.length }}</strong>
                </div>
                <div class="flex flex-col gap-1">
                    <span>{{ $t('admin.dataModelReview.contract.missingInReview') }}</span>
                    <strong>{{ missingInReview.length }}</strong>
                </div>
                <div class="flex flex-col gap-1">
                    <span>{{ $t('admin.dataModelReview.contract.missingInContract') }}</span>
                    <strong>{{ missingInContract.length }}</strong>
                </div>
            </div>
            <Message v-if="contractIssues.length === 0" severity="success" class="mt-4">
                {{ $t('admin.dataModelReview.contract.ok') }}
            </Message>
            <Message v-for="issue in contractIssues" v-else :key="issue" severity="warn" class="mt-3">
                {{ issue }}
            </Message>
        </Panel>

        <div class="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6">
            <Panel :header="$t('admin.dataModelReview.filters')">
                    <div class="flex flex-col gap-4">
                        <InputText v-model="search" :placeholder="$t('common.search')" />
                        <Select v-model="selectedCollection" :options="collectionOptions" optionLabel="label" optionValue="value" />
                        <Select v-model="issueFilter" :options="issueOptions" optionLabel="label" optionValue="value" />

                        <div class="grid grid-cols-2 gap-3">
                            <div class="flex flex-col gap-1">
                                <span>{{ $t('admin.dataModelReview.collections') }}</span>
                                <strong>{{ models.length }}</strong>
                            </div>
                            <div class="flex flex-col gap-1">
                                <span>{{ $t('admin.dataModelReview.flagged') }}</span>
                                <strong>{{ flaggedFields.length }}</strong>
                            </div>
                            <div class="flex flex-col gap-1">
                                <span>{{ $t('admin.dataModelReview.annotated') }}</span>
                                <strong>{{ annotatedCount }}</strong>
                            </div>
                            <div class="flex flex-col gap-1">
                                <span>{{ $t('admin.dataModelReview.visible') }}</span>
                                <strong>{{ visibleModels.length }}</strong>
                            </div>
                        </div>
                    </div>
            </Panel>

            <div class="flex flex-col gap-6">
                <Message v-if="error" severity="error">{{ error }}</Message>
                <Message v-else-if="!loading && flaggedFields.length" severity="warn">
                    {{ $t('admin.dataModelReview.flaggedSummary', { count: flaggedFields.length }) }}
                </Message>

                <Panel v-for="model in visibleModels" :key="model.collection">
                    <template #header>
                        <div class="flex items-center justify-between gap-3">
                            <span>{{ model.collection }}</span>
                            <Tag :value="$t('admin.dataModelReview.issueCount', { count: model.issues?.length || 0 })" :severity="model.issues?.length ? 'warn' : 'success'" />
                        </div>
                    </template>
                    <small>{{ model.description }}</small>
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead>
                                    <tr>
                                        <th class="text-left py-2">{{ $t('admin.dataModelReview.field') }}</th>
                                        <th class="text-left py-2">{{ $t('common.type') }}</th>
                                        <th class="text-left py-2">{{ $t('admin.dataModelReview.source') }}</th>
                                        <th class="text-left py-2">{{ $t('admin.dataModelReview.flags') }}</th>
                                        <th class="text-left py-2">{{ $t('admin.dataModelReview.decision') }}</th>
                                        <th class="text-left py-2">{{ $t('common.note') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="field in filteredFields(model)" :key="field.name" class="border-t border-content-border align-top">
                                        <td class="py-3 pr-3 font-mono">{{ field.name }}</td>
                                        <td class="py-3 pr-3">{{ field.type }}</td>
                                        <td class="py-3 pr-3">{{ field.source || $t('admin.dataModelReview.standardSource') }}</td>
                                        <td class="py-3 pr-3">
                                            <div class="flex flex-wrap gap-2">
                                                <Tag
                                                    v-for="issue in field.issues || []"
                                                    :key="issue"
                                                    :value="issue"
                                                    severity="warn"
                                                    size="small"
                                                />
                                            </div>
                                        </td>
                                        <td class="py-3 pr-3 min-w-48">
                                            <div class="flex flex-col gap-2">
                                                <Select
                                                    v-model="annotationFor(model, field).decision"
                                                    :options="decisionOptions"
                                                    optionLabel="label"
                                                    optionValue="value"
                                                    class="w-full"
                                                />
                                                <InputText
                                                    v-if="annotationFor(model, field).decision === 'rename' || annotationFor(model, field).decision === 'move'"
                                                    v-model="annotationFor(model, field).target"
                                                    :placeholder="$t('admin.dataModelReview.targetPlaceholder')"
                                                />
                                            </div>
                                        </td>
                                        <td class="py-3 min-w-64">
                                            <Textarea v-model="annotationFor(model, field).note" rows="2" class="w-full" autoResize />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                </Panel>
            </div>
        </div>
    </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import StandardPage from '~/components/shared/StandardPage.vue';
import frameworkManifest from '~/framework.manifest.json';

definePageMeta({
    layout: 'app'
});

const STORAGE_KEY = 'cutkit:data-model-review:v1';
const SUPPORT_COLLECTIONS = new Set([
    'collection_name',
    'invitations',
    'material_options',
    'sessions',
    'status_events'
]);
const { t } = useI18n();

const models = ref([]);
const annotations = ref({});
const loading = ref(false);
const error = ref(null);
const search = ref('');
const selectedCollection = ref('all');
const issueFilter = ref('all');

const manifestEntities = frameworkManifest.entities || [];
const manifestCollections = computed(() => new Set(manifestEntities.map(entity => entity.collection)));
const contractModels = computed(() => models.value.filter(model => !SUPPORT_COLLECTIONS.has(model.collection)));
const reviewCollections = computed(() => new Set(contractModels.value.map(model => model.collection)));
const missingInReview = computed(() => manifestEntities
    .filter(entity => !reviewCollections.value.has(entity.collection))
    .map(entity => entity.collection));
const missingInContract = computed(() => contractModels.value
    .filter(model => !manifestCollections.value.has(model.collection))
    .map(model => model.collection));
const contractIssues = computed(() => [
    ...missingInReview.value.map(collection => t('admin.dataModelReview.contract.missingReviewItem', { collection })),
    ...missingInContract.value.map(collection => t('admin.dataModelReview.contract.missingContractItem', { collection })),
    ...(frameworkManifest.validations?.issues || []).map(issue => `${issue.area || 'manifest'}: ${issue.issue}`)
]);

const decisionOptions = computed(() => [
    { label: t('admin.dataModelReview.decisions.unchecked'), value: 'unchecked' },
    { label: t('admin.dataModelReview.decisions.keep'), value: 'keep' },
    { label: t('admin.dataModelReview.decisions.remove'), value: 'remove' },
    { label: t('admin.dataModelReview.decisions.rename'), value: 'rename' },
    { label: t('admin.dataModelReview.decisions.move'), value: 'move' },
    { label: t('admin.dataModelReview.decisions.investigate'), value: 'investigate' }
]);

const issueOptions = computed(() => [
    { label: t('admin.dataModelReview.issueFilters.all'), value: 'all' },
    { label: t('admin.dataModelReview.issueFilters.flagged'), value: 'flagged' },
    { label: t('admin.dataModelReview.issueFilters.annotated'), value: 'annotated' }
]);

const collectionOptions = computed(() => [
    { label: t('admin.dataModelReview.allCollections'), value: 'all' },
    ...models.value.map(model => ({ label: model.collection, value: model.collection }))
]);

const flaggedFields = computed(() => models.value.flatMap(model =>
    model.fields
        .filter(field => field.issues?.length)
        .map(field => ({ model, field }))
));

const annotatedCount = computed(() => Object.values(annotations.value)
    .filter(annotation => annotation.decision && annotation.decision !== 'unchecked')
    .length);

const visibleModels = computed(() => {
    const term = search.value.trim().toLowerCase();
    return models.value.filter(model => {
        if (selectedCollection.value !== 'all' && model.collection !== selectedCollection.value) return false;
        if (!term) return filteredFields(model).length > 0;
        return model.collection.toLowerCase().includes(term) || filteredFields(model).length > 0;
    });
});

function fieldKey(model, field) {
    return `${model.collection}:${field.name}`;
}

function annotationFor(model, field) {
    const key = fieldKey(model, field);
    if (!annotations.value[key]) {
        annotations.value[key] = {
            collection: model.collection,
            field: field.name,
            decision: 'unchecked',
            target: '',
            note: ''
        };
    }
    return annotations.value[key];
}

function filteredFields(model) {
    const term = search.value.trim().toLowerCase();
    return model.fields.filter(field => {
        const annotation = annotations.value[fieldKey(model, field)];
        if (issueFilter.value === 'flagged' && !field.issues?.length) return false;
        if (issueFilter.value === 'annotated' && (!annotation || annotation.decision === 'unchecked')) return false;
        if (!term) return true;
        return field.name.toLowerCase().includes(term)
            || field.type.toLowerCase().includes(term)
            || field.description.toLowerCase().includes(term)
            || model.collection.toLowerCase().includes(term);
    });
}

async function loadModels() {
    loading.value = true;
    error.value = null;
    try {
        const result = await $fetch('/api/debug/data-models');
        if (!result.success) throw new Error(result.error || t('admin.dataModelReview.loadFailed'));
        models.value = result.models || [];
        for (const model of models.value) {
            for (const field of model.fields) annotationFor(model, field);
        }
    } catch (err) {
        error.value = err.data?.message || err.message || t('admin.dataModelReview.loadFailed');
    } finally {
        loading.value = false;
    }
}

function buildPlanMarkdown() {
    const rows = Object.values(annotations.value)
        .filter(annotation => annotation.decision && annotation.decision !== 'unchecked');

    const lines = [
        t('admin.dataModelReview.planTitle'),
        '',
        `${t('admin.dataModelReview.generated')}: ${new Date().toISOString()}`,
        '',
        `| ${t('admin.dataModelReview.collections')} | ${t('admin.dataModelReview.field')} | ${t('admin.dataModelReview.decision')} | ${t('admin.dataModelReview.target')} | ${t('common.note')} |`,
        '|---|---|---|---|---|'
    ];

    for (const row of rows) {
        lines.push(`| ${row.collection} | \`${row.field}\` | ${row.decision} | ${row.target || ''} | ${(row.note || '').replace(/\n/g, ' ')} |`);
    }

    return lines.join('\n');
}

function exportPlan() {
    const blob = new Blob([buildPlanMarkdown()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'data-model-refactor-plan.md';
    link.click();
    URL.revokeObjectURL(url);
}

function resetAnnotations() {
    annotations.value = {};
    localStorage.removeItem(STORAGE_KEY);
    for (const model of models.value) {
        for (const field of model.fields) annotationFor(model, field);
    }
}

onMounted(async () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            annotations.value = JSON.parse(saved);
        } catch {
            annotations.value = {};
        }
    }
    await loadModels();
});

watch(annotations, value => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}, { deep: true });
</script>
