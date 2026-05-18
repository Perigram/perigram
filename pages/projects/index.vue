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

        <DataView
            v-else
            :value="filteredProjects"
            layout="grid"
            :paginator="filteredProjects.length > 12"
            :rows="12"
            dataKey="_id"
            :loading="loading"
        >
            <template #grid="slotProps">
                <ResponsiveGrid>
                    <ProjectCard
                        v-for="project in slotProps.items"
                        :key="project._id"
                        :project="project"
                        variant="card"
                        @view="navigateToProject"
                        @edit="editProject"
                        @delete="confirmDeleteProject"
                    />
                </ResponsiveGrid>
            </template>
        </DataView>

        <!-- Create/Edit Project Dialog -->
        <StandardDialog
            v-model:visible="showCreateDialog"
            :header="editingProject ? $t('project.edit') : $t('project.create')"
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
                    :label="editingProject ? $t('common.save') : $t('common.create')"
                    :loading="creating"
                    @click="editingProject ? saveProject() : createProject()"
                />
            </template>
        </StandardDialog>
    </StandardPage>
</template>

<script setup>
    import { ref, computed, onMounted } from 'vue'
    import DataView from 'primevue/dataview'
    import Button from 'primevue/button'
    import InputText from 'primevue/inputtext'
    import ProjectCard from '~/components/entities/Project/ProjectCard.vue'
    import StandardDialog from '~/components/shared/StandardDialog.vue'
    import StandardPage from '~/components/shared/StandardPage.vue'
    import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue'
    import StateBlock from '~/components/shared/StateBlock.vue'
    import { useGlobalStore } from '~/stores/global'
    import { storeToRefs } from 'pinia'
    import { useToast } from 'primevue/usetoast'
    import { useEntity } from '~/composables/useEntity'

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

    const editProject = (project) => {
        editingProject.value = project
        newProjectName.value = project.identity?.name || ''
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
            const slug = editingProject.value.identity?.slug
            const { update } = useEntity('project', slug)
            await update({ name: newProjectName.value.trim() })
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
            const { create, update } = useEntity('project')
            const newProject = await create({})

            if (newProjectName.value.trim()) {
                const slug = newProject.identity?.slug
                const { update: updateNew } = useEntity('project', slug)
                await updateNew({ name: newProjectName.value.trim() })
            }

            showCreateDialog.value = false
            newProjectName.value = ''

            await globalStore.getProjects()
            const slug = newProject.identity?.slug
            router.push(`/project/${slug}`)
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
    }
</script>
