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
                    :filter-target-options="filterTargetOptions"
                    :condition-operator-options="conditionOperatorOptions"
                    :entity-options-loading="entityOptionsLoading"
                    :trait-options-for-target="traitOptionsForTarget"
                    :clause-target="clauseTarget"
                    :clause-trait="clauseTrait"
                    :fact-for-target-trait="factForTargetTrait"
                    :default-trait-for-target="defaultTraitForTarget"
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
                    class="grid grid-cols-1 gap-2 rounded-ui border border-content-border p-2 xl:grid-cols-[12rem_12rem_10rem_minmax(14rem,1fr)_6rem_auto]"
                >
                    <Select
                        :model-value="clauseTarget(child)"
                        :options="filterTargetOptions"
                        option-label="label"
                        option-value="value"
                        @update:model-value="value => updateConditionTarget(index, value)"
                    />
                    <Select
                        v-if="clauseTarget(child) !== 'custom'"
                        :model-value="clauseTrait(child)"
                        :options="traitOptionsForTarget(clauseTarget(child))"
                        option-label="label"
                        option-value="value"
                        @update:model-value="value => updateConditionTrait(index, value)"
                    />
                    <InputText
                        v-else
                        :model-value="child.field"
                        :placeholder="$t('auth.permissionFieldPath')"
                        @update:model-value="value => updateChild(index, { ...child, field: value })"
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
    filterTargetOptions: { type: Array, required: true },
    conditionOperatorOptions: { type: Array, required: true },
    entityOptionsLoading: { type: Boolean, default: false },
    traitOptionsForTarget: { type: Function, required: true },
    clauseTarget: { type: Function, required: true },
    clauseTrait: { type: Function, required: true },
    factForTargetTrait: { type: Function, required: true },
    defaultTraitForTarget: { type: Function, required: true },
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

function updateConditionTarget(index, target) {
    const child = node.value.children[index];
    const trait = props.defaultTraitForTarget(target);
    updateChild(index, {
        ...child,
        fact: props.factForTargetTrait(target, trait),
        field: target === 'custom' ? child.field || '' : '',
        value: ''
    });
}

function updateConditionTrait(index, trait) {
    const child = node.value.children[index];
    const target = props.clauseTarget(child);
    updateChild(index, {
        ...child,
        fact: props.factForTargetTrait(target, trait),
        field: target === 'custom' ? child.field || '' : '',
        value: ''
    });
}
</script>
