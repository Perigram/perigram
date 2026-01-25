<template>
    <div class="p-4 md:p-6 lg:p-8 flex flex-col gap-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 class="text-2xl font-bold">{{ $t('nav.projects') }}</h1>
            <div class="flex gap-2">
                <Button
                    :label="$t('project.create')"
                    icon="pi pi-plus"
                    @click="showCreateDialog = true"
                />
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 p-3">
            <IconField class="flex-1 min-w-[200px]">
                <InputIcon class="pi pi-search" />
                <InputText
                    v-model="searchQuery"
                    :placeholder="$t('common.search')"
                    class="w-full"
                />
            </IconField>

            <Select
                v-model="sortBy"
                :options="sortOptions"
                optionLabel="label"
                optionValue="value"
                :placeholder="$t('projects.sortBy')"
                class="min-w-[180px]"
            />

            <SelectButton
                v-model="viewMode"
                :options="viewModes"
                optionLabel="label"
                optionValue="value"
                class="hidden md:inline-flex"
            >
                <template #option="slotProps">
                    <i :class="slotProps.option.icon"></i>
                </template>
            </SelectButton>
        </div>

        <div
            v-if="loading"
            class="flex items-center justify-center py-20"
        >
            <ProgressSpinner />
        </div>

        <div
            v-else-if="!projects || projects.length === 0"
            class="text-center py-20 px-6 border-2 border-dashed rounded-xl"
        >
            <i class="pi pi-inbox text-6xl mb-4 opacity-50"></i>
            <p class="text-xl font-medium mb-6">{{ $t('projects.noProjects') }}</p>
            <Button
                :label="$t('projects.createFirst')"
                icon="pi pi-plus"
                @click="showCreateDialog = true"
                size="large"
            />
        </div>

        <DataView
            v-else
            :value="filteredProjects"
            :layout="viewMode"
            :paginator="filteredProjects.length > 12"
            :rows="12"
            dataKey="id"
            :loading="loading"
        >
            <template #grid="slotProps">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-2">
                    <ProjectView
                        v-for="project in slotProps.items"
                        :key="project.slug"
                        :project="project"
                        variant="card"
                    />
                </div>
            </template>

            <template #list="slotProps">
                <div class="flex flex-col gap-4 pt-2">
                    <ProjectView
                        v-for="project in slotProps.items"
                        :key="project.slug"
                        :project="project"
                        variant="compact"
                    />
                </div>
            </template>
        </DataView>

        <!-- Create Project Dialog -->
        <Dialog
            v-model:visible="showCreateDialog"
            :header="$t('project.create')"
            modal
            :style="{ width: '95vw', maxWidth: '500px' }"
        >
            <div class="py-4">
                <div class="flex flex-col gap-2">
                    <label for="projectName" class="font-medium">{{ $t('project.name') }}</label>
                    <InputText
                        id="projectName"
                        v-model="newProjectName"
                        :placeholder="$t('projects.enterName')"
                        class="w-full"
                        autofocus
                    />
                </div>
            </div>
            <template #footer>
                <Button
                    :label="$t('common.cancel')"
                    text
                    severity="secondary"
                    @click="showCreateDialog = false"
                />
                <Button
                    :label="$t('common.create')"
                    :loading="creating"
                    @click="createProject"
                />
            </template>
        </Dialog>
    </div>
</template>

<script setup>
    import { ref, computed, onMounted } from 'vue'
    import DataView from 'primevue/dataview'
    import Button from 'primevue/button'
    import InputText from 'primevue/inputtext'
    import Select from 'primevue/select'
    import SelectButton from 'primevue/selectbutton'
    import Dialog from 'primevue/dialog'
    import ProgressSpinner from 'primevue/progressspinner'
    import IconField from 'primevue/iconfield'
    import InputIcon from 'primevue/inputicon'
    import ProjectView from '~/components/entities/Project/ProjectView.vue'
    import { useGlobalStore } from '~/stores/global'
    import { storeToRefs } from 'pinia'

    definePageMeta({
        layout: 'app',
        middleware: 'auth',
    })

    const { t } = useI18n()
    const router = useRouter()
    const globalStore = useGlobalStore()
    const { projectsList } = storeToRefs(globalStore)
    
    const projects = projectsList
    const loading = ref(true)
    const searchQuery = ref('')
    const sortBy = ref('date-desc')
    const viewMode = ref('grid')

    const showCreateDialog = ref(false)
    const newProjectName = ref('')
    const creating = ref(false)

    const sortOptions = computed(() => [
        { label: t('projects.sortNewest'), value: 'date-desc' },
        { label: t('projects.sortOldest'), value: 'date-asc' },
        { label: t('projects.sortNameAZ'), value: 'name-asc' },
        { label: t('projects.sortNameZA'), value: 'name-desc' },
    ])

    const viewModes = computed(() => [
        { label: t('assets.viewModes.grid'), value: 'grid', icon: 'pi pi-th-large' },
        { label: t('assets.viewModes.list'), value: 'list', icon: 'pi pi-list' },
    ])

    const filteredProjects = computed(() => {
        if (!projects.value) return []

        let filtered = [...projects.value]

        // Search filter
        if (searchQuery.value) {
            const query = searchQuery.value.toLowerCase()
            filtered = filtered.filter(
                (p) => p.name?.toLowerCase().includes(query) || p.identity?.name?.toLowerCase().includes(query) || p.identity?.slug?.toLowerCase().includes(query),
            )
        }

        // Sort
        filtered.sort((a, b) => {
            const nameA = a.identity?.name || a.name || ''
            const nameB = b.identity?.name || b.name || ''
            switch (sortBy.value) {
                case 'date-desc':
                    return new Date(b.createdAt) - new Date(a.createdAt)
                case 'date-asc':
                    return new Date(a.createdAt) - new Date(b.createdAt)
                case 'name-asc':
                    return nameA.localeCompare(nameB)
                case 'name-desc':
                    return nameB.localeCompare(nameA)
                default:
                    return 0
            }
        })

        return filtered
    })

    onMounted(async () => {
        loading.value = true
        await globalStore.getProjects()
        loading.value = false
    })

    const createProject = async () => {
        creating.value = true
        try {
            const data = await $fetch('/api/project', {
                method: 'POST',
            })

            if (newProjectName.value.trim()) {
                await $fetch(`/api/project/${data.slug}`, {
                    method: 'PATCH',
                    body: { name: newProjectName.value.trim() },
                })
            }

            showCreateDialog.value = false
            newProjectName.value = ''

            await globalStore.getProjects()
            router.push(`/project/${data.slug}`)
        } catch (error) {
            console.error('Failed to create project:', error)
        } finally {
            creating.value = false
        }
    }
</script>