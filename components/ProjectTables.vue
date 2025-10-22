<template>
    <div class="project-tables">
        <div class="project-tables__tabs">
            <span v-for="table in tables" :key="table._id" 
                  @click="selectTable(table._id)"
                  :class="['project-tables__tab', { 
                      'project-tables__tab--active': selectedTable && selectedTable._id === table._id
                  }]">
                {{ table.name }}
            </span>
        </div>
        
        <div class="project-tables__actions">
            <MainButton @click="showUploadWizard = true" label="Upload Table" :theme="themeType.primary" :size="sizeType.m" />
            <MainButton @click="showCreateForm = true" label="Create Table" :theme="themeType.secondary" :size="sizeType.m" />
            <MainButton v-if="selectedTable" @click="handleDeleteTable" label="Delete Table" :theme="themeType.ghost" :size="sizeType.m" />
        </div>

        <div v-if="showCreateForm" class="project-tables__form">
            <input type="text" v-model="newTableName" placeholder="New table name" class="project-tables__input"/>
            <div class="project-tables__form-actions">
                <MainButton @click="showCreateForm = false" label="Cancel" :theme="themeType.secondary" :size="sizeType.s" />
                <MainButton @click="handleCreateTable" label="Create" :theme="themeType.primary" :size="sizeType.s" />
            </div>
        </div>
        <TableUploadWizard v-if="showUploadWizard" @close="showUploadWizard = false" :project-slug="projectSlug" />
    </div>
</template>

<script setup>
import { ref, onMounted, computed, toRefs } from 'vue';
import { tablesStore } from '~/composables/tables';
import { themeType } from '~/constants/theme.constants';
import { sizeType } from '~/constants/size.constants';
import TableUploadWizard from './TableUploadWizard.vue';
import MainButton from './MainButton.vue';

const props = defineProps({
    projectSlug: {
        type: String,
        required: true,
    },
});

const { getters, actions } = tablesStore;
const { tables, selectedTable } = toRefs(getters);
const { selectTable, createTable, deleteTable } = actions;

const showUploadWizard = ref(false);
const showCreateForm = ref(false);
const newTableName = ref('');

const handleCreateTable = () => {
    if (newTableName.value) {
        createTable(props.projectSlug, newTableName.value);
        newTableName.value = '';
        showCreateForm.value = false;
    }
};

const handleDeleteTable = async () => {
    if (selectedTable.value && confirm(`Delete table "${selectedTable.value.name}"?`)) {
        await deleteTable(selectedTable.value._id);
    }
};
</script>

<style lang="scss" scoped>
.project-tables {
    $self: &;

    &__tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        overflow-x: auto;
    }

    &__tab {
        white-space: nowrap;
        cursor: pointer;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 14px;
        background-color: var(--fill-secondary);
        color: var(--label-secondary);
        transition: all 0.2s;

        &:hover {
            background-color: var(--fill-tertiary);
        }

        &--active {
            background-color: var(--accent-primary);
            color: var(--background-primary);
        }
    }

    &__actions {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        flex-wrap: wrap;
    }

    &__form {
        padding: 16px;
        background-color: var(--fill-secondary);
        border-radius: 8px;
        margin-bottom: 16px;
    }

    &__input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--separator-primary);
        border-radius: 8px;
        background-color: var(--background-primary);
        color: var(--label-primary);
        font-size: 14px;
        margin-bottom: 8px;
    }

    &__form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }
}
</style>
