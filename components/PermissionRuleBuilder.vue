<template>
    <div class="flex min-w-0 flex-col gap-2 rounded-ui border border-content-border p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
                <Select
                    :model-value="node.gate"
                    :options="gateOptions"
                    option-label="label"
                    option-value="value"
                    class="w-40"
                    size="small"
                    @update:model-value="value => updateNode({ gate: value })"
                />
                <label class="flex items-center gap-2">
                    <Checkbox :model-value="node.negated === true" binary @update:model-value="value => updateNode({ negated: value })" />
                    <span>{{ $t('auth.permissionNot') }}</span>
                </label>
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <Button icon="pi pi-plus" :label="$t('auth.permissionAddCondition')" size="small" text @click="addCondition" />
                <Button icon="pi pi-sitemap" :label="$t('auth.permissionAddGroup')" size="small" text @click="addGroup" />
                <Button
                    v-if="depth > 0"
                    icon="pi pi-trash"
                    severity="danger"
                    text
                    rounded
                    :aria-label="$t('common.delete')"
                    @click="$emit('remove')"
                />
            </div>
        </div>

        <div class="flex min-w-0 flex-col gap-2" :class="depth > 0 ? 'pl-4' : ''">
            <template v-for="(child, index) in node.children" :key="child.id || index">
                <PermissionRuleBuilder
                    v-if="child.type === 'group'"
                    :model-value="child"
                    :depth="depth + 1"
                    :gate-options="gateOptions"
                    :subject-options="subjectOptions"
                    :type-id-options="typeIdOptions"
                    :condition-operator-options="conditionOperatorOptions"
                    :entity-options-loading="entityOptionsLoading"
                    :trait-options-for-condition="traitOptionsForCondition"
                    :condition-subject="conditionSubject"
                    :condition-type-id="conditionTypeId"
                    :condition-type-id-label="conditionTypeIdLabel"
                    :condition-trait="conditionTrait"
                    :patch-condition-subject="patchConditionSubject"
                    :patch-condition-type-id="patchConditionTypeId"
                    :patch-condition-trait="patchConditionTrait"
                    :uses-option-value-picker="usesOptionValuePicker"
                    :value-options-for-clause="valueOptionsForClause"
                    :clause-value-list="clauseValueList"
                    :create-condition="createCondition"
                    :create-group="createGroup"
                    @update:model-value="value => updateChild(index, value)"
                    @remove="removeChild(index)"
                />
                <div
                    v-else
                    class="flex min-w-0 flex-wrap items-center gap-2 rounded-ui border border-content-border p-2"
                >
                    <Select
                        :model-value="conditionSubject(child)"
                        :options="subjectOptions"
                        option-label="label"
                        option-value="value"
                        class="min-w-36 flex-1 sm:flex-none"
                        size="small"
                        @update:model-value="value => updateConditionSubject(index, value)"
                    />
                    <Select
                        v-if="conditionSubject(child) === 'related'"
                        :model-value="conditionTypeId(child)"
                        :options="typeIdOptions"
                        option-label="label"
                        option-value="value"
                        filter
                        class="min-w-40 flex-1 sm:flex-none"
                        size="small"
                        @update:model-value="value => updateConditionTypeId(index, value)"
                    />
                    <InputText
                        v-else-if="conditionSubject(child) === 'custom'"
                        :model-value="child.field"
                        :placeholder="$t('auth.permissionFieldPath')"
                        class="min-w-44 flex-[2_1_14rem]"
                        size="small"
                        @update:model-value="value => updateChild(index, { ...child, field: value })"
                    />
                    <InputText
                        v-else
                        :model-value="conditionTypeIdLabel(child)"
                        class="min-w-36 flex-1 sm:flex-none"
                        size="small"
                        disabled
                    />
                    <Select
                        v-if="conditionSubject(child) !== 'custom'"
                        :model-value="conditionTrait(child)"
                        :options="traitOptionsForCondition(child)"
                        option-label="label"
                        option-value="value"
                        class="min-w-44 flex-[2_1_14rem]"
                        size="small"
                        @update:model-value="value => updateConditionTrait(index, value)"
                    />
                    <InputText
                        v-else
                        :model-value="$t('auth.permissionTraits.path')"
                        class="min-w-24 flex-1 sm:flex-none"
                        size="small"
                        disabled
                    />
                    <Select
                        :model-value="child.operator"
                        :options="conditionOperatorOptions"
                        option-label="label"
                        option-value="value"
                        class="min-w-32 flex-1 sm:flex-none"
                        size="small"
                        @update:model-value="value => updateChild(index, { ...child, operator: value })"
                    />
                    <MultiSelect
                        v-if="usesOptionValuePicker(child) && child.operator === 'in'"
                        :model-value="clauseValueList(child)"
                        :options="valueOptionsForClause(child)"
                        option-label="label"
                        option-value="value"
                        filter
                        display="chip"
                        class="min-w-48 flex-[2_1_16rem]"
                        :loading="entityOptionsLoading"
                        :placeholder="$t('auth.permissionSelectValues')"
                        size="small"
                        @update:model-value="values => updateChild(index, { ...child, value: values.join(', ') })"
                    />
                    <Select
                        v-else-if="usesOptionValuePicker(child)"
                        :model-value="child.value"
                        :options="valueOptionsForClause(child)"
                        option-label="label"
                        option-value="value"
                        filter
                        show-clear
                        class="min-w-48 flex-[2_1_16rem]"
                        :loading="entityOptionsLoading"
                        :placeholder="$t('auth.permissionSelectValue')"
                        size="small"
                        @update:model-value="value => updateChild(index, { ...child, value })"
                    />
                    <InputText
                        v-else
                        :model-value="child.value"
                        :placeholder="child.operator === 'exists' ? $t('auth.permissionBooleanValue') : $t('auth.permissionConditionValue')"
                        class="min-w-48 flex-[2_1_16rem]"
                        size="small"
                        @update:model-value="value => updateChild(index, { ...child, value })"
                    />
                    <label class="flex items-center gap-2 whitespace-nowrap">
                        <Checkbox
                            :model-value="child.negated === true"
                            binary
                            @update:model-value="value => updateChild(index, { ...child, negated: value })"
                        />
                        <span>{{ $t('auth.permissionNot') }}</span>
                    </label>
                    <Button icon="pi pi-trash" severity="danger" text rounded :aria-label="$t('common.delete')" @click="removeChild(index)" />
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import MultiSelect from '~/components/shared/EntityMultiSelect.vue';
import Select from '~/components/shared/EntitySelect.vue';

