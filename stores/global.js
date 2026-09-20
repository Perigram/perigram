import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { statusType } from '~/constants/status.constants';

export const useGlobalStore = defineStore('global', () => {
    const resultsList = ref([]);
    const resultModalData = ref({});
    const screenshotModalData = ref({});
    const fileModalData = ref({});
    const nestDialogData = ref({});
    const needNotification = ref(false);

    const isNesting = computed(() => 
        resultsList.value && resultsList.value.some(item => 
            [statusType.unfinished, statusType.pending].includes(item.status)
        )
    );

    function setResults(results) {
        resultsList.value = [...results];
    }

    function setModalResultData(result) {
        resultModalData.value = { ...result };
    }

    function setModalScreenshotData(result) {
        screenshotModalData.value = result;
    }

    function setModalNestData(result) {
        nestDialogData.value = { ...result };
    }

    function setModalFileData(file) {
        fileModalData.value = { ...file };
    }

    function updateNotification(value) {
        needNotification.value = value;
    }

    return {
        resultsList,
        resultModalData,
        screenshotModalData,
        fileModalData,
        nestDialogData,
        needNotification,
        isNesting,
        setResults,
        setModalFileData,
        setModalResultData,
        setModalScreenshotData,
        updateNotification,
        setModalNestData
    };
});
