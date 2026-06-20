<template>
    <div class="flex min-w-0 flex-col gap-2 rounded-ui border border-content-border p-3">
        <div class="flex flex-wrap items-center gap-2">
            <Select
                :model-value="node.gate"
                :options="gateOptions"
                option-label="label"
                option-value="value"
                class="w-40"
                @update:model-value="value => updateNode({ gate: value })"
            />
            <label class="flex items-center gap-2">
                <Checkbox :model-value="node.negated === true" binary @update:model-value="value => updateNode({ negated: value })" />
                <span>{{ $t('auth.permissionNot') }}</span>
            </label>
            <Button icon="pi pi-plus" :label="$t('auth.permissionAddCondition')" size="small" outlined @click="addCondition" />
            <Button icon="pi pi-sitemap" :label="$t('auth.permissionAddGroup')" size="small" outlined @click="addGroup" />
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

        <div class="flex min-w-0 flex-col gap-2" :class="depth > 0 ? 'pl-4' : ''">
            <template v-for="(child, index) in node.children" :key="child.id || index">
                <PermissionRuleBuilder
                    v-if="child.type === 'group'"
                    :model-value="child"
                    :depth="depth + 1"
                    :gate-options="gateOptions"
                    :subject-options="subjectOptions"
                    :entity-type-options="entityTypeOptions"
                    :condition-operator-options="conditionOperatorOptions"
                    :entity-options-loading="entityOptionsLoading"
                    :trait-options-for-condition="traitOptionsForCondition"
                    :condition-subject="conditionSubject"
                    :condition-entity-type="conditionEntityType"
                    :condition-entity-type-label="conditionEntityTypeLabel"
                    :condition-trait="conditionTrait"
                    :patch-condition-subject="patchConditionSubject"
                    :patch-condition-entity-type="patchConditionEntityType"
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
                    class="grid grid-cols-1 gap-2 rounded-ui border border-content-border p-2 xl:grid-cols-[11rem_12rem_10rem_10rem_minmax(14rem,1fr)_6rem_auto]"
                >
                    <Select
                        :model-value="conditionSubject(child)"
                        :options="subjectOptions"
                        option-label="label"
                        option-value="value"
                        @update:model-value="value => updateConditionSubject(index, value)"
                    />
                    <Select
                        v-if="conditionSubject(child) === 'related'"
                        :model-value="conditionEntityType(child)"
                        :options="entityTypeOptions"
                        option-label="label"
                        option-value="value"
                        filter
                        @update:model-value="value => updateConditionEntityType(index, value)"
                    />
                    <InputText
                        v-else-if="conditionSubject(child) === 'custom'"
                        :model-value="child.field"
                        :placeholder="$t('auth.permissionFieldPath')"
                        @update:model-value="value => updateChild(index, { ...child, field: value })"
                    />
                    <InputText
                        v-else
                        :model-value="conditionEntityTypeLabel(child)"
                        disabled
                    />
                    <Select
                        v-if="conditionSubject(child) !== 'custom'"
                        :model-value="conditionTrait(child)"
                        :options="traitOptionsForCondition(child)"
                        option-label="label"
                        option-value="value"
                        @update:model-value="value => updateConditionTrait(index, value)"
                    />
                    <InputText
                        v-else
                        :model-value="$t('auth.permissionTraits.path')"
                        disabled
                    />
                    <Select
                        :model-value="child.operator"
                        :options="conditionOperatorOptions"
                        option-label="label"
                        option-value="value"
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
                        class="w-full"
                        :loading="entityOptionsLoading"
                        :placeholder="$t('auth.permissionSelectValues')"
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
                        class="w-full"
                        :loading="entityOptionsLoading"
                        :placeholder="$t('auth.permissionSelectValue')"
                        @update:model-value="value => updateChild(index, { ...child, value })"
                    />
                    <InputText
                        v-else
                        :model-value="child.value"
                        :placeholder="child.operator === 'exists' ? $t('auth.permissionBooleanValue') : $t('auth.permissionConditionValue')"
                        @update:model-value="value => updateChild(index, { ...child, value })"
                    />
                    <label class="flex items-center gap-2">
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
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';

defineOptions({ name: 'PermissionRuleBuilder' });

const props = defineProps({
    modelValue: { type: Object, default: null },
    depth: { type: Number, default: 0 },
    gateOptions: { type: Array, required: true },
    subjectOptions: { type: Array, required: true },
    entityTypeOptions: { type: Array, required: true },
    conditionOperatorOptions: { type: Array, required: true },
    entityOptionsLoading: { type: Boolean, default: false },
    traitOptionsForCondition: { type: Function, required: true },
    conditionSubject: { type: Function, required: true },
    conditionEntityType: { type: Function, required: true },
    conditionEntityTypeLabel: { type: Function, required: true },
    conditionTrait: { type: Function, required: true },
    patchConditionSubject: { type: Function, required: true },
    patchConditionEntityType: { type: Function, required: true },
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

function updateConditionEntityType(index, entityType) {
    updateChild(index, props.patchConditionEntityType(node.value.children[index], entityType));
}

function updateConditionTrait(index, trait) {
    updateChild(index, props.patchConditionTrait(node.value.children[index], trait));
}
</script>
