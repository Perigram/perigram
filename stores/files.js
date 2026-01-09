import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { processingType } from '~/constants/files.constants';
import { useGlobalStore } from '~/stores/global';
import { API_ROUTES } from '~/composables/apiRoutes';

export const useFilesStore = defineStore('files', () => {
    const projectFiles = ref(null);
    const projectName = ref('');
    const lastParams = ref('');
    const params = ref({
        widthPlate: '400',
        heightPlate: '560',
        space: '0.1',
        sheetCount: 100,
        useTable: false,
        tableId: null,
        cassetteId: null
    });
    
    // Timer reference for polling
    let updateTimer = null;

    // Getters
    const isSvgLoaded = computed(() => 
        projectFiles.value?.every(file => file.processingStatus !== processingType.inProgress) || false
    );

    const filesStatusDone = computed(() => 
        projectFiles.value?.filter(file => file.processingStatus === processingType.done) || []
    );

    const filesToNest = computed(() => 
        filesStatusDone.value.map(file => ({
            slug: file.slug,
            count: file.count
        }))
    );

    const currentFilesSlug = computed(() => 
        new Set(projectFiles.value?.map(file => file.slug) || [])
    );

    const isValidParams = computed(() => {
        const { widthPlate, heightPlate, space } = params.value;
        return isValidNumber(widthPlate) && isValidNumber(heightPlate) && isValidNumber(space);
    });

    const requestBody = computed(() => 
        JSON.stringify({
            files: filesToNest.value,
            params: {
                width: Number(params.value.widthPlate),
                height: Number(params.value.heightPlate),
                tolerance: Number(params.value.tolerance),
                space: Number(params.value.space),
                sheetCount: Number(params.value.sheetCount),
                useTable: params.value.useTable || false,
                tableId: params.value.tableId,
                cassetteId: params.value.cassetteId
            }
        })
    );

    const filesCount = computed(() => 
        filesStatusDone.value.reduce((acc, curr) => acc + curr.count, 0)
    );

    const isNewParams = computed(() => requestBody.value !== lastParams.value);

    const nestRequestError = computed(() => {
        if (params.value.useTable && !params.value.tableId) {
            return 'Please select a table for nesting.';
        }
        if (!params.value.useTable && filesCount.value < 1) {
            return 'Please select at least one file to nest.';
        }
        if (!isValidParams.value) {
            return 'Please enter valid values for width, height and space.';
        }
        return '';
    });

    // Actions
    function setProjectName(name) {
        projectName.value = name;
    }

    function setProjectFiles(files, path) {
        projectFiles.value = [
            ...files.map((file, fileIndex) => ({
                ...file,
                count: currentFilesSlug.value.has(file.slug)
                    ? projectFiles.value[fileIndex].count
                    : 1
            }))
        ];

        if (updateTimer) {
            clearTimeout(updateTimer);
        }
        if (!isSvgLoaded.value) {
            updateTimer = setTimeout(() => getProject(path), 5000);
        }
    }

    async function getProject(path) {
        try {
            const data = await $fetch(path);
            setProjectFiles(data.files, path);
            setProjectName(data.name);
        } catch (error) {
            console.error('Error fetching project:', error);
            navigateTo("/home");
        }
    }

    async function addFiles(files, slug) {
        const formData = new FormData();
        formData.append('projectName', projectName.value);
        files.forEach((file) => formData.append('dxf', file));
        try {
            await $fetch(API_ROUTES.ADDFILES(slug), {
                method: 'POST',
                body: formData
            });

            await getProject(API_ROUTES.PROJECT(slug));
        } catch (error) {
            console.error('Error while uploading files:', error);
        }
    }

    function isValidNumber(value) {
        return /^\d+([.,]\d+)?$/.test(value);
    }

    function updateParams(newParams) {
        params.value = { ...params.value, ...newParams };
    }

    function increment(index, event) {
        if (!projectFiles.value) return;
        const step = event && event.shiftKey ? 10 : 1;
        if (projectFiles.value[index].count + step <= 999) {
            projectFiles.value[index].count += step;
        } else {
            projectFiles.value[index].count = 999;
        }
    }

    function decrement(index, event) {
        if (!projectFiles.value) return;
        const step = event && event.shiftKey ? 10 : 1;
        if (projectFiles.value[index].count - step >= 0) {
            projectFiles.value[index].count -= step;
        } else {
            projectFiles.value[index].count = 0;
        }
    }

    function updateCount(value, index) {
        if (!projectFiles.value) return;
        if (!isValidNumber(value)) {
             // Logic from original: sets to 999 then 0? seems bugged in original but copying logic intent
             // Original: state.projectFiles[index].count = 999; state.projectFiles[index].count = 0;
             projectFiles.value[index].count = 0;
        } else {
            if (Number(value) > 999) {
                 // Original: sets to 0 then 999
                 projectFiles.value[index].count = 999;
            } else {
                projectFiles.value[index].count = Number(value);
            }
        }
    }

    async function nest(slug) {
        const globalStore = useGlobalStore();
        try {
            try {
                const data = await $fetch(API_ROUTES.NEST(slug), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: requestBody.value
                });
                globalStore.setModalNestData(data);
                
                // Assuming useInfoAboutNest is an auto-imported composable
                const infoAboutNest = useInfoAboutNest();
                if (infoAboutNest) infoAboutNest.value = true;

            } catch (error) {
                if (error?.response?.status === 402) {
                    // Assuming useBuyCreditsDialog is an auto-imported composable
                    const buyCreditsDialog = useBuyCreditsDialog();
                    if (buyCreditsDialog) buyCreditsDialog.value = true;
                    return;
                }
            }

            await Promise.all([globalStore.getProjects()]);

            lastParams.value = requestBody.value;
        } catch (err) {
            console.error('Nest operation failed:', err);
        }
    }

    return {
        projectFiles,
        projectName,
        lastParams,
        params,
        isSvgLoaded,
        filesStatusDone,
        filesToNest,
        currentFilesSlug,
        isValidParams,
        requestBody,
        filesCount,
        isNewParams,
        nestRequestError,
        setProjectName,
        setProjectFiles,
        getProject,
        addFiles,
        updateParams,
        increment,
        decrement,
        updateCount,
        nest
    };
});
