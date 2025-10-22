<template>
    <div class="mt-8">
        <div class="flex items-center space-x-2 mb-4 overflow-x-auto">
            <span v-for="table in tables" :key="table._id" 
                  @click="selectTable(table._id)"
                  :class="['whitespace-nowrap cursor-pointer px-3 py-1 rounded-full text-sm', { 
                      'bg-indigo-600 text-white': selectedTable && selectedTable._id === table._id, 
                      'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200': !selectedTable || selectedTable._id !== table._id 
                  }]">
                {{ table.name }}
            </span>
        </div>
        
        <div class="mt-4 grid grid-cols-2 gap-4">
            <MainButton @click="showUploadWizard = true" label="Upload Table" :theme="'primary'" :size="'m'" />
            <MainButton @click="showCreateForm = true" label="Create Table" :theme="'secondary'" :size="'m'" />
        </div>

        <div v-if="showCreateForm" class="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <input type="text" v-model="newTableName" placeholder="New table name" class="w-full p-2 border rounded-md bg-white dark:bg-gray-700"/>
            <div class="mt-2 flex justify-end space-x-2">
                <MainButton @click="showCreateForm = false" label="Cancel" :theme="'secondary'" :size="'s'" />
                <MainButton @click="handleCreateTable" label="Create" :theme="'primary'" :size="'s'" />
            </div>
        </div>
        <TableUploadWizard v-if="showUploadWizard" @close="showUploadWizard = false" :project-slug="projectSlug" />
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { tablesStore } from '~/composables/tables';
import TableUploadWizard from './TableUploadWizard.vue';
import MainButton from './MainButton.vue';

const props = defineProps({
    projectSlug: {
        type: String,
        required: true,
    },
});

const { getters, actions } = tablesStore;
const { tables, selectedTable } = getters;
const { fetchTables, deleteTable, selectTable, createTable } = actions;

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
</script>
