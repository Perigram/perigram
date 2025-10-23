<template>
    <div class="table-editor">
        <div v-if="!selectedTable" class="table-editor__empty">
            {{ $t('table.selectTable') }}
        </div>
        <div v-else class="table-editor__content">
            <div ref="tabulator" class="table-editor__tabulator"></div>
            <div class="table-editor__actions">
                <MainButton @click="addRow" :label="$t('table.addRow')" :theme="themeType.secondary" :size="sizeType.m" />
                <MainButton @click="saveChanges" :label="$t('table.saveChanges')" :theme="themeType.primary" :size="sizeType.m" />
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
import { themeType } from '~/constants/theme.constants';
import { sizeType } from '~/constants/size.constants';
import MainButton from './MainButton.vue';

const { getters: tableGetters, actions: tableActions } = tablesStore;
const { selectedTable } = toRefs(tableGetters);

const tabulator = ref(null);
const tabulatorInstance = ref(null);

const tableColumns = tableSchema.columns.map((col, index) => {
    const baseColumn = {
        title: col.name,
        field: col.field,
        editor: "input",
        headerFilter: "input",
    };
    
    // Set widths for specific columns
    if (col.name === 'Type') {
        baseColumn.minWidth = 150;
    } else if (col.name === 'Amount') {
        baseColumn.width = 100;
    } else if (col.name === 'Rotation') {
        baseColumn.width = 100;
    } else {
        baseColumn.width = 80;
    }
    
    return baseColumn;
});

const initializeTabulator = (table) => {
    if (tabulator.value && table) {
        const dataLength = (table.data || []).length;
        
        // Destroy any existing instance
        if (tabulatorInstance.value) {
            tabulatorInstance.value.destroy();
        }
        
        tabulatorInstance.value = new Tabulator(tabulator.value, {
            data: table.data || [],
            columns: tableColumns,
            pagination: dataLength > 10,
            paginationSize: 10,
            autoColumns: false,
            headerVisible: true,
            columnHeaderVertAlign: "middle",
            renderHorizontal: "virtual",
            layout: "fitColumns",
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
        if (tabulatorInstance.value) {
            tabulatorInstance.value.destroy();
            tabulatorInstance.value = null;
        }
        await nextTick();
        initializeTabulator(newTable);
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

<style lang="scss" scoped>
.table-editor {
    $self: &;

    &__empty {
        text-align: center;
        color: var(--label-tertiary);
        padding: 24px;
    }

    &__content {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    &__tabulator {
        width: 100%;
        overflow-x: auto;
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }
}
</style>
