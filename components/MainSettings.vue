<template>
    <div class="settings">
        <MainTitle :label="$t('nesting.settings')" class="settings__title" />
        <div class="settings__content content">
            <div class="content__size size">
                <div class="size__line">
                    <InputField :prefix="$t('nesting.plateWidth')[0]" suffix="mm" v-model="localWidth" class="size__input" />
                    <InputField :prefix="$t('nesting.plateHeight')[0]" suffix="mm" v-model="localHeight" class="size__input" />
                </div>
                <InputField :prefix="$t('nesting.spacing')" suffix="mm" v-model="localSpace" class="size__input" />
                <InputField :prefix="$t('nesting.sheetCount')" :suffix="$t('common.units')" v-model="localSheetCount" class="size__input" />
                
                <div class="size__checkbox">
                    <label>
                        <input type="checkbox" v-model="localUseTable" />
                        {{ $t('nesting.useTable') }}
                    </label>
                </div>

                <div v-if="localUseTable" class="size__selectors">
                    <select v-model="localTableId" class="size__select">
                        <option :value="null">{{ $t('nesting.selectTable') }}</option>
                        <option v-for="table in tables" :key="table._id" :value="table._id">
                            {{ table.name }}
                        </option>
                    </select>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { tablesStore } from '~/composables/tables';
import { cassettesStore } from '~/composables/cassettes';

const { getters, actions } = filesStore;
const { updateParams } = actions;
const params = computed(() => getters.params);

const { getters: tablesGetters } = tablesStore;
const tables = computed(() => tablesGetters.tables);

const { getters: cassettesGetters } = cassettesStore;
const cassettes = computed(() => cassettesGetters.cassettes);

const localWidth = computed({
    get: () => unref(params).widthPlate,
    set: value => updateParams({ widthPlate: value }),
});

const localHeight = computed({
    get: () => unref(params).heightPlate,
    set: value => updateParams({ heightPlate: value }),
});

const localSheetCount = computed({
    get: () => unref(params).sheetCount,
    set: value => updateParams({ sheetCount: value })
});

const localSpace = computed({
    get: () => unref(params).space,
    set: value => updateParams({ space: value }),
});

const localUseTable = computed({
    get: () => unref(params).useTable,
    set: value => updateParams({ useTable: value }),
});

const localTableId = computed({
    get: () => unref(params).tableId,
    set: value => updateParams({ tableId: value }),
});

const localCassetteId = computed({
    get: () => unref(params).cassetteId,
    set: value => updateParams({ cassetteId: value }),
});
</script>

<style lang="scss" scoped>
.settings {
    text-align: center;

    &__title {
        margin-bottom: 16px;
    }

    &__content {
        width: 320px;
        margin-left: auto;
        margin-right: auto;
    }

}

.content {
    display: flex;
    justify-content: center;

    &__size {
        width: 221px;
    }
}

.size {
    &>*:not(:last-child) {
        margin-bottom: 8px;
    }

    &__line {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    &__input {
        flex-grow: 1;
        min-width: 80px;
    }

    &__checkbox {
        margin-top: 12px;
        padding: 8px;
        
        label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            color: var(--label-primary);
            
            input[type="checkbox"] {
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
        }
    }

    &__selectors {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
    }

    &__select {
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid var(--separator-primary);
        background-color: var(--background-primary);
        color: var(--label-primary);
        font-size: 14px;
        cursor: pointer;
        
        &:focus {
            outline: none;
            border-color: var(--accent-primary);
        }
    }
}
</style>
