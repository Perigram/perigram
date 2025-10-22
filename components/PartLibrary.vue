<template>
    <div class="mt-8">
        <div class="flex justify-between items-center">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">Your Parts</h3>
            <MainButton @click="showAddPart = true" label="Add New Part" :theme="'primary'" :size="'m'" />
        </div>
        <div class="mt-4">
            <ul class="divide-y divide-gray-200 dark:divide-gray-700">
                <li v-for="part in parts" :key="part._id" class="flex items-center justify-between py-2">
                    <span>{{ part.name }}</span>
                    <MainButton @click="deletePart(part._id)" :theme="'ghost'" :icon="'trash'" :size="'s'" />
                </li>
            </ul>
        </div>
        <DialogWrapper v-if="showAddPart" @close="showAddPart = false">
            <div class="p-6">
                <h4 class="text-lg font-medium">Add New Part</h4>
                <input type="text" v-model="newPartName" placeholder="Part Name" class="w-full p-2 mt-4 border rounded-md bg-white dark:bg-gray-700"/>
                <textarea v-model="newPartSvg" placeholder="SVG Content" class="w-full p-2 mt-2 border rounded-md bg-white dark:bg-gray-700"></textarea>
                <div class="mt-4 flex justify-end space-x-2">
                    <MainButton @click="showAddPart = false" label="Cancel" :theme="'secondary'" :size="'s'" />
                    <MainButton @click="saveNewPart" label="Save" :theme="'primary'" :size="'s'" />
                </div>
            </div>
        </DialogWrapper>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { partsStore } from '~/composables/parts';
import MainButton from './MainButton.vue';
import DialogWrapper from './DialogWrapper.vue';

const { getters, actions } = partsStore;
const { parts } = getters;
const { fetchParts, createPart, deletePart } = actions;

const showAddPart = ref(false);
const newPartName = ref('');
const newPartSvg = ref('');

onMounted(() => {
    fetchParts();
});

const saveNewPart = () => {
    if (newPartName.value && newPartSvg.value) {
        createPart(newPartName.value, newPartSvg.value);
        showAddPart.value = false;
        newPartName.value = '';
        newPartSvg.value = '';
    }
};
</script>
