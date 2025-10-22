<template>
    <DialogWrapper @close="$emit('close')">
        <div class="p-6">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">Upload Table Wizard</h3>

            <div v-if="uploadStatus === 'idle' || uploadStatus === 'uploading'" class="mt-4">
                <h4 class="text-md font-medium">Step 1: Upload CSV File</h4>
                <input type="file" @change="handleFileUpload" accept=".csv" class="mt-2 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                <div v-if="uploadStatus === 'uploading'" class="mt-2">Uploading...</div>
            </div>

            <div v-if="uploadStatus === 'mapping'" class="mt-4">
                <h4 class="text-md font-medium">Step 2: Map Columns</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">Map your CSV columns to the required table columns.</p>
                <div v-for="reqCol in requiredHeaders" :key="reqCol" class="grid grid-cols-2 gap-4 mt-2 items-center">
                    <label class="font-medium">{{ reqCol }}</label>
                    <select v-model="mappings[reqCol]" class="p-2 border rounded-md bg-gray-100 dark:bg-gray-700 w-full">
                        <option v-for="detCol in detectedHeaders" :key="detCol" :value="detCol">{{ detCol }}</option>
                    </select>
                </div>
                <MainButton @click="submitMappings" label="Validate & Import" :theme="'primary'" :size="'m'" class="mt-4 w-full" />
            </div>

            <div v-if="uploadStatus === 'error'" class="mt-4">
                <h4 class="text-md font-medium text-red-600">Error</h4>
                <p class="text-sm text-red-500">There was an error during the process.</p>
                <pre class="mt-2 p-2 text-xs bg-red-100 text-red-800 rounded-md">{{ validationErrors }}</pre>
            </div>
        </div>
    </DialogWrapper>
</template>

<script setup>
import { ref } from 'vue';
import { tablesStore } from '~/composables/tables';
import DialogWrapper from './DialogWrapper.vue';
import MainButton from './MainButton.vue';

const props = defineProps({
    projectSlug: {
        type: String,
        required: true,
    },
});

const emit = defineEmits(['close']);

const { getters, actions } = tablesStore;
const { uploadStatus, detectedHeaders, requiredHeaders, validationErrors, tables } = getters;
const { uploadTable, mapAndValidateTable } = actions;

const mappings = ref({});

const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
        uploadTable(props.projectSlug, file);
    }
};

const submitMappings = () => {
    const pendingTable = tables.value.find(t => t.status === 'pending_mapping');
    if (pendingTable) {
        mapAndValidateTable(pendingTable._id, mappings.value);
    }
};

</script>
