<template>
    <StandardPage :title="$t('nav.projects')">
        <template #actions>
            <Button :label="$t('project.create')" icon="pi pi-plus" @click="showCreateDialog = true" />
        </template>

        <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />

        <StateBlock v-else-if="!projects || projects.length === 0" :message="$t('projects.noProjects')" icon="pi pi-inbox">
            <template #actions>
                <Button
                    :label="$t('projects.createFirst')"
                    icon="pi pi-plus"
                    @click="showCreateDialog = true"
                />
            </template>
        </StateBlock>

        <div v-else class="flex flex-col gap-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <InputText
                    v-model="searchQuery"
                    :placeholder="$t('common.search')"
                    class="w-full md:max-w-sm"
                />
                <Select
                    v-model="sortBy"
                    :options="sortOptions"
                    optionLabel="label"
                    optionValue="value"
                    class="w-full md:w-56"
                />
            </div>

            <StateBlock v-if="filteredProjects.length === 0" :message="$t('common.noResults')" icon="pi pi-search" />

            <ResponsiveGrid v-else variant="wide">
                <ProjectIndexCard
                    v-for="project in filteredProjects"
                    :key="project._id"
                    :project="project"
                    :renaming="renamingProjectId === project._id"
                    @view="navigateToProject"
                    @rename="renameProject"
                    @delete="confirmDeleteProject"
                />
            </ResponsiveGrid>
        </div>

        <!-- Create/Edit Project Dialog -->
        <StandardDialog
            v-model:visible="showCreateDialog"
            :header="$t('project.create')"
            size="sm"
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
                    :label="$t('common.create')"
                    :loading="creating"
                    @click="createProject"
                />
            </template>
        </StandardDialog>
        <ConfirmDialog />
    </StandardPage>
</template>

<script setup>
    import { ref, computed, onMounted } from 'vue'
    import Button from 'primevue/button'
    import InputText from 'primevue/inputtext'
    import Select from 'primevue/select'
    import ConfirmDialog from 'primevue/confirmdialog'
    import ProjectIndexCard from '~/components/entities/Project/ProjectIndexCard.vue'
    import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue'
    import StandardDialog from '~/components/shared/StandardDialog.vue'
    import StandardPage from '~/components/shared/StandardPage.vue'
    import StateBlock from '~/components/shared/StateBlock.vue'
    import { useGlobalStore } from '~/stores/global'
    import { storeToRefs } from 'pinia'
    import { useToast } from 'primevue/usetoast'
    import { useConfirm } from 'primevue/useconfirm'
    import { useEntity } from '~/composables/useEntity'

    definePageMeta({
        layout: 'app',
        middleware: 'auth',
    })

    const { t } = useI18n()
    const router = useRouter()
    const globalStore = useGlobalStore()
    const toast = useToast()
    const confirm = useConfirm()
    const { projectsList } = storeToRefs(globalStore)
    
    const projects = projectsList
    const loading = ref(true)
    const searchQuery = ref('')
    const sortBy = ref('date-desc')

    const showCreateDialog = ref(false)
    const newProjectName = ref('')
    const creating = ref(false)
    const renamingProjectId = ref(null)

    const sortOptions = computed(() => [
        { label: t('projects.sortNewest'), value: 'date-desc' },
        { label: t('projects.sortOldest'), value: 'date-asc' },
        { label: t('projects.sortNameAZ'), value: 'name-asc' },
        { label: t('projects.sortNameZA'), value: 'name-desc' },
    ])

    const filteredProjects = computed(() => {
        if (!projects.value) return []

        let filtered = [...projects.value]

        // Search filter
        if (searchQuery.value) {
            const query = searchQuery.value.toLowerCase()
            filtered = filtered.filter(
                (p) => p.identity?.name?.toLowerCase().includes(query) || p.identity?.slug?.toLowerCase().includes(query),
            )
        }

        // Sort
        filtered.sort((a, b) => {
            const nameA = a.identity?.name || ''
            const nameB = b.identity?.name || ''
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
        const slug = project.identity?.slug
        router.push(`/project/${slug}`)
    }

    const closeDialog = () => {
        showCreateDialog.value = false
        newProjectName.value = ''
    }

    const renameProject = async (project, name, close) => {
        if (!name.trim()) return
        renamingProjectId.value = project._id
        try {
            const slug = project.identity?.slug
            const { update } = useEntity('project', slug)
            await update({ name: name.trim() })
            await globalStore.getProjects()
            close?.()
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('project.updated'), life: 3000 })
        } catch (error) {
            console.error('Failed to update project:', error)
            toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 })
        } finally {
            renamingProjectId.value = null
        }
    }

    const createProject = async () => {
        creating.value = true
        try {
            const { create } = useEntity('project')
            const newProject = await create({ name: newProjectName.value.trim() || undefined })

            showCreateDialog.value = false
            newProjectName.value = ''

            await globalStore.getProjects()
            const slug = newProject.identity?.slug || newProject.identity?.uid
            router.push(`/project/${slug}`)
        } catch (error) {
            console.error('Failed to create project:', error)
            toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 })
        } finally {
            creating.value = false
        }
    }

    const confirmDeleteProject = async (project) => {
        confirm.require({
            message: t('project.confirmDelete'),
            header: t('common.confirmation'),
            icon: 'pi pi-exclamation-triangle',
            accept: async () => {
                try {
                    const slug = project.identity?.slug
                    const { remove } = useEntity('project', slug)
                    await remove()
                    await globalStore.getProjects()
                    toast.add({ severity: 'success', summary: t('common.success'), detail: t('project.deleted'), life: 3000 })
                } catch (error) {
                    console.error('Failed to delete project:', error)
                    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 })
                }
            }
        })
    }
</script>
