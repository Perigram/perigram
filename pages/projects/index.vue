<template>
    <div class="flex flex-col gap-6">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div class="flex items-center gap-4">
                <h1 class="m-0 text-2xl font-bold">{{ $t('nav.projects') }}</h1>
                <Button
                    :label="$t('project.create')"
                    icon="pi pi-plus"
                    @click="showCreateDialog = true"
                />
            </div>

            <div class="flex flex-wrap items-center gap-3">
                <IconField class="min-w-[200px]">
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
        </div>

        <div
            v-if="loading"
            class="flex items-center justify-center py-20"
        >
            <ProgressSpinner />
        </div>

        <div
            v-else-if="!projects || projects.length === 0"
            class="text-center py-20 border border-dashed rounded italic opacity-50"
        >
            <i class="pi pi-inbox text-6xl mb-4"></i>
            <p>{{ $t('projects.noProjects') }}</p>
            <Button
                :label="$t('projects.createFirst')"
                icon="pi pi-plus"
                @click="showCreateDialog = true"
            />
        </div>

        <DataView
            v-else
            :value="filteredProjects"
            layout="grid"
            :paginator="filteredProjects.length > 12"
            :rows="12"
            dataKey="id"
            :loading="loading"
        >
            <template #grid="slotProps">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-2">
                    <ProjectCard
                        v-for="project in slotProps.items"
                        :key="project.slug"
                        :project="project"
                        variant="card"
                        @view="navigateToProject"
                        @edit="editProject"
                        @delete="confirmDeleteProject"
                    />
                </div>
            </template>
        </DataView>

        <!-- Create/Edit Project Dialog -->
        <Dialog
            v-model:visible="showCreateDialog"
            :header="editingProject ? $t('project.edit') : $t('project.create')"
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
                    @click="closeDialog"
                />
                <Button
                    :label="editingProject ? $t('common.save') : $t('common.create')"
                    :loading="creating"
                    @click="editingProject ? saveProject() : createProject()"
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
    import ProjectCard from '~/components/entities/Project/ProjectCard.vue'
    import { useGlobalStore } from '~/stores/global'
    import { storeToRefs } from 'pinia'
    import { useToast } from 'primevue/usetoast'

    definePageMeta({
        layout: 'app',
        middleware: 'auth',
    })

    const { t } = useI18n()
    const router = useRouter()
    const globalStore = useGlobalStore()
    const toast = useToast()
    const { projectsList } = storeToRefs(globalStore)
    
    const projects = projectsList
    const loading = ref(true)
    const searchQuery = ref('')
    const sortBy = ref('date-desc')
    const viewMode = ref('grid')

    const showCreateDialog = ref(false)
    const newProjectName = ref('')
    const creating = ref(false)
    const editingProject = ref(null)

    const sortOptions = computed(() => [
        { label: t('projects.sortNewest'), value: 'date-desc' },
        { label: t('projects.sortOldest'), value: 'date-asc' },
        { label: t('projects.sortNameAZ'), value: 'name-asc' },
        { label: t('projects.sortNameZA'), value: 'name-desc' },
    ])

    const viewModes = computed(() => [
        { label: t('assets.viewModes.grid'), value: 'grid', icon: 'pi pi-th-large' },
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

    const navigateToProject = (project) => {
        const slug = project.identity?.slug || project.slug
        router.push(`/project/${slug}`)
    }

    const editProject = (project) => {
        editingProject.value = project
        newProjectName.value = project.identity?.name || project.name || ''
        showCreateDialog.value = true
    }

    const closeDialog = () => {
        showCreateDialog.value = false
        editingProject.value = null
        newProjectName.value = ''
    }

    const saveProject = async () => {
        if (!newProjectName.value.trim()) return
        creating.value = true
        try {
            const slug = editingProject.value.identity?.slug || editingProject.value.slug
            await $fetch(`/api/project/${slug}`, {
                method: 'PATCH',
                body: { name: newProjectName.value.trim() },
            })
            await globalStore.getProjects()
            closeDialog()
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('project.updated'), life: 3000 })
        } catch (error) {
            console.error('Failed to update project:', error)
            toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 })
        } finally {
            creating.value = false
        }
    }

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
            toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 })
        } finally {
            creating.value = false
        }
    }

    const confirmDeleteProject = async (project) => {
        if (confirm(t('project.confirmDelete'))) {
            try {
                const slug = project.identity?.slug || project.slug
                await $fetch(`/api/project/${slug}`, {
                    method: 'DELETE',
                })
                await globalStore.getProjects()
                toast.add({ severity: 'success', summary: t('common.success'), detail: t('project.deleted'), life: 3000 })
            } catch (error) {
                console.error('Failed to delete project:', error)
                toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 })
            }
        }
    }
</script>