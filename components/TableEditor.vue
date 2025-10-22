<template>
    <div class="mt-8">
        <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">Table Editor</h3>
        <div v-if="!selectedTable" class="text-center text-gray-500 dark:text-gray-400 py-4">
            Select a table to view its content.
        </div>
        <div v-else>
            <div ref="tabulator" class="mt-4"></div>
            <div class="mt-4 flex justify-end space-x-2">
                <MainButton @click="addRow" label="Add Row" :theme="'secondary'" :size="'m'" />
                <MainButton @click="saveChanges" label="Save Changes" :theme="'primary'" :size="'m'" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, toRefs } from 'vue';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import '~/assets/css/tabulator-theme.css';
import { tablesStore } from '~/composables/tables';
import { tableSchema } from '~/server/schemas/table.js';
import MainButton from './MainButton.vue';

const { getters: tableGetters, actions: tableActions } = tablesStore;
const { selectedTable } = toRefs(tableGetters);

const tabulator = ref(null);
const tabulatorInstance = ref(null);

const tableColumns = tableSchema.columns.map(col => ({
    title: col.name,
    field: col.name,
    editor: "input",
    headerFilter: "input",
}));

const initializeTabulator = (table) => {
    if (tabulator.value && table) {
        tabulatorInstance.value = new Tabulator(tabulator.value, {
            data: table.data || [],
            columns: tableColumns,
            layout: "fitColumns",
            pagination: "local",
            paginationSize: 10,
            dataLoaded: function(data) {
                if (this.getPageMax() <= 1) {
                    this.element.querySelector('.tabulator-footer').style.display = 'none';
                } else {
                    this.element.querySelector('.tabulator-footer').style.display = 'block';
                }
            },
        });
    }
};

onMounted(() => {
    if (selectedTable.value) {
        initializeTabulator(selectedTable.value);
    }
});

watch(selectedTable, async (newTable) => {
    if (newTable) {
        if (!tabulatorInstance.value) {
            await nextTick();
            initializeTabulator(newTable);
        } else {
            tabulatorInstance.value.setData(newTable.data || []);
        }
    } else {
        if (tabulatorInstance.value) {
            tabulatorInstance.value.destroy();
            tabulatorInstance.value = null;
        }
    }
});

const addRow = () => {
    if (tabulatorInstance.value) {
        tabulatorInstance.value.addRow({});
    }
};

const saveChanges = async () => {
    if (!tabulatorInstance.value || !selectedTable.value) return;

    const updatedData = tabulatorInstance.value.getData();
    const tableId = selectedTable.value._id;
    const projectId = selectedTable.value.projectId;

    try {
        const updatedTable = await $fetch(`/api/tables/${tableId}`, {
            method: 'PUT',
            body: { data: updatedData },
        });
        tableActions.updateTable(updatedTable);
    } catch (error) {
        console.error('Failed to save table data:', error);
    }
};
</script>