defineOptions({ name: 'PermissionRuleBuilder' });

const props = defineProps({
    modelValue: { type: Object, default: null },
    depth: { type: Number, default: 0 },
    gateOptions: { type: Array, required: true },
    subjectOptions: { type: Array, required: true },
    typeIdOptions: { type: Array, required: true },
    conditionOperatorOptions: { type: Array, required: true },
    entityOptionsLoading: { type: Boolean, default: false },
    traitOptionsForCondition: { type: Function, required: true },
    conditionSubject: { type: Function, required: true },
    conditionTypeId: { type: Function, required: true },
    conditionTypeIdLabel: { type: Function, required: true },
    conditionTrait: { type: Function, required: true },
    patchConditionSubject: { type: Function, required: true },
    patchConditionTypeId: { type: Function, required: true },
    patchConditionTrait: { type: Function, required: true },
    usesOptionValuePicker: { type: Function, required: true },
    valueOptionsForClause: { type: Function, required: true },
    clauseValueList: { type: Function, required: true },
    createCondition: { type: Function, required: true },
    createGroup: { type: Function, required: true }
});

const emit = defineEmits(['update:modelValue', 'remove']);

const node = computed(() => props.modelValue || props.createGroup());

function updateNode(patch) {
    emit('update:modelValue', { ...node.value, ...patch });
}

function updateChild(index, child) {
    const children = [...(node.value.children || [])];
    children[index] = child;
    updateNode({ children });
}

function removeChild(index) {
    updateNode({ children: (node.value.children || []).filter((_, childIndex) => childIndex !== index) });
}

function addCondition() {
    updateNode({ children: [...(node.value.children || []), props.createCondition()] });
}

function addGroup() {
    updateNode({ children: [...(node.value.children || []), props.createGroup()] });
}

function updateConditionSubject(index, subject) {
    updateChild(index, props.patchConditionSubject(node.value.children[index], subject));
}

function updateConditionTypeId(index, typeId) {
    updateChild(index, props.patchConditionTypeId(node.value.children[index], typeId));
}

function updateConditionTrait(index, trait) {
    updateChild(index, props.patchConditionTrait(node.value.children[index], trait));
}
</script>
